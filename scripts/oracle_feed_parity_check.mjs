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
    'user_id',
    'source_item_id',
    'blueprint_id',
    'state',
    'last_decision_code',
    'created_at',
    'updated_at',
]

COMPARE_FIELDS = [
    'user_id',
    'source_item_id',
    'blueprint_id',
    'state',
    'last_decision_code',
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


def normalize_row(row):
    return {
        'id': normalize_text(row.get('id')),
        'user_id': normalize_text(row.get('user_id')),
        'source_item_id': normalize_text(row.get('source_item_id')),
        'blueprint_id': normalize_text(row.get('blueprint_id')),
        'state': normalize_text(row.get('state')),
        'last_decision_code': normalize_text(row.get('last_decision_code')),
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
              user_id,
              source_item_id,
              blueprint_id,
              state,
              last_decision_code,
              created_at,
              updated_at
            from feed_ledger_state
            order by created_at desc, id desc
            """
        ).fetchall()
        return [normalize_row(dict(row)) for row in rows]
    finally:
        connection.close()


def fetch_supabase_rows(supabase_url, service_role_key):
    rows = []
    offset = 0
    encoded_select = urllib.parse.quote(','.join(SELECT_COLUMNS), safe=',*')

    while True:
        url = (
            f"{supabase_url.rstrip('/')}/rest/v1/user_feed_items"
            f"?select={encoded_select}"
            f"&order=created_at.desc,id.desc"
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

result = {
    'service_show': read_service_show(SERVICE_NAME),
    'env': {
        'ORACLE_FEED_LEDGER_MODE': env.get('ORACLE_FEED_LEDGER_MODE'),
        'ORACLE_FEED_LEDGER_BOOTSTRAP_LIMIT': env.get('ORACLE_FEED_LEDGER_BOOTSTRAP_LIMIT'),
    },
    'oracle_row_count': len(oracle_rows),
    'supabase_row_count': len(supabase_rows),
    'oracle_active_count': sum(1 for row in oracle_rows if row.get('state') in ('my_feed_unlockable', 'my_feed_unlocking')),
    'supabase_active_count': sum(1 for row in supabase_rows if row.get('state') in ('my_feed_unlockable', 'my_feed_unlocking')),
    'missing_in_oracle_count': len(missing_in_oracle),
    'missing_in_supabase_count': len(missing_in_supabase),
    'mismatched_row_count': len(mismatches),
    'missing_in_oracle_sample': missing_in_oracle[:SAMPLE_LIMIT],
    'missing_in_supabase_sample': missing_in_supabase[:SAMPLE_LIMIT],
    'mismatch_sample': mismatches[:SAMPLE_LIMIT],
}

print(json.dumps(result))
PY
`,
  );

  const remote = JSON.parse(remoteRaw);
  const checks = [
    check('service_running', remote?.service_show?.SubState === 'running', remote?.service_show || {}),
    check('feed_ledger_mode_is_enabled', ['dual', 'primary'].includes(String(remote?.env?.ORACLE_FEED_LEDGER_MODE || '')), remote?.env || {}),
    check('row_counts_match', Number(remote?.oracle_row_count || 0) === Number(remote?.supabase_row_count || 0), {
      oracle_row_count: remote?.oracle_row_count || 0,
      supabase_row_count: remote?.supabase_row_count || 0,
    }),
    check('no_missing_rows', Number(remote?.missing_in_oracle_count || 0) === 0 && Number(remote?.missing_in_supabase_count || 0) === 0, {
      missing_in_oracle_count: remote?.missing_in_oracle_count || 0,
      missing_in_supabase_count: remote?.missing_in_supabase_count || 0,
      missing_in_oracle_sample: remote?.missing_in_oracle_sample || [],
      missing_in_supabase_sample: remote?.missing_in_supabase_sample || [],
    }),
    check('no_field_mismatches', Number(remote?.mismatched_row_count || 0) === 0, {
      mismatched_row_count: remote?.mismatched_row_count || 0,
      mismatch_sample: remote?.mismatch_sample || [],
    }),
  ];

  const verdict = checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL';
  const output = {
    verdict,
    host: options.host,
    service_name: options.serviceName,
    env: remote?.env || {},
    service_show: remote?.service_show || {},
    oracle_row_count: remote?.oracle_row_count || 0,
    supabase_row_count: remote?.supabase_row_count || 0,
    oracle_active_count: remote?.oracle_active_count || 0,
    supabase_active_count: remote?.supabase_active_count || 0,
    missing_in_oracle_count: remote?.missing_in_oracle_count || 0,
    missing_in_supabase_count: remote?.missing_in_supabase_count || 0,
    mismatched_row_count: remote?.mismatched_row_count || 0,
    missing_in_oracle_sample: remote?.missing_in_oracle_sample || [],
    missing_in_supabase_sample: remote?.missing_in_supabase_sample || [],
    mismatch_sample: remote?.mismatch_sample || [],
    checks,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  process.stdout.write(`Oracle feed parity: ${verdict}\n`);
  process.stdout.write(`Rows: oracle=${output.oracle_row_count} supabase=${output.supabase_row_count}\n`);
  process.stdout.write(`Active rows: oracle=${output.oracle_active_count} supabase=${output.supabase_active_count}\n`);
  process.stdout.write(`Missing in Oracle: ${output.missing_in_oracle_count}\n`);
  process.stdout.write(`Missing in Supabase: ${output.missing_in_supabase_count}\n`);
  process.stdout.write(`Mismatched rows: ${output.mismatched_row_count}\n`);
  if (output.missing_in_oracle_sample.length > 0) {
    process.stdout.write(`Missing-in-Oracle sample: ${output.missing_in_oracle_sample.join(', ')}\n`);
  }
  if (output.missing_in_supabase_sample.length > 0) {
    process.stdout.write(`Missing-in-Supabase sample: ${output.missing_in_supabase_sample.join(', ')}\n`);
  }
  if (output.mismatch_sample.length > 0) {
    process.stdout.write(`Mismatch sample: ${JSON.stringify(output.mismatch_sample.slice(0, 3))}\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
