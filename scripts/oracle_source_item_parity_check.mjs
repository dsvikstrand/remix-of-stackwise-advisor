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
PAGE_SIZE = ${JSON.stringify(options.pageSize)}
SAMPLE_LIMIT = ${JSON.stringify(options.sampleLimit)}

SELECT_COLUMNS = [
    'id',
    'source_type',
    'source_native_id',
    'canonical_key',
    'source_url',
    'title',
    'published_at',
    'ingest_status',
    'source_channel_id',
    'source_channel_title',
    'source_page_id',
    'thumbnail_url',
    'metadata',
    'created_at',
    'updated_at',
]

COMPARE_FIELDS = [
    'source_type',
    'source_native_id',
    'canonical_key',
    'source_url',
    'title',
    'published_at',
    'ingest_status',
    'source_channel_id',
    'source_channel_title',
    'source_page_id',
    'thumbnail_url',
    'metadata',
    'created_at',
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


def normalize_json(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return {key: normalize_json(value[key]) for key in sorted(value.keys())}
    if isinstance(value, list):
        return [normalize_json(item) for item in value]
    return value


def normalize_row(row):
    return {
        'id': normalize_text(row.get('id')),
        'source_type': normalize_text(row.get('source_type')),
        'source_native_id': normalize_text(row.get('source_native_id')),
        'canonical_key': normalize_text(row.get('canonical_key')),
        'source_url': normalize_text(row.get('source_url')),
        'title': normalize_text(row.get('title')),
        'published_at': normalize_iso(row.get('published_at')),
        'ingest_status': normalize_text(row.get('ingest_status')),
        'source_channel_id': normalize_text(row.get('source_channel_id')),
        'source_channel_title': normalize_text(row.get('source_channel_title')),
        'source_page_id': normalize_text(row.get('source_page_id')),
        'thumbnail_url': normalize_text(row.get('thumbnail_url')),
        'metadata': normalize_json(row.get('metadata')),
        'created_at': normalize_iso(row.get('created_at')),
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
              source_type,
              source_native_id,
              canonical_key,
              source_url,
              title,
              published_at,
              ingest_status,
              source_channel_id,
              source_channel_title,
              source_page_id,
              thumbnail_url,
              metadata_json,
              created_at,
              updated_at
            from source_item_ledger_state
            order by updated_at desc, id desc
            """
        ).fetchall()
        return [normalize_row({
            **dict(row),
            'metadata': json.loads(row['metadata_json']) if row['metadata_json'] else None,
        }) for row in rows]
    finally:
        connection.close()


def fetch_supabase_rows(supabase_url, service_role_key):
    rows = []
    offset = 0
    encoded_select = urllib.parse.quote(','.join(SELECT_COLUMNS), safe=',*')

    while True:
        url = (
            f"{supabase_url.rstrip('/')}/rest/v1/source_items"
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
        batch = [normalize_row(row) for row in payload]
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += len(batch)
    return rows


def collect_duplicate_canonical_keys(rows):
    counts = {}
    for row in rows:
        key = row.get('canonical_key')
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
    duplicates = [key for key, count in counts.items() if count > 1]
    duplicates.sort()
    return duplicates


env = parse_env_file(ENV_PATH)
supabase_url = env.get('SUPABASE_URL') or env.get('VITE_SUPABASE_URL')
service_role_key = env.get('SUPABASE_SERVICE_ROLE_KEY')
if not supabase_url or not service_role_key:
    raise SystemExit('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in env file')

oracle_rows = load_oracle_rows(SQLITE_PATH)
supabase_rows = fetch_supabase_rows(supabase_url, service_role_key)

oracle_by_id = {row['id']: row for row in oracle_rows if row.get('id')}
supabase_by_id = {row['id']: row for row in supabase_rows if row.get('id')}

missing_in_oracle = []
missing_in_supabase = []
mismatches = []

for row_id, supabase_row in supabase_by_id.items():
    oracle_row = oracle_by_id.get(row_id)
    if not oracle_row:
        missing_in_oracle.append(row_id)
        continue
    for field in COMPARE_FIELDS:
        if oracle_row.get(field) != supabase_row.get(field):
            mismatches.append({
                'id': row_id,
                'field': field,
                'oracle': oracle_row.get(field),
                'supabase': supabase_row.get(field),
            })

for row_id in oracle_by_id:
    if row_id not in supabase_by_id:
        missing_in_supabase.append(row_id)

oracle_duplicate_canonical_keys = collect_duplicate_canonical_keys(oracle_rows)
supabase_duplicate_canonical_keys = collect_duplicate_canonical_keys(supabase_rows)

result = {
    'service_show': read_service_show(SERVICE_NAME),
    'env': {
        'ORACLE_SOURCE_ITEM_LEDGER_MODE': env.get('ORACLE_SOURCE_ITEM_LEDGER_MODE'),
        'ORACLE_SOURCE_ITEM_LEDGER_BOOTSTRAP_LIMIT': env.get('ORACLE_SOURCE_ITEM_LEDGER_BOOTSTRAP_LIMIT'),
    },
    'oracle_row_count': len(oracle_rows),
    'supabase_row_count': len(supabase_rows),
    'oracle_duplicate_canonical_key_count': len(oracle_duplicate_canonical_keys),
    'supabase_duplicate_canonical_key_count': len(supabase_duplicate_canonical_keys),
    'missing_in_oracle_count': len(missing_in_oracle),
    'missing_in_supabase_count': len(missing_in_supabase),
    'mismatched_row_count': len(mismatches),
    'missing_in_oracle_sample': missing_in_oracle[:SAMPLE_LIMIT],
    'missing_in_supabase_sample': missing_in_supabase[:SAMPLE_LIMIT],
    'mismatch_sample': mismatches[:SAMPLE_LIMIT],
    'oracle_duplicate_canonical_key_sample': oracle_duplicate_canonical_keys[:SAMPLE_LIMIT],
    'supabase_duplicate_canonical_key_sample': supabase_duplicate_canonical_keys[:SAMPLE_LIMIT],
}

print(json.dumps(result))
PY
`,
  );

  const result = JSON.parse(remoteRaw);
  const checks = [
    check('service_running', result.service_show?.SubState === 'running', {
      sub_state: result.service_show?.SubState || null,
    }),
    check('source_item_row_counts_match', result.oracle_row_count === result.supabase_row_count, {
      oracle_row_count: result.oracle_row_count,
      supabase_row_count: result.supabase_row_count,
    }),
    check('no_missing_rows', result.missing_in_oracle_count === 0 && result.missing_in_supabase_count === 0, {
      missing_in_oracle_count: result.missing_in_oracle_count,
      missing_in_supabase_count: result.missing_in_supabase_count,
      missing_in_oracle_sample: result.missing_in_oracle_sample,
      missing_in_supabase_sample: result.missing_in_supabase_sample,
    }),
    check('no_duplicate_canonical_keys', result.oracle_duplicate_canonical_key_count === 0 && result.supabase_duplicate_canonical_key_count === 0, {
      oracle_duplicate_canonical_key_count: result.oracle_duplicate_canonical_key_count,
      supabase_duplicate_canonical_key_count: result.supabase_duplicate_canonical_key_count,
      oracle_duplicate_canonical_key_sample: result.oracle_duplicate_canonical_key_sample,
      supabase_duplicate_canonical_key_sample: result.supabase_duplicate_canonical_key_sample,
    }),
    check('no_field_mismatches', result.mismatched_row_count === 0, {
      mismatched_row_count: result.mismatched_row_count,
      mismatch_sample: result.mismatch_sample,
    }),
  ];

  const verdict = checks.every((item) => item.pass) ? 'PASS' : 'FAIL';
  const output = {
    verdict,
    ...result,
    checks,
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`Oracle source-item parity: ${verdict}`);
  console.log(`  mode: ${result.env?.ORACLE_SOURCE_ITEM_LEDGER_MODE || 'unknown'}`);
  console.log(`  oracle rows: ${result.oracle_row_count}`);
  console.log(`  supabase rows: ${result.supabase_row_count}`);
  console.log(`  missing in oracle: ${result.missing_in_oracle_count}`);
  console.log(`  missing in supabase: ${result.missing_in_supabase_count}`);
  console.log(`  mismatched rows: ${result.mismatched_row_count}`);
  console.log(`  duplicate canonical keys: oracle=${result.oracle_duplicate_canonical_key_count} supabase=${result.supabase_duplicate_canonical_key_count}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
