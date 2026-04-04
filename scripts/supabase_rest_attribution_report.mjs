#!/usr/bin/env node
import fs from 'node:fs';

const args = process.argv.slice(2);

function getArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

const asJson = args.includes('--json');
const hoursRaw = getArg('--hours');
const sinceRaw = getArg('--since');
const untilRaw = getArg('--until');
const topRaw = getArg('--top');
const minWindowMinutesRaw = getArg('--min-window-minutes');
const fullRange = args.includes('--full-range');

function readDotEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function env(key, fallbackKey) {
  return process.env[key] || (fallbackKey ? process.env[fallbackKey] : '') || '';
}

function toIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function pad(value) {
  return String(value).padStart(5, ' ');
}

function printSection(title) {
  console.log(`\n${title}`);
}

function summarizeTopMap(entries, limit) {
  return entries
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)))
    .slice(0, limit)
    .map((entry) => ({
      key: entry.key,
      count: entry.count,
      percent: entry.percent,
      details: entry.details,
    }));
}

function normalizeFilterValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('eq.')) return 'eq';
  if (text.startsWith('neq.')) return 'neq';
  if (text.startsWith('in.')) return 'in';
  if (text.startsWith('is.')) return 'is';
  if (text.startsWith('gte.')) return 'gte';
  if (text.startsWith('lte.')) return 'lte';
  if (text.startsWith('gt.')) return 'gt';
  if (text.startsWith('lt.')) return 'lt';
  if (text.startsWith('like.')) return 'like';
  if (text.startsWith('ilike.')) return 'ilike';
  if (text.startsWith('cs.')) return 'cs';
  if (text.startsWith('cd.')) return 'cd';
  if (text.startsWith('ov.')) return 'ov';
  return 'value';
}

function normalizeQuery(search) {
  const query = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const keys = [];
  for (const [key, value] of query.entries()) {
    if (key === 'select') continue;
    if (key === 'order') continue;
    if (key === 'limit') continue;
    if (key === 'offset') continue;
    if (key === 'range') continue;
    if (key === 'on_conflict') {
      keys.push('on_conflict');
      continue;
    }
    const normalized = normalizeFilterValue(value);
    keys.push(normalized ? `${key}:${normalized}` : key);
  }
  return keys.sort().join('&');
}

function classifyActor({ role, userAgent, xClientInfo }) {
  const ua = String(userAgent || '').toLowerCase();
  const client = String(xClientInfo || '').toLowerCase();
  const browserLike =
    ua.includes('mozilla') ||
    ua.includes('chrome') ||
    ua.includes('safari') ||
    ua.includes('firefox') ||
    ua.includes('edg/');

  if (role === 'service_role') {
    if (ua === 'node' || client.includes('supabase-js-node')) return 'backend_service_role';
    return 'service_role_other';
  }
  if (role === 'authenticated') {
    return browserLike ? 'frontend_authenticated' : 'authenticated_other';
  }
  if (role === 'anon') {
    return browserLike ? 'frontend_anon' : 'anon_other';
  }
  return browserLike ? 'frontend_unknown_role' : 'unknown_actor';
}

function extractRole(sb) {
  const root = Array.isArray(sb) ? sb[0] : sb;
  const jwt = Array.isArray(root?.jwt) ? root.jwt[0] : root?.jwt;
  const authorization = Array.isArray(jwt?.authorization) ? jwt.authorization[0] : jwt?.authorization;
  const authorizationPayload = Array.isArray(authorization?.payload) ? authorization.payload[0] : authorization?.payload;
  if (authorizationPayload?.role) return String(authorizationPayload.role);
  const apikey = Array.isArray(jwt?.apikey) ? jwt.apikey[0] : jwt?.apikey;
  const apikeyPayload = Array.isArray(apikey?.payload) ? apikey.payload[0] : apikey?.payload;
  if (apikeyPayload?.role) return String(apikeyPayload.role);
  return 'unknown';
}

function classifyFamily(path) {
  if (!path.startsWith('/rest/v1/')) return 'non_rest';
  const suffix = path.slice('/rest/v1/'.length);
  if (suffix.startsWith('rpc/')) {
    const rpc = suffix.slice(4);
    if (rpc.includes('ingestion') || rpc.includes('queue') || rpc.includes('claim_')) return 'queue';
    if (rpc.includes('subscription')) return 'subscriptions';
    return 'rpc_other';
  }
  const table = suffix.split('/')[0];
  switch (table) {
    case 'ingestion_jobs':
      return 'queue';
    case 'user_source_subscriptions':
    case 'source_auto_unlock_intents':
      return 'subscriptions';
    case 'source_item_unlocks':
      return 'unlocks';
    case 'source_items':
    case 'source_pages':
      return 'source_items';
    case 'user_feed_items':
      return 'feed';
    case 'source_item_blueprint_variants':
    case 'generation_runs':
    case 'generation_run_events':
      return 'generation_state';
    case 'profiles':
    case 'blueprints':
    case 'blueprint_tags':
    case 'blueprint_likes':
    case 'blueprint_comments':
      return 'product_readwrite';
    case 'storage':
      return 'storage';
    default:
      return table || 'unknown_table';
  }
}

function increment(map, key, extra = {}) {
  const current = map.get(key) || { key, count: 0, details: extra };
  current.count += 1;
  if (extra && Object.keys(extra).length) current.details = { ...current.details, ...extra };
  map.set(key, current);
}

async function fetchJson(url, token) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const json = await response.json().catch(() => null);
    if (response.ok) return json;
    if (response.status === 429 && attempt < 5) {
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      const reset = Number(response.headers.get('x-ratelimit-reset') || 0);
      const waitMs = Math.max(1000, (retryAfter || reset || 5) * 1000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    throw new Error(`Supabase Management API ${response.status}: ${JSON.stringify(json)}`);
  }
  throw new Error('Supabase Management API retries exhausted');
}

async function fetchLogsWindow(projectRef, token, startIso, endIso) {
  const url =
    `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all` +
    `?iso_timestamp_start=${encodeURIComponent(startIso)}` +
    `&iso_timestamp_end=${encodeURIComponent(endIso)}`;
  const json = await fetchJson(url, token);
  return Array.isArray(json.result) ? json.result : [];
}

async function fetchLogsRecursive(projectRef, token, startMs, endMs, minWindowMs, seen) {
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();
  const rows = await fetchLogsWindow(projectRef, token, startIso, endIso);
  if (rows.length < 100 || endMs - startMs <= minWindowMs) {
    for (const row of rows) {
      if (row?.id) seen.set(String(row.id), row);
    }
    return;
  }
  const middle = startMs + Math.floor((endMs - startMs) / 2);
  await fetchLogsRecursive(projectRef, token, startMs, middle, minWindowMs, seen);
  await fetchLogsRecursive(projectRef, token, middle + 1, endMs, minWindowMs, seen);
}

const dot = readDotEnv('.env');
const projectRef = env('VITE_SUPABASE_PROJECT_ID') || dot.VITE_SUPABASE_PROJECT_ID || '';
const accessToken = env('SUPABASE_ACCESS_TOKEN') || dot.SUPABASE_ACCESS_TOKEN || '';

if (!projectRef || !accessToken) {
  const message = [
    'Missing required env vars.',
    `VITE_SUPABASE_PROJECT_ID: ${projectRef ? 'set' : 'missing'}`,
    `SUPABASE_ACCESS_TOKEN: ${accessToken ? 'set' : 'missing'}`,
  ].join('\n');
  console.error(message);
  process.exit(2);
}

const now = new Date();
const hours = hoursRaw ? Number(hoursRaw) : 24;
const startIso =
  toIso(sinceRaw) ||
  new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
const endIso = toIso(untilRaw) || now.toISOString();
const topLimit = topRaw ? Math.max(1, Number(topRaw)) : 12;
const minWindowMinutes = minWindowMinutesRaw ? Math.max(1, Number(minWindowMinutesRaw)) : 15;

const base = `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints`;
const countsUrl = `${base}/usage.api-counts?interval=1day`;
const requestCountUrl = `${base}/usage.api-requests-count?interval=1day`;

const countsJson = await fetchJson(countsUrl, accessToken);
const requestCountJson = await fetchJson(requestCountUrl, accessToken);
const seenLogs = new Map();
if (fullRange) {
  await fetchLogsRecursive(
    projectRef,
    accessToken,
    new Date(startIso).getTime(),
    new Date(endIso).getTime(),
    minWindowMinutes * 60 * 1000,
    seenLogs,
  );
} else {
  const rows = await fetchLogsWindow(projectRef, accessToken, startIso, endIso);
  for (const row of rows) {
    if (row?.id) seenLogs.set(String(row.id), row);
  }
}

const usageRows = Array.isArray(countsJson.result) ? countsJson.result : [];
const usageTotals = usageRows.reduce(
  (acc, row) => {
    acc.auth += Number(row.total_auth_requests || 0);
    acc.realtime += Number(row.total_realtime_requests || 0);
    acc.rest += Number(row.total_rest_requests || 0);
    acc.storage += Number(row.total_storage_requests || 0);
    return acc;
  },
  { auth: 0, realtime: 0, rest: 0, storage: 0 },
);

const logs = Array.from(seenLogs.values()).sort((a, b) => {
  const ta = Number(a?.timestamp || 0);
  const tb = Number(b?.timestamp || 0);
  return ta - tb;
});
const restLogs = [];
const nonRestLogs = [];

for (const entry of logs) {
  const metadata = Array.isArray(entry?.metadata) ? entry.metadata[0] : entry?.metadata?.[0];
  const request = Array.isArray(metadata?.request) ? metadata.request[0] : null;
  const response = Array.isArray(metadata?.response) ? metadata.response[0] : null;
  const headers = Array.isArray(request?.headers) ? request.headers[0] : {};
  const role = extractRole(request?.sb);
  const userAgent = String(headers?.user_agent || '');
  const xClientInfo = String(headers?.x_client_info || '');
  const method = String(request?.method || 'UNKNOWN').toUpperCase();
  const path = String(request?.path || '');
  const search = String(request?.search || '');
  const status = Number(response?.status_code || 0) || 0;
  const originTimeMs = Number(response?.origin_time || 0) || 0;
  const actor = classifyActor({ role, userAgent, xClientInfo });
  const family = classifyFamily(path);
  const item = {
    id: entry?.id || null,
    timestamp: entry?.timestamp || null,
    method,
    path,
    search,
    status,
    role,
    actor,
    family,
    userAgent,
    xClientInfo,
    originTimeMs,
    normalizedQuery: normalizeQuery(search),
  };
  if (path.startsWith('/rest/v1/')) restLogs.push(item);
  else nonRestLogs.push(item);
}

const totalRestLogs = restLogs.length;
const endpointCounts = new Map();
const pathCounts = new Map();
const actorCounts = new Map();
const familyCounts = new Map();
const actorByFamilyCounts = new Map();
const statusCounts = new Map();

for (const item of restLogs) {
  const normalizedEndpoint = item.normalizedQuery
    ? `${item.method} ${item.path}?${item.normalizedQuery}`
    : `${item.method} ${item.path}`;
  increment(endpointCounts, normalizedEndpoint, {
    path: item.path,
    actor: item.actor,
    family: item.family,
  });
  increment(pathCounts, `${item.method} ${item.path}`, { family: item.family });
  increment(actorCounts, item.actor);
  increment(familyCounts, item.family);
  increment(actorByFamilyCounts, `${item.actor} -> ${item.family}`);
  increment(statusCounts, String(item.status));
}

function attachPercents(entries, total) {
  return entries.map((entry) => ({
    ...entry,
    percent: total > 0 ? Number(((entry.count / total) * 100).toFixed(1)) : 0,
  }));
}

const topEndpoints = summarizeTopMap(attachPercents(Array.from(endpointCounts.values()), totalRestLogs), topLimit);
const topPaths = summarizeTopMap(attachPercents(Array.from(pathCounts.values()), totalRestLogs), topLimit);
const topActors = summarizeTopMap(attachPercents(Array.from(actorCounts.values()), totalRestLogs), totalRestLogs);
const topFamilies = summarizeTopMap(attachPercents(Array.from(familyCounts.values()), totalRestLogs), totalRestLogs);
const topActorFamilies = summarizeTopMap(
  attachPercents(Array.from(actorByFamilyCounts.values()), totalRestLogs),
  topLimit,
);
const topStatuses = summarizeTopMap(attachPercents(Array.from(statusCounts.values()), totalRestLogs), totalRestLogs);

const report = {
  window: {
    start_iso: startIso,
    end_iso: endIso,
    hours,
  },
  mode: fullRange ? 'full_range' : 'sample_latest_100',
  usage_api_counts: {
    auth_requests: usageTotals.auth,
    realtime_requests: usageTotals.realtime,
    rest_requests: usageTotals.rest,
    storage_requests: usageTotals.storage,
    total_requests: usageTotals.auth + usageTotals.realtime + usageTotals.rest + usageTotals.storage,
    request_count_endpoint_total: requestCountJson?.result?.[0]?.count ?? null,
  },
  log_sample: {
    total_logs_returned: logs.length,
    rest_logs_returned: totalRestLogs,
    non_rest_logs_returned: nonRestLogs.length,
    min_window_minutes: minWindowMinutes,
    note: fullRange
      ? 'Recursive window crawl used to avoid the 100-log API cap where possible.'
      : 'Latest 100 matching logs only. Use --full-range for a slower but broader crawl.',
  },
  top_paths: topPaths,
  top_normalized_endpoints: topEndpoints,
  actors: topActors,
  families: topFamilies,
  actor_family_breakdown: topActorFamilies,
  statuses: topStatuses,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log('Supabase REST Attribution Report');
console.log(`Window: ${startIso} -> ${endIso}`);
console.log(`Usage API total requests: ${report.usage_api_counts.total_requests}`);
console.log(`Usage API REST requests: ${report.usage_api_counts.rest_requests}`);
console.log(`Logs sampled: ${totalRestLogs} REST entries (${logs.length} total logs returned)`);

printSection('Top REST paths');
for (const entry of topPaths) {
  console.log(`${pad(entry.count)}  ${String(entry.percent).padStart(5, ' ')}%  ${entry.key}`);
}

printSection('Top normalized REST endpoints');
for (const entry of topEndpoints) {
  console.log(`${pad(entry.count)}  ${String(entry.percent).padStart(5, ' ')}%  ${entry.key}`);
}

printSection('Actor breakdown');
for (const entry of topActors) {
  console.log(`${pad(entry.count)}  ${String(entry.percent).padStart(5, ' ')}%  ${entry.key}`);
}

printSection('Family breakdown');
for (const entry of topFamilies) {
  console.log(`${pad(entry.count)}  ${String(entry.percent).padStart(5, ' ')}%  ${entry.key}`);
}

printSection('Actor -> family breakdown');
for (const entry of topActorFamilies) {
  console.log(`${pad(entry.count)}  ${String(entry.percent).padStart(5, ' ')}%  ${entry.key}`);
}

printSection('Status breakdown');
for (const entry of topStatuses) {
  console.log(`${pad(entry.count)}  ${String(entry.percent).padStart(5, ' ')}%  ${entry.key}`);
}
