#!/usr/bin/env node
import './require-node20.mjs';

import { execFileSync } from 'node:child_process';

function parseArgs(argv) {
  const args = argv.slice(2);
  const read = (flag, fallback = '') => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() : fallback;
  };

  return {
    host: read('--host', 'oracle-free'),
    serviceName: read('--service-name', 'agentic-backend.service'),
    envPath: read('--env-path', '/etc/agentic-backend.env'),
    sqlitePath: read('--sqlite-path', '/home/ubuntu/agentic-runtime/control-plane.sqlite'),
    pageSize: Math.max(100, Math.min(5000, Number.parseInt(read('--page-size', '1000'), 10) || 1000)),
    runLimit: Math.max(100, Math.min(20000, Number.parseInt(read('--run-limit', '5000'), 10) || 5000)),
    sampleLimit: Math.max(1, Math.min(50, Number.parseInt(read('--sample-limit', '10'), 10) || 10)),
    json: args.includes('--json'),
  };
}

function runRemoteScript(host, script) {
  return execFileSync('ssh', [host, 'bash -s'], {
    input: script,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

async function main() {
  const options = parseArgs(process.argv);
  const remoteRaw = runRemoteScript(
    options.host,
    `
set -euo pipefail
python3 - <<'PY'
import json
import sqlite3
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ENV_PATH = ${JSON.stringify(options.envPath)}
SQLITE_PATH = ${JSON.stringify(options.sqlitePath)}
SERVICE_NAME = ${JSON.stringify(options.serviceName)}
PAGE_SIZE = ${JSON.stringify(options.pageSize)}
RUN_LIMIT = ${JSON.stringify(options.runLimit)}
SAMPLE_LIMIT = ${JSON.stringify(options.sampleLimit)}

VARIANT_SELECT_COLUMNS = [
    'id',
    'source_item_id',
    'generation_tier',
    'status',
    'blueprint_id',
    'active_job_id',
    'last_error_code',
    'last_error_message',
    'created_by_user_id',
    'created_at',
    'updated_at',
]

RUN_SELECT_COLUMNS = [
    'id',
    'run_id',
    'user_id',
    'blueprint_id',
    'source_scope',
    'source_tag',
    'video_id',
    'video_url',
    'status',
    'model_primary',
    'model_used',
    'fallback_used',
    'fallback_model',
    'reasoning_effort',
    'quality_ok',
    'quality_issues',
    'quality_retries_used',
    'quality_final_mode',
    'trace_version',
    'summary',
    'error_code',
    'error_message',
    'started_at',
    'finished_at',
    'created_at',
    'updated_at',
]

VARIANT_COMPARE_FIELDS = VARIANT_SELECT_COLUMNS[1:]
RUN_COMPARE_FIELDS = RUN_SELECT_COLUMNS[1:]


def parse_env_file(path):
    env = {}
    with open(path, 'r', encoding='utf-8') as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            env[key.strip()] = value.strip()
    return env


def run_command(args):
    return subprocess.check_output(args, text=True).strip()


def read_service_show(service_name):
    raw = run_command([
        'systemctl',
        'show',
        '-p',
        'ExecMainPID',
        '-p',
        'MemoryCurrent',
        '-p',
        'SubState',
        service_name,
    ])
    result = {}
    for line in raw.splitlines():
        if '=' not in line:
            continue
        key, value = line.split('=', 1)
        result[key] = value
    return result


def normalize_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalize_iso(value):
    text = normalize_text(value)
    if not text:
        return None
    try:
        canonical = text.replace(' ', 'T')
        if canonical.endswith('Z'):
            dt = datetime.fromisoformat(canonical[:-1] + '+00:00')
        else:
            dt = datetime.fromisoformat(canonical)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    except Exception:
        head = text.replace(' ', 'T')
        if '.' not in head:
            return head.replace('+00:00', 'Z')
        prefix, suffix = head.split('.', 1)
        digits = []
        rest = []
        for char in suffix:
            if char.isdigit() and not rest:
                digits.append(char)
                continue
            rest.append(char)
        frac = (''.join(digits) + '000')[:3]
        tail = ''.join(rest).replace('+00:00', 'Z')
        if tail and not tail.startswith(('Z', '+', '-')):
            tail = f'Z{tail}'
        return f"{prefix}.{frac}{tail or 'Z'}"


def normalize_bool(value):
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    lowered = str(value).strip().lower()
    if lowered in ('true', '1', 'yes', 'on'):
        return True
    if lowered in ('false', '0', 'no', 'off'):
        return False
    return None


def normalize_int(value):
    if value is None or value == '':
        return None
    try:
        return int(value)
    except Exception:
        return None


def normalize_json(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return {key: normalize_json(value[key]) for key in sorted(value.keys())}
    if isinstance(value, list):
        return [normalize_json(item) for item in value]
    return value


def normalize_variant_row(row):
    return {
        'id': normalize_text(row.get('id')),
        'source_item_id': normalize_text(row.get('source_item_id')),
        'generation_tier': normalize_text(row.get('generation_tier')),
        'status': normalize_text(row.get('status')),
        'blueprint_id': normalize_text(row.get('blueprint_id')),
        'active_job_id': normalize_text(row.get('active_job_id')),
        'last_error_code': normalize_text(row.get('last_error_code')),
        'last_error_message': normalize_text(row.get('last_error_message')),
        'created_by_user_id': normalize_text(row.get('created_by_user_id')),
        'created_at': normalize_iso(row.get('created_at')),
        'updated_at': normalize_iso(row.get('updated_at')),
    }


def normalize_run_row(row):
    return {
        'id': normalize_text(row.get('id')),
        'run_id': normalize_text(row.get('run_id')),
        'user_id': normalize_text(row.get('user_id')),
        'blueprint_id': normalize_text(row.get('blueprint_id')),
        'source_scope': normalize_text(row.get('source_scope')),
        'source_tag': normalize_text(row.get('source_tag')),
        'video_id': normalize_text(row.get('video_id')),
        'video_url': normalize_text(row.get('video_url')),
        'status': normalize_text(row.get('status')),
        'model_primary': normalize_text(row.get('model_primary')),
        'model_used': normalize_text(row.get('model_used')),
        'fallback_used': normalize_bool(row.get('fallback_used')),
        'fallback_model': normalize_text(row.get('fallback_model')),
        'reasoning_effort': normalize_text(row.get('reasoning_effort')),
        'quality_ok': normalize_bool(row.get('quality_ok')),
        'quality_issues': normalize_json(row.get('quality_issues')),
        'quality_retries_used': normalize_int(row.get('quality_retries_used')),
        'quality_final_mode': normalize_text(row.get('quality_final_mode')),
        'trace_version': normalize_text(row.get('trace_version')),
        'summary': normalize_json(row.get('summary')),
        'error_code': normalize_text(row.get('error_code')),
        'error_message': normalize_text(row.get('error_message')),
        'started_at': normalize_iso(row.get('started_at')),
        'finished_at': normalize_iso(row.get('finished_at')),
        'created_at': normalize_iso(row.get('created_at')),
        'updated_at': normalize_iso(row.get('updated_at')),
    }


def load_oracle_variants(sqlite_path):
    connection = sqlite3.connect(sqlite_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            select
              id,
              source_item_id,
              generation_tier,
              status,
              blueprint_id,
              active_job_id,
              last_error_code,
              last_error_message,
              created_by_user_id,
              created_at,
              updated_at
            from generation_variant_state
            order by updated_at desc, id desc
            """
        ).fetchall()
        return [normalize_variant_row(dict(row)) for row in rows]
    finally:
        connection.close()


def load_oracle_runs(sqlite_path):
    connection = sqlite3.connect(sqlite_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            select
              id,
              run_id,
              user_id,
              blueprint_id,
              source_scope,
              source_tag,
              video_id,
              video_url,
              status,
              model_primary,
              model_used,
              fallback_used,
              fallback_model,
              reasoning_effort,
              quality_ok,
              quality_issues_json,
              quality_retries_used,
              quality_final_mode,
              trace_version,
              summary_json,
              error_code,
              error_message,
              started_at,
              finished_at,
              created_at,
              updated_at
            from generation_run_state
            order by updated_at desc, run_id desc
            limit ?
            """,
            (RUN_LIMIT,),
        ).fetchall()
        normalized = []
        for row in rows:
            raw = dict(row)
            raw['quality_issues'] = json.loads(raw['quality_issues_json']) if raw.get('quality_issues_json') else None
            raw['summary'] = json.loads(raw['summary_json']) if raw.get('summary_json') else None
            normalized.append(normalize_run_row(raw))
        return normalized
    finally:
        connection.close()


def fetch_supabase_variants(supabase_url, service_role_key):
    rows = []
    offset = 0
    encoded_select = urllib.parse.quote(','.join(VARIANT_SELECT_COLUMNS), safe=',*')
    while True:
      url = (
          f"{supabase_url.rstrip('/')}/rest/v1/source_item_blueprint_variants"
          f"?select={encoded_select}"
          f"&order=updated_at.desc,id.desc"
          f"&offset={offset}"
          f"&limit={PAGE_SIZE}"
      )
      request = urllib.request.Request(url)
      request.add_header('apikey', service_role_key)
      request.add_header('Authorization', f'Bearer {service_role_key}')
      request.add_header('Accept', 'application/json')
      with urllib.request.urlopen(request) as response:
          payload = json.loads(response.read().decode('utf-8'))
      batch = [normalize_variant_row(row) for row in payload]
      rows.extend(batch)
      if len(batch) < PAGE_SIZE:
          break
      offset += len(batch)
    return rows


def fetch_supabase_runs(supabase_url, service_role_key):
    rows = []
    offset = 0
    encoded_select = urllib.parse.quote(','.join(RUN_SELECT_COLUMNS), safe=',*')
    while True:
      page_limit = min(PAGE_SIZE, RUN_LIMIT - offset)
      if page_limit <= 0:
          break
      url = (
          f"{supabase_url.rstrip('/')}/rest/v1/generation_runs"
          f"?select={encoded_select}"
          f"&order=updated_at.desc,run_id.desc"
          f"&offset={offset}"
          f"&limit={page_limit}"
      )
      request = urllib.request.Request(url)
      request.add_header('apikey', service_role_key)
      request.add_header('Authorization', f'Bearer {service_role_key}')
      request.add_header('Accept', 'application/json')
      with urllib.request.urlopen(request) as response:
          payload = json.loads(response.read().decode('utf-8'))
      batch = [normalize_run_row(row) for row in payload]
      rows.extend(batch)
      if len(batch) < page_limit:
          break
      offset += len(batch)
    return rows


def compare_rows(left_rows, right_rows, key_field, compare_fields):
    left_map = {row[key_field]: row for row in left_rows if row.get(key_field)}
    right_map = {row[key_field]: row for row in right_rows if row.get(key_field)}
    missing_in_left = sorted([key for key in right_map.keys() if key not in left_map])
    missing_in_right = sorted([key for key in left_map.keys() if key not in right_map])
    mismatches = []
    for key in sorted(set(left_map.keys()).intersection(right_map.keys())):
        left = left_map[key]
        right = right_map[key]
        diff = {}
        for field in compare_fields:
            if left.get(field) != right.get(field):
                diff[field] = {'oracle': left.get(field), 'supabase': right.get(field)}
        if diff:
            mismatches.append({key_field: key, 'diff': diff})
    return {
        'oracle_count': len(left_rows),
        'supabase_count': len(right_rows),
        'missing_in_oracle': missing_in_left,
        'missing_in_supabase': missing_in_right,
        'mismatches': mismatches,
    }


env = parse_env_file(ENV_PATH)
supabase_url = env.get('VITE_SUPABASE_URL') or env.get('SUPABASE_URL') or ''
service_role_key = env.get('SUPABASE_SERVICE_ROLE_KEY') or ''
if not supabase_url or not service_role_key:
    raise SystemExit(json.dumps({
        'ok': False,
        'error': 'Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env file'
    }))

oracle_variants = load_oracle_variants(SQLITE_PATH)
oracle_runs = load_oracle_runs(SQLITE_PATH)
supabase_variants = fetch_supabase_variants(supabase_url, service_role_key)
supabase_runs = fetch_supabase_runs(supabase_url, service_role_key)

variant_result = compare_rows(oracle_variants, supabase_variants, 'id', VARIANT_COMPARE_FIELDS)
run_result = compare_rows(oracle_runs, supabase_runs, 'run_id', RUN_COMPARE_FIELDS)

summary = {
    'ok': True,
    'service': read_service_show(SERVICE_NAME),
    'oracle_generation_state_mode': env.get('ORACLE_GENERATION_STATE_MODE', 'supabase'),
    'variant_result': {
        'oracle_count': variant_result['oracle_count'],
        'supabase_count': variant_result['supabase_count'],
        'missing_in_oracle_count': len(variant_result['missing_in_oracle']),
        'missing_in_supabase_count': len(variant_result['missing_in_supabase']),
        'mismatched_row_count': len(variant_result['mismatches']),
        'missing_in_oracle_sample': variant_result['missing_in_oracle'][:SAMPLE_LIMIT],
        'missing_in_supabase_sample': variant_result['missing_in_supabase'][:SAMPLE_LIMIT],
        'mismatch_sample': variant_result['mismatches'][:SAMPLE_LIMIT],
    },
    'run_result': {
        'oracle_count': run_result['oracle_count'],
        'supabase_count': run_result['supabase_count'],
        'missing_in_oracle_count': len(run_result['missing_in_oracle']),
        'missing_in_supabase_count': len(run_result['missing_in_supabase']),
        'mismatched_row_count': len(run_result['mismatches']),
        'missing_in_oracle_sample': run_result['missing_in_oracle'][:SAMPLE_LIMIT],
        'missing_in_supabase_sample': run_result['missing_in_supabase'][:SAMPLE_LIMIT],
        'mismatch_sample': run_result['mismatches'][:SAMPLE_LIMIT],
        'recent_window_limit': RUN_LIMIT,
    },
}
summary['verdict'] = 'PASS' if (
    summary['variant_result']['oracle_count'] == summary['variant_result']['supabase_count']
    and summary['variant_result']['missing_in_oracle_count'] == 0
    and summary['variant_result']['missing_in_supabase_count'] == 0
    and summary['variant_result']['mismatched_row_count'] == 0
    and summary['run_result']['oracle_count'] == summary['run_result']['supabase_count']
    and summary['run_result']['missing_in_oracle_count'] == 0
    and summary['run_result']['missing_in_supabase_count'] == 0
    and summary['run_result']['mismatched_row_count'] == 0
) else 'FAIL'

print(json.dumps(summary))
PY
`,
  );

  const result = JSON.parse(remoteRaw);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.verdict === 'PASS' ? 0 : 1);
  }

  console.log(`oracle_generation_state_mode=${result.oracle_generation_state_mode}`);
  console.log(`verdict=${result.verdict}`);
  console.log(`service_sub_state=${result.service?.SubState ?? 'unknown'}`);
  console.log(`variant_oracle_count=${result.variant_result.oracle_count}`);
  console.log(`variant_supabase_count=${result.variant_result.supabase_count}`);
  console.log(`variant_missing_in_oracle_count=${result.variant_result.missing_in_oracle_count}`);
  console.log(`variant_missing_in_supabase_count=${result.variant_result.missing_in_supabase_count}`);
  console.log(`variant_mismatched_row_count=${result.variant_result.mismatched_row_count}`);
  console.log(`run_oracle_count=${result.run_result.oracle_count}`);
  console.log(`run_supabase_count=${result.run_result.supabase_count}`);
  console.log(`run_missing_in_oracle_count=${result.run_result.missing_in_oracle_count}`);
  console.log(`run_missing_in_supabase_count=${result.run_result.missing_in_supabase_count}`);
  console.log(`run_mismatched_row_count=${result.run_result.mismatched_row_count}`);
  console.log(`run_recent_window_limit=${result.run_result.recent_window_limit}`);
  process.exit(result.verdict === 'PASS' ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
