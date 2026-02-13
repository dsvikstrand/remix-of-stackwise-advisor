#!/usr/bin/env node
import fs from 'node:fs';

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

const asJson = args.includes('--json');
const daysRaw = getArg('--days');
const sinceRaw = getArg('--since');
const untilRaw = getArg('--until');

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
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function env(key, fallbackKey) {
  return process.env[key] || (fallbackKey ? process.env[fallbackKey] : '') || '';
}

const dot = readDotEnv('.env');
const supabaseUrl =
  env('SUPABASE_URL') ||
  env('VITE_SUPABASE_URL') ||
  dot.SUPABASE_URL ||
  dot.VITE_SUPABASE_URL ||
  '';
const serviceKey =
  env('SUPABASE_SERVICE_ROLE_KEY') ||
  dot.SUPABASE_SERVICE_ROLE_KEY ||
  '';

if (!supabaseUrl || !serviceKey) {
  const msg = [
    'Missing required env vars.',
    `SUPABASE_URL/VITE_SUPABASE_URL: ${supabaseUrl ? 'set' : 'missing'}`,
    `SUPABASE_SERVICE_ROLE_KEY: ${serviceKey ? 'set' : 'missing'}`,
  ].join('\n');
  console.error(msg);
  process.exit(2);
}

const EVENT_VERSION = 'p3_step3_v0';
const EVENT_NAMES = [
  'channels_index_view',
  'channel_page_view',
  'channel_join_click',
  'channel_join_success',
  'channel_join_fail',
  'channel_leave_success',
  'channel_suggested_impression',
  'channel_suggested_preview_click',
  'wall_zero_join_cta_impression',
  'wall_zero_join_cta_click',
  'wall_tag_filter_used',
];

function toIso(x) {
  if (!x) return null;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const now = new Date();
const days = daysRaw ? Number(daysRaw) : 7;
const sinceIso = toIso(sinceRaw) || new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
const untilIso = toIso(untilRaw) || now.toISOString();

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

async function fetchAll() {
  const base = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/mvp_events`;
  const select = 'event_name,user_id,blueprint_id,path,metadata,created_at';
  const inList = EVENT_NAMES.map((n) => n.replace(/,/g, '')).join(',');

  const url = new URL(base);
  url.searchParams.set('select', select);
  url.searchParams.set('created_at', `gte.${sinceIso}`);
  url.searchParams.append('created_at', `lte.${untilIso}`);
  url.searchParams.set('event_name', `in.(${inList})`);
  url.searchParams.set('order', 'created_at.asc');

  const pageSize = 1000;
  let from = 0;
  let total = null;
  const rows = [];

  while (true) {
    const res = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'count=exact',
        Range: `${from}-${from + pageSize - 1}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase REST ${res.status}: ${text}`);
    }

    const chunk = await res.json();
    rows.push(...(Array.isArray(chunk) ? chunk : []));

    const contentRange = res.headers.get('content-range') || '';
    const m = contentRange.match(/\/(\d+)$/);
    if (m) total = Number(m[1]);

    if (total != null) {
      from += pageSize;
      if (from >= total) break;
      continue;
    }

    if (!Array.isArray(chunk) || chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function compute(rows) {
  const sessions = new Map();
  const joinFailBuckets = {};

  for (const row of rows) {
    const md = row?.metadata && typeof row.metadata === 'object' ? row.metadata : null;
    if (!md || md.event_version !== EVENT_VERSION) continue;
    const sessionId = typeof md.session_id === 'string' ? md.session_id : '';
    if (!sessionId) continue;

    const ts = new Date(row.created_at).getTime();
    if (Number.isNaN(ts)) continue;

    const s = sessions.get(sessionId) || {
      session_id: sessionId,
      start_ts: ts,
      has_user: false,
      has_join_success: false,
      first_join_success_ts: null,
      has_channel_page_view: false,
      has_suggested_impression: false,
      has_suggested_click: false,
      has_zero_join_impression: false,
      has_zero_join_click: false,
    };

    s.start_ts = Math.min(s.start_ts, ts);
    s.has_user = s.has_user || !!row.user_id;

    switch (row.event_name) {
      case 'channel_join_success':
        s.has_join_success = true;
        s.first_join_success_ts = s.first_join_success_ts == null ? ts : Math.min(s.first_join_success_ts, ts);
        break;
      case 'channel_page_view':
        s.has_channel_page_view = true;
        break;
      case 'channel_suggested_impression':
        s.has_suggested_impression = true;
        break;
      case 'channel_suggested_preview_click':
        s.has_suggested_click = true;
        break;
      case 'wall_zero_join_cta_impression':
        s.has_zero_join_impression = true;
        break;
      case 'wall_zero_join_cta_click':
        s.has_zero_join_click = true;
        break;
      case 'channel_join_fail': {
        const b = typeof md.error_bucket === 'string' ? md.error_bucket : 'unknown';
        joinFailBuckets[b] = (joinFailBuckets[b] || 0) + 1;
        break;
      }
      default:
        break;
    }

    sessions.set(sessionId, s);
  }

  const sessionList = Array.from(sessions.values());
  const signedIn = sessionList.filter((s) => s.has_user);

  const joinRateNumerator = signedIn.filter((s) => s.has_join_success).length;
  const joinRateDenominator = signedIn.length;
  const joinRate = joinRateDenominator ? joinRateNumerator / joinRateDenominator : null;

  const deltas = signedIn
    .filter((s) => s.first_join_success_ts != null)
    .map((s) => (s.first_join_success_ts - s.start_ts) / 1000)
    .filter((v) => Number.isFinite(v) && v >= 0);

  const channelPageVisitRate = joinRateDenominator
    ? signedIn.filter((s) => s.has_channel_page_view).length / joinRateDenominator
    : null;

  const suggestedDen = sessionList.filter((s) => s.has_suggested_impression).length;
  const suggestedNum = sessionList.filter((s) => s.has_suggested_impression && s.has_suggested_click).length;
  const suggestedCtr = suggestedDen ? suggestedNum / suggestedDen : null;

  const zeroDen = sessionList.filter((s) => s.has_zero_join_impression).length;
  const zeroNum = sessionList.filter((s) => s.has_zero_join_impression && s.has_zero_join_click).length;
  const zeroCtr = zeroDen ? zeroNum / zeroDen : null;

  return {
    window: { since: sinceIso, until: untilIso },
    counts: {
      total_rows: rows.length,
      sessions: sessionList.length,
      signed_in_sessions: signedIn.length,
    },
    metrics: {
      join_channel_rate: joinRate,
      time_to_first_join_sec: {
        median: percentile(deltas, 0.5),
        p95: percentile(deltas, 0.95),
        samples: deltas.length,
      },
      channel_page_visit_rate: channelPageVisitRate,
      suggested_click_through_rate: suggestedCtr,
      zero_join_cta_click_rate: zeroCtr,
      join_fail_bucket_distribution: joinFailBuckets,
    },
  };
}

try {
  const rows = await fetchAll();
  const summary = compute(rows);
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log('Channels Metrics Summary');
    console.log(`Window: ${summary.window.since} -> ${summary.window.until}`);
    console.log(`Rows: ${summary.counts.total_rows}`);
    console.log(`Sessions: ${summary.counts.sessions} (signed-in: ${summary.counts.signed_in_sessions})`);
    const m = summary.metrics;
    const pct = (v) => (v == null ? 'n/a' : `${Math.round(v * 1000) / 10}%`);
    console.log(`join_channel_rate: ${pct(m.join_channel_rate)}`);
    console.log(
      `time_to_first_join_sec: median=${m.time_to_first_join_sec.median ?? 'n/a'} p95=${m.time_to_first_join_sec.p95 ?? 'n/a'} samples=${m.time_to_first_join_sec.samples}`,
    );
    console.log(`channel_page_visit_rate: ${pct(m.channel_page_visit_rate)}`);
    console.log(`suggested_click_through_rate: ${pct(m.suggested_click_through_rate)}`);
    console.log(`zero_join_cta_click_rate: ${pct(m.zero_join_cta_click_rate)}`);
    console.log('join_fail_bucket_distribution:', m.join_fail_bucket_distribution);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
