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
    sqlitePath: read('--sqlite-path', '/home/ubuntu/agentic-runtime/control-plane.sqlite'),
    localPort: read('--local-port', '8787'),
    apiBaseUrl: read('--api-base-url', 'https://api.bleup.app'),
    sinceMinutes: Math.max(1, Number.parseInt(read('--since-minutes', '90'), 10) || 90),
    json: args.includes('--json'),
  };
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
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

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  return {
    status: response.status,
    body: readJsonSafe(text) ?? text,
  };
}

function parseSections(raw) {
  const sections = {};
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('__SECTION__:')) {
      current = line.slice('__SECTION__:'.length).trim();
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }

  return Object.fromEntries(
    Object.entries(sections).map(([key, lines]) => [key, lines.join('\n').trim()]),
  );
}

function parseKeyValueLines(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pivot = trimmed.indexOf('=');
    if (pivot <= 0) continue;
    result[trimmed.slice(0, pivot)] = trimmed.slice(pivot + 1);
  }
  return result;
}

function parseEnvLines(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pivot = trimmed.indexOf('=');
    if (pivot <= 0) continue;
    result[trimmed.slice(0, pivot)] = trimmed.slice(pivot + 1);
  }
  return result;
}

function parseSqliteSection(raw) {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const scopeRows = [];
  let subscriptionCount = null;
  let scopeCount = null;

  for (const line of lines) {
    const parts = line.split('|');
    const tag = parts[0];
    if (tag === 'subscription_count') {
      subscriptionCount = Number.parseInt(parts[1] || '', 10);
      continue;
    }
    if (tag === 'scope_count') {
      scopeCount = Number.parseInt(parts[1] || '', 10);
      continue;
    }
    if (tag === 'scope_row') {
      scopeRows.push({
        scope: parts[1] || '',
        last_decision_code: parts[2] || null,
        last_triggered_at: parts[3] || null,
        last_started_at: parts[4] || null,
        last_finished_at: parts[5] || null,
        last_success_at: parts[6] || null,
        min_interval_until: parts[7] || null,
        suppression_until: parts[8] || null,
        last_queue_depth: parts[9] === undefined ? null : Number.parseInt(parts[9], 10),
      });
    }
  }

  return {
    subscription_count: Number.isFinite(subscriptionCount) ? subscriptionCount : null,
    scope_count: Number.isFinite(scopeCount) ? scopeCount : null,
    scope_rows: scopeRows,
  };
}

function incrementBucket(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function toSortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]));
}

function extractJsonPayload(line, marker) {
  const index = line.indexOf(marker);
  if (index < 0) return null;
  return readJsonSafe(line.slice(index + marker.length).trim());
}

function parsePrimaryJournal(raw) {
  const lines = raw.split(/\r?\n/);
  const actualCodes = new Map();
  const oracleCodes = new Map();
  const issues = [];
  const primaryDecisions = [];
  const dueBatchSelections = [];
  const dueBatchFallbacks = [];
  const terminalEvents = [];
  const finishedEvents = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const primaryDecision = extractJsonPayload(
      line,
      '[oracle-control-plane] primary_trigger_decision ',
    );
    if (primaryDecision) {
      primaryDecisions.push(primaryDecision);
      if (typeof primaryDecision.actual_decision_code === 'string') {
        incrementBucket(actualCodes, primaryDecision.actual_decision_code);
      }
      if (typeof primaryDecision.oracle_decision_code === 'string') {
        incrementBucket(oracleCodes, primaryDecision.oracle_decision_code);
      }
      continue;
    }

    const batchSelected = extractJsonPayload(
      line,
      '[oracle-control-plane] primary_due_batch_selected ',
    );
    if (batchSelected) {
      dueBatchSelections.push(batchSelected);
      continue;
    }

    const batchFallback = extractJsonPayload(
      line,
      '[oracle-control-plane] primary_due_batch_fallback ',
    );
    if (batchFallback) {
      dueBatchFallbacks.push(batchFallback);
      issues.push({ type: 'primary_due_batch_fallback', payload: batchFallback });
      continue;
    }

    const terminal = extractJsonPayload(line, '[unlock_job_terminal] ');
    if (terminal && terminal.scope === 'all_active_subscriptions') {
      terminalEvents.push(terminal);
      continue;
    }

    const finished = extractJsonPayload(line, '[unlock_job_finished] ');
    if (finished && finished.scope === 'all_active_subscriptions') {
      finishedEvents.push(finished);
      continue;
    }

    if (line.includes('primary trigger decision failed')) {
      issues.push({ type: 'primary_trigger_decision_failed', line: line.trim() });
      continue;
    }
    if (line.includes('bootstrap failed')) {
      issues.push({ type: 'bootstrap_failed', line: line.trim() });
      continue;
    }
    if (line.includes('failed to open sqlite store')) {
      issues.push({ type: 'sqlite_open_failed', line: line.trim() });
    }
  }

  const matchedCount = primaryDecisions.filter((entry) => entry?.matched === true).length;
  const mismatchedCount = primaryDecisions.filter((entry) => entry?.matched === false).length;

  return {
    primary_decision_count: primaryDecisions.length,
    matched_count: matchedCount,
    mismatched_count: mismatchedCount,
    actual_code_distribution: toSortedObject(actualCodes),
    oracle_code_distribution: toSortedObject(oracleCodes),
    due_batch_selected_count: dueBatchSelections.length,
    due_batch_fallback_count: dueBatchFallbacks.length,
    last_due_batch_selected: dueBatchSelections.length ? dueBatchSelections[dueBatchSelections.length - 1] : null,
    last_terminal_event: terminalEvents.length ? terminalEvents[terminalEvents.length - 1] : null,
    last_finished_event: finishedEvents.length ? finishedEvents[finishedEvents.length - 1] : null,
    issues,
  };
}

function check(name, pass, details = {}) {
  return { name, pass, details };
}

async function main() {
  const options = parseArgs(process.argv);
  const publicHealth = await fetchJson(`${trimTrailingSlash(options.apiBaseUrl)}/api/health`);

  const snapshotRaw = runRemoteScript(
    options.host,
    `
set -euo pipefail
echo "__SECTION__:service_active"
systemctl is-active ${options.serviceName}
echo "__SECTION__:service_show"
systemctl show -p ExecMainPID -p MemoryCurrent ${options.serviceName}
echo "__SECTION__:local_health"
curl -fsS http://127.0.0.1:${options.localPort}/api/health
echo
echo "__SECTION__:sha"
cd ${options.repoDir} && git rev-parse HEAD
echo "__SECTION__:env"
grep '^ORACLE_' /etc/agentic-backend.env || true
echo "__SECTION__:sqlite"
sqlite3 -separator '|' ${options.sqlitePath} <<'SQL'
select 'subscription_count|' || count(*) from subscription_schedule_state;
select 'scope_count|' || count(*) from scope_control_state;
select 'scope_row|' || scope || '|' || coalesce(last_decision_code,'') || '|' || coalesce(last_triggered_at,'') || '|' || coalesce(last_started_at,'') || '|' || coalesce(last_finished_at,'') || '|' || coalesce(last_success_at,'') || '|' || coalesce(min_interval_until,'') || '|' || coalesce(suppression_until,'') || '|' || coalesce(last_queue_depth,-1)
from scope_control_state
order by scope;
SQL
`,
  );

  const journalRaw = runRemoteScript(
    options.host,
    `
set -euo pipefail
journalctl -u ${options.serviceName} --since "${options.sinceMinutes} minutes ago" --no-pager
`,
  );

  const snapshot = parseSections(snapshotRaw);
  const serviceShow = parseKeyValueLines(snapshot.service_show || '');
  const envVars = parseEnvLines(snapshot.env || '');
  const sqliteState = parseSqliteSection(snapshot.sqlite || '');
  const localHealthBody = readJsonSafe(snapshot.local_health || '');
  const journal = parsePrimaryJournal(journalRaw);
  const scopeRow = sqliteState.scope_rows.find((row) => row.scope === 'all_active_subscriptions') || null;

  const checks = [
    check('public_health', publicHealth.status === 200 && publicHealth.body?.ok === true, publicHealth),
    check('local_health', localHealthBody?.ok === true, { body: localHealthBody }),
    check('service_active', snapshot.service_active === 'active', { service_active: snapshot.service_active }),
    check(
      'primary_mode',
      envVars.ORACLE_CONTROL_PLANE_ENABLED === 'true'
        && envVars.ORACLE_SUBSCRIPTION_SCHEDULER_MODE === 'primary',
      {
        ORACLE_CONTROL_PLANE_ENABLED: envVars.ORACLE_CONTROL_PLANE_ENABLED || null,
        ORACLE_SUBSCRIPTION_SCHEDULER_MODE: envVars.ORACLE_SUBSCRIPTION_SCHEDULER_MODE || null,
      },
    ),
    check(
      'sqlite_state_populated',
      (sqliteState.subscription_count || 0) > 0 && (sqliteState.scope_count || 0) > 0,
      sqliteState,
    ),
    check(
      'primary_decisions_match',
      journal.mismatched_count === 0,
      {
        primary_decision_count: journal.primary_decision_count,
        matched_count: journal.matched_count,
        mismatched_count: journal.mismatched_count,
      },
    ),
    check(
      'no_control_plane_failures',
      journal.issues.length === 0 && journal.due_batch_fallback_count === 0,
      {
        issue_count: journal.issues.length,
        due_batch_fallback_count: journal.due_batch_fallback_count,
      },
    ),
    check(
      'latest_due_batch_has_no_missing_rows',
      !journal.last_due_batch_selected || Number(journal.last_due_batch_selected.missing_count || 0) === 0,
      {
        last_due_batch_selected: journal.last_due_batch_selected,
      },
    ),
  ];

  const verdict = checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL';

  const summary = {
    verdict,
    host: options.host,
    service_name: options.serviceName,
    api_base_url: options.apiBaseUrl,
    since_minutes: options.sinceMinutes,
    sha: snapshot.sha || null,
    service_active: snapshot.service_active || null,
    service_show: {
      ExecMainPID: serviceShow.ExecMainPID || null,
      MemoryCurrent: serviceShow.MemoryCurrent || null,
    },
    env: envVars,
    public_health: publicHealth,
    local_health: localHealthBody,
    sqlite: sqliteState,
    scope_state: scopeRow,
    primary: journal,
    checks,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('Oracle Primary Check');
  console.log(`- verdict: ${summary.verdict}`);
  console.log(`- host: ${summary.host}`);
  console.log(`- since_minutes: ${summary.since_minutes}`);
  console.log(`- sha: ${summary.sha ?? 'n/a'}`);
  console.log(`- service_active: ${summary.service_active ?? 'n/a'}`);
  console.log(`- memory_current: ${summary.service_show.MemoryCurrent ?? 'n/a'}`);
  console.log(`- scheduler_mode: ${summary.env.ORACLE_SUBSCRIPTION_SCHEDULER_MODE ?? 'n/a'}`);
  console.log(`- control_plane_enabled: ${summary.env.ORACLE_CONTROL_PLANE_ENABLED ?? 'n/a'}`);
  console.log(`- public_health_ok: ${summary.public_health.status === 200 && summary.public_health.body?.ok === true}`);
  console.log(`- local_health_ok: ${summary.local_health?.ok === true}`);
  console.log(`- subscription_rows: ${summary.sqlite.subscription_count ?? 'n/a'}`);
  console.log(`- scope_rows: ${summary.sqlite.scope_count ?? 'n/a'}`);
  console.log(`- primary_decision_count: ${summary.primary.primary_decision_count}`);
  console.log(`- matched_count: ${summary.primary.matched_count}`);
  console.log(`- mismatched_count: ${summary.primary.mismatched_count}`);
  console.log(`- due_batch_selected_count: ${summary.primary.due_batch_selected_count}`);
  console.log(`- due_batch_fallback_count: ${summary.primary.due_batch_fallback_count}`);

  console.log('- actual_code_distribution:');
  for (const [key, value] of Object.entries(summary.primary.actual_code_distribution)) {
    console.log(`  - ${key}: ${value}`);
  }

  console.log('- oracle_code_distribution:');
  for (const [key, value] of Object.entries(summary.primary.oracle_code_distribution)) {
    console.log(`  - ${key}: ${value}`);
  }

  console.log('- scope_state:');
  if (!summary.scope_state) {
    console.log('  - none');
  } else {
    console.log(`  - scope: ${summary.scope_state.scope}`);
    console.log(`  - last_decision_code: ${summary.scope_state.last_decision_code ?? 'n/a'}`);
    console.log(`  - last_triggered_at: ${summary.scope_state.last_triggered_at ?? 'n/a'}`);
    console.log(`  - last_success_at: ${summary.scope_state.last_success_at ?? 'n/a'}`);
    console.log(`  - min_interval_until: ${summary.scope_state.min_interval_until ?? 'n/a'}`);
    console.log(`  - suppression_until: ${summary.scope_state.suppression_until ?? 'n/a'}`);
    console.log(`  - last_queue_depth: ${summary.scope_state.last_queue_depth ?? 'n/a'}`);
  }

  console.log('- last_due_batch_selected:');
  if (!summary.primary.last_due_batch_selected) {
    console.log('  - none');
  } else {
    console.log(`  - due_subscription_count: ${summary.primary.last_due_batch_selected.due_subscription_count ?? 'n/a'}`);
    console.log(`  - selected_count: ${summary.primary.last_due_batch_selected.selected_count ?? 'n/a'}`);
    console.log(`  - missing_count: ${summary.primary.last_due_batch_selected.missing_count ?? 'n/a'}`);
    console.log(`  - next_due_at: ${summary.primary.last_due_batch_selected.next_due_at ?? 'n/a'}`);
  }

  console.log('- last_terminal_event:');
  if (!summary.primary.last_terminal_event) {
    console.log('  - none');
  } else {
    console.log(`  - job_id: ${summary.primary.last_terminal_event.job_id ?? 'n/a'}`);
    console.log(`  - processed: ${summary.primary.last_terminal_event.processed ?? 'n/a'}`);
    console.log(`  - inserted: ${summary.primary.last_terminal_event.inserted ?? 'n/a'}`);
    console.log(`  - skipped: ${summary.primary.last_terminal_event.skipped ?? 'n/a'}`);
    console.log(`  - failures: ${summary.primary.last_terminal_event.failures ?? 'n/a'}`);
  }

  console.log('- checks:');
  for (const entry of summary.checks) {
    console.log(`  - ${entry.name}: ${entry.pass ? 'pass' : 'fail'}`);
  }

  if (summary.primary.issues.length > 0) {
    console.log('- issues:');
    for (const issue of summary.primary.issues) {
      console.log(`  - ${issue.type}`);
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
