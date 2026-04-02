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
    repoDir: read('--repo-dir', '/home/ubuntu/remix-of-stackwise-advisor'),
    envPath: read('--env-path', '/etc/agentic-backend.env'),
    sqlitePath: read('--sqlite-path', '/home/ubuntu/agentic-runtime/control-plane.sqlite'),
    pageSize: Math.max(100, Math.min(5000, Number.parseInt(read('--page-size', '1000'), 10) || 1000)),
    sampleLimit: Math.max(1, Math.min(50, Number.parseInt(read('--sample-limit', '10'), 10) || 10)),
    json: args.includes('--json'),
  };
}

function readJsonSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function runRemoteScript(host, script) {
  return execFileSync('ssh', [host, 'bash -s'], {
    input: script,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function check(name, pass, details = {}) {
  return { name, pass, details };
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
REPO_DIR = ${JSON.stringify(options.repoDir)}
PAGE_SIZE = ${JSON.stringify(options.pageSize)}
SAMPLE_LIMIT = ${JSON.stringify(options.sampleLimit)}

SELECT_COLUMNS = [
    'id',
    'source_item_id',
    'source_page_id',
    'status',
    'estimated_cost',
    'reserved_by_user_id',
    'reservation_expires_at',
    'reserved_ledger_id',
    'auto_unlock_intent_id',
    'blueprint_id',
    'job_id',
    'last_error_code',
    'last_error_message',
    'transcript_status',
    'transcript_attempt_count',
    'transcript_no_caption_hits',
    'transcript_retry_after',
    'updated_at',
]

COMPARE_FIELDS = [
    'id',
    'source_page_id',
    'status',
    'estimated_cost',
    'reserved_by_user_id',
    'reservation_expires_at',
    'reserved_ledger_id',
    'auto_unlock_intent_id',
    'blueprint_id',
    'job_id',
    'last_error_code',
    'last_error_message',
    'transcript_status',
    'transcript_attempt_count',
    'transcript_no_caption_hits',
    'transcript_retry_after',
    'updated_at',
]


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


def normalize_number(value):
    if value is None or value == '':
        return None
    try:
        return round(float(value), 3)
    except Exception:
        return normalize_text(value)


def normalize_int(value):
    if value is None or value == '':
        return 0
    try:
        return int(value)
    except Exception:
        return 0


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


def normalize_row(row):
    return {
        'id': normalize_text(row.get('id')),
        'source_item_id': normalize_text(row.get('source_item_id')),
        'source_page_id': normalize_text(row.get('source_page_id')),
        'status': normalize_text(row.get('status')),
        'estimated_cost': normalize_number(row.get('estimated_cost')),
        'reserved_by_user_id': normalize_text(row.get('reserved_by_user_id')),
        'reservation_expires_at': normalize_iso(row.get('reservation_expires_at')),
        'reserved_ledger_id': normalize_text(row.get('reserved_ledger_id')),
        'auto_unlock_intent_id': normalize_text(row.get('auto_unlock_intent_id')),
        'blueprint_id': normalize_text(row.get('blueprint_id')),
        'job_id': normalize_text(row.get('job_id')),
        'last_error_code': normalize_text(row.get('last_error_code')),
        'last_error_message': normalize_text(row.get('last_error_message')),
        'transcript_status': normalize_text(row.get('transcript_status')),
        'transcript_attempt_count': normalize_int(row.get('transcript_attempt_count')),
        'transcript_no_caption_hits': normalize_int(row.get('transcript_no_caption_hits')),
        'transcript_retry_after': normalize_iso(row.get('transcript_retry_after')),
        'updated_at': normalize_iso(row.get('updated_at')),
    }


def load_oracle_rows(sqlite_path):
    connection = sqlite3.connect(sqlite_path)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute(
            """
            select
              id,
              source_item_id,
              source_page_id,
              status,
              estimated_cost,
              reserved_by_user_id,
              reservation_expires_at,
              reserved_ledger_id,
              auto_unlock_intent_id,
              blueprint_id,
              job_id,
              last_error_code,
              last_error_message,
              transcript_status,
              transcript_attempt_count,
              transcript_no_caption_hits,
              transcript_retry_after,
              updated_at
            from unlock_ledger_state
            order by updated_at desc, id desc
            """
        ).fetchall()
        return [normalize_row(dict(row)) for row in rows]
    finally:
        connection.close()


def fetch_supabase_rows(supabase_url, service_role_key):
    rows = []
    offset = 0
    while True:
        params = urllib.parse.urlencode({
            'select': ','.join(SELECT_COLUMNS),
            'order': 'updated_at.desc,id.desc',
            'limit': PAGE_SIZE,
            'offset': offset,
        })
        request = urllib.request.Request(
            f"{supabase_url.rstrip('/')}/rest/v1/source_item_unlocks?{params}",
            headers={
                'apikey': service_role_key,
                'Authorization': f'Bearer {service_role_key}',
                'Accept': 'application/json',
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode('utf-8'))
        batch = [normalize_row(row) for row in payload]
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += len(batch)
    return rows


def count_statuses(rows):
    counts = {}
    for row in rows:
        key = row.get('status') or 'unknown'
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def count_active(rows):
    return sum(1 for row in rows if row.get('status') in ('reserved', 'processing'))


def build_row_map(rows):
    mapped = {}
    duplicates = []
    for row in rows:
        key = row.get('source_item_id')
        if not key:
            continue
        if key in mapped:
            duplicates.append(key)
            continue
        mapped[key] = row
    return mapped, sorted(set(duplicates))


def sample_row(row):
    return {
        'id': row.get('id'),
        'source_item_id': row.get('source_item_id'),
        'status': row.get('status'),
        'reserved_by_user_id': row.get('reserved_by_user_id'),
        'job_id': row.get('job_id'),
        'blueprint_id': row.get('blueprint_id'),
        'updated_at': row.get('updated_at'),
    }


def compare_rows(oracle_rows, supabase_rows):
    oracle_map, oracle_duplicates = build_row_map(oracle_rows)
    supabase_map, supabase_duplicates = build_row_map(supabase_rows)
    oracle_keys = set(oracle_map.keys())
    supabase_keys = set(supabase_map.keys())

    missing_in_oracle_keys = sorted(supabase_keys - oracle_keys)
    missing_in_supabase_keys = sorted(oracle_keys - supabase_keys)
    mismatch_field_counts = {}
    mismatches = []

    for key in sorted(oracle_keys & supabase_keys):
        oracle_row = oracle_map[key]
        supabase_row = supabase_map[key]
        fields = {}
        for field in COMPARE_FIELDS:
            if oracle_row.get(field) != supabase_row.get(field):
                fields[field] = {
                    'oracle': oracle_row.get(field),
                    'supabase': supabase_row.get(field),
                }
                mismatch_field_counts[field] = mismatch_field_counts.get(field, 0) + 1
        if fields:
            mismatches.append({
                'source_item_id': key,
                'oracle_id': oracle_row.get('id'),
                'supabase_id': supabase_row.get('id'),
                'fields': fields,
            })

    return {
        'oracle_duplicates': oracle_duplicates,
        'supabase_duplicates': supabase_duplicates,
        'missing_in_oracle_keys': missing_in_oracle_keys,
        'missing_in_supabase_keys': missing_in_supabase_keys,
        'mismatch_field_counts': dict(sorted(mismatch_field_counts.items(), key=lambda item: (-item[1], item[0]))),
        'mismatches': mismatches,
        'oracle_map': oracle_map,
        'supabase_map': supabase_map,
    }


def main():
    env = parse_env_file(ENV_PATH)
    supabase_url = env.get('SUPABASE_URL') or env.get('VITE_SUPABASE_URL') or ''
    service_role_key = env.get('SUPABASE_SERVICE_ROLE_KEY') or ''

    oracle_rows = load_oracle_rows(SQLITE_PATH)
    supabase_rows = fetch_supabase_rows(supabase_url, service_role_key) if supabase_url and service_role_key else []
    parity = compare_rows(oracle_rows, supabase_rows)

    result = {
        'sha': run_command(['git', '-C', REPO_DIR, 'rev-parse', 'HEAD']),
        'service_active': run_command(['systemctl', 'is-active', SERVICE_NAME]),
        'service_show': read_service_show(SERVICE_NAME),
        'env': {
            'ORACLE_CONTROL_PLANE_ENABLED': env.get('ORACLE_CONTROL_PLANE_ENABLED'),
            'ORACLE_UNLOCK_LEDGER_MODE': env.get('ORACLE_UNLOCK_LEDGER_MODE'),
            'ORACLE_UNLOCK_LEDGER_BOOTSTRAP_LIMIT': env.get('ORACLE_UNLOCK_LEDGER_BOOTSTRAP_LIMIT'),
            'SUPABASE_URL_SET': bool(supabase_url),
            'SUPABASE_SERVICE_ROLE_KEY_SET': bool(service_role_key),
        },
        'oracle': {
            'row_count': len(oracle_rows),
            'active_count': count_active(oracle_rows),
            'status_counts': count_statuses(oracle_rows),
        },
        'supabase': {
            'row_count': len(supabase_rows),
            'active_count': count_active(supabase_rows),
            'status_counts': count_statuses(supabase_rows),
        },
        'parity': {
            'oracle_duplicate_source_item_ids_count': len(parity['oracle_duplicates']),
            'supabase_duplicate_source_item_ids_count': len(parity['supabase_duplicates']),
            'missing_in_oracle_count': len(parity['missing_in_oracle_keys']),
            'missing_in_supabase_count': len(parity['missing_in_supabase_keys']),
            'mismatched_row_count': len(parity['mismatches']),
            'mismatch_field_counts': parity['mismatch_field_counts'],
            'samples': {
                'missing_in_oracle': [
                    sample_row(parity['supabase_map'][key])
                    for key in parity['missing_in_oracle_keys'][:SAMPLE_LIMIT]
                ],
                'missing_in_supabase': [
                    sample_row(parity['oracle_map'][key])
                    for key in parity['missing_in_supabase_keys'][:SAMPLE_LIMIT]
                ],
                'mismatches': parity['mismatches'][:SAMPLE_LIMIT],
                'oracle_duplicate_source_item_ids': parity['oracle_duplicates'][:SAMPLE_LIMIT],
                'supabase_duplicate_source_item_ids': parity['supabase_duplicates'][:SAMPLE_LIMIT],
            },
        },
    }

    print(json.dumps(result))


main()
PY
`,
  );

  const remote = readJsonSafe(remoteRaw);
  if (!remote) {
    throw new Error('Failed to parse remote unlock parity response.');
  }

  const checks = [
    check(
      'service_active',
      remote.service_active === 'active' && remote.service_show?.SubState === 'running',
      {
        service_active: remote.service_active || null,
        sub_state: remote.service_show?.SubState || null,
      },
    ),
    check(
      'unlock_ledger_mode',
      remote.env?.ORACLE_CONTROL_PLANE_ENABLED === 'true'
        && ['dual', 'primary'].includes(String(remote.env?.ORACLE_UNLOCK_LEDGER_MODE || '')),
      {
        ORACLE_CONTROL_PLANE_ENABLED: remote.env?.ORACLE_CONTROL_PLANE_ENABLED || null,
        ORACLE_UNLOCK_LEDGER_MODE: remote.env?.ORACLE_UNLOCK_LEDGER_MODE || null,
      },
    ),
    check(
      'supabase_credentials_present',
      remote.env?.SUPABASE_URL_SET === true && remote.env?.SUPABASE_SERVICE_ROLE_KEY_SET === true,
      {
        SUPABASE_URL_SET: remote.env?.SUPABASE_URL_SET === true,
        SUPABASE_SERVICE_ROLE_KEY_SET: remote.env?.SUPABASE_SERVICE_ROLE_KEY_SET === true,
      },
    ),
    check(
      'no_duplicate_source_item_ids',
      Number(remote.parity?.oracle_duplicate_source_item_ids_count || 0) === 0
        && Number(remote.parity?.supabase_duplicate_source_item_ids_count || 0) === 0,
      {
        oracle_duplicate_source_item_ids_count: remote.parity?.oracle_duplicate_source_item_ids_count || 0,
        supabase_duplicate_source_item_ids_count: remote.parity?.supabase_duplicate_source_item_ids_count || 0,
      },
    ),
    check(
      'no_missing_in_oracle',
      Number(remote.parity?.missing_in_oracle_count || 0) === 0,
      {
        missing_in_oracle_count: remote.parity?.missing_in_oracle_count || 0,
        bootstrap_limit: Number(remote.env?.ORACLE_UNLOCK_LEDGER_BOOTSTRAP_LIMIT || 0) || null,
        oracle_row_count: remote.oracle?.row_count || 0,
        supabase_row_count: remote.supabase?.row_count || 0,
      },
    ),
    check(
      'no_missing_in_supabase',
      Number(remote.parity?.missing_in_supabase_count || 0) === 0,
      {
        missing_in_supabase_count: remote.parity?.missing_in_supabase_count || 0,
      },
    ),
    check(
      'no_field_mismatches',
      Number(remote.parity?.mismatched_row_count || 0) === 0,
      {
        mismatched_row_count: remote.parity?.mismatched_row_count || 0,
        mismatch_field_counts: remote.parity?.mismatch_field_counts || {},
      },
    ),
  ];

  const verdict = checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL';
  const summary = {
    verdict,
    host: options.host,
    sha: remote.sha || null,
    service_active: remote.service_active || null,
    service_show: remote.service_show || {},
    env: remote.env || {},
    oracle: remote.oracle || {},
    supabase: remote.supabase || {},
    parity: remote.parity || {},
    checks,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    if (verdict !== 'PASS') process.exitCode = 1;
    return;
  }

  console.log('Oracle Unlock Parity Check');
  console.log(`- verdict: ${summary.verdict}`);
  console.log(`- host: ${summary.host}`);
  console.log(`- sha: ${summary.sha ?? 'n/a'}`);
  console.log(`- service_active: ${summary.service_active ?? 'n/a'}`);
  console.log(`- unlock_ledger_mode: ${summary.env.ORACLE_UNLOCK_LEDGER_MODE ?? 'n/a'}`);
  console.log(`- unlock_ledger_bootstrap_limit: ${summary.env.ORACLE_UNLOCK_LEDGER_BOOTSTRAP_LIMIT ?? 'n/a'}`);
  console.log(`- oracle_row_count: ${summary.oracle.row_count ?? 'n/a'}`);
  console.log(`- oracle_active_count: ${summary.oracle.active_count ?? 'n/a'}`);
  console.log(`- supabase_row_count: ${summary.supabase.row_count ?? 'n/a'}`);
  console.log(`- supabase_active_count: ${summary.supabase.active_count ?? 'n/a'}`);
  console.log(`- missing_in_oracle_count: ${summary.parity.missing_in_oracle_count ?? 'n/a'}`);
  console.log(`- missing_in_supabase_count: ${summary.parity.missing_in_supabase_count ?? 'n/a'}`);
  console.log(`- mismatched_row_count: ${summary.parity.mismatched_row_count ?? 'n/a'}`);

  console.log('- oracle_status_counts:');
  for (const [key, value] of Object.entries(summary.oracle.status_counts || {})) {
    console.log(`  - ${key}: ${value}`);
  }

  console.log('- supabase_status_counts:');
  for (const [key, value] of Object.entries(summary.supabase.status_counts || {})) {
    console.log(`  - ${key}: ${value}`);
  }

  console.log('- checks:');
  for (const entry of summary.checks) {
    console.log(`  - ${entry.name}: ${entry.pass ? 'pass' : 'fail'}`);
  }

  if ((summary.parity.missing_in_oracle_count || 0) > 0) {
    console.log('- missing_in_oracle_samples:');
    for (const row of summary.parity.samples?.missing_in_oracle || []) {
      console.log(`  - source_item_id=${row.source_item_id} id=${row.id} status=${row.status} updated_at=${row.updated_at}`);
    }
  }

  if ((summary.parity.missing_in_supabase_count || 0) > 0) {
    console.log('- missing_in_supabase_samples:');
    for (const row of summary.parity.samples?.missing_in_supabase || []) {
      console.log(`  - source_item_id=${row.source_item_id} id=${row.id} status=${row.status} updated_at=${row.updated_at}`);
    }
  }

  if ((summary.parity.mismatched_row_count || 0) > 0) {
    console.log('- mismatch_field_counts:');
    for (const [key, value] of Object.entries(summary.parity.mismatch_field_counts || {})) {
      console.log(`  - ${key}: ${value}`);
    }
  }

  if (verdict !== 'PASS') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
