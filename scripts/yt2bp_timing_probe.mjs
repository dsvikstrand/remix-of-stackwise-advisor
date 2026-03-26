#!/usr/bin/env node
import './require-node20.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const read = (flag, fallback = null) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : fallback;
  };

  return {
    baseUrl: read('--base-url', process.env.YT2BP_BASE_URL || 'http://localhost:8787'),
    videoUrl: read('--video-url', ''),
    timeoutMs: Number(read('--timeout-ms', '180000')),
    maxEvents: Number(read('--max-events', '200')),
    json: args.includes('--json'),
    anonymous: args.includes('--anonymous'),
    traceAuthBearer: read('--trace-auth-bearer', process.env.YT2BP_TRACE_AUTH_BEARER || ''),
    email: read('--email', process.env.BLEU_ACCOUNT_1_EMAIL || ''),
    password: read('--password', process.env.BLEU_ACCOUNT_1_PASSWORD || ''),
  };
}

function normalizeEnvValue(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadLocalEnvFallback() {
  const candidate = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(candidate)) return;
  const raw = fs.readFileSync(candidate, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) continue;
    const value = normalizeEnvValue(trimmed.slice(separator + 1));
    process.env[key] = value;
  }
}

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function parseTimeMs(value) {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const parts = [];
  const source = String(payload.source || '').trim();
  const chars = Number(payload.chars);
  const words = Number(payload.words);
  const errorCode = String(payload.error_code || '').trim();
  const qualityIssues = Array.isArray(payload.issues) ? payload.issues.join(',') : '';

  if (source) parts.push(`source=${source}`);
  if (Number.isFinite(chars)) parts.push(`chars=${chars}`);
  if (Number.isFinite(words)) parts.push(`words=${words}`);
  if (errorCode) parts.push(`error=${errorCode}`);
  if (qualityIssues) parts.push(`issues=${qualityIssues}`);

  return parts.length > 0 ? parts.join(' ') : null;
}

function findFirstEvent(events, name) {
  return events.find((event) => event.event === name) || null;
}

function findLastEvent(events, name) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.event === name) return events[index];
  }
  return null;
}

function extractTranscriptSource(events, run) {
  const transcriptLoaded = findLastEvent(events, 'transcript_loaded');
  const payload = transcriptLoaded?.payload || {};
  const source = String(payload.source || payload.transcript_source || '').trim();
  if (source) return source;

  const summary = run?.summary && typeof run.summary === 'object' ? run.summary : {};
  return String(summary.transcript_source || '').trim() || null;
}

function buildEventTimeline(events, runStartedMs) {
  const normalized = [];
  let previousMs = runStartedMs;

  for (const event of events) {
    const eventMs = parseTimeMs(event.created_at);
    const sinceStartMs = runStartedMs != null && eventMs != null
      ? Math.max(0, eventMs - runStartedMs)
      : null;
    const deltaMs = previousMs != null && eventMs != null
      ? Math.max(0, eventMs - previousMs)
      : null;

    normalized.push({
      seq: Number(event.seq || 0),
      level: String(event.level || '').trim() || null,
      event: String(event.event || '').trim() || 'unknown',
      created_at: event.created_at || null,
      since_start_ms: sinceStartMs,
      delta_ms: deltaMs,
      payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
      payload_summary: summarizePayload(event.payload),
    });

    previousMs = eventMs;
  }

  return normalized;
}

function buildDerivedTimingSummary(run, timeline) {
  const runStartedMs = parseTimeMs(run?.started_at);
  const runFinishedMs = parseTimeMs(run?.finished_at);
  const persistedRunDurationMs = runStartedMs != null && runFinishedMs != null
    ? Math.max(0, runFinishedMs - runStartedMs)
    : null;

  const firstPrompt = timeline.find((item) => item.event === 'prompt_rendered') || null;
  const lastModelResolution = findLastEvent(timeline, 'model_resolution');
  const transcriptLoaded = findLastEvent(timeline, 'transcript_loaded');
  const pipelineStarted = findFirstEvent(timeline, 'pipeline_started');
  const terminal = findLastEvent(timeline, 'pipeline_succeeded') || findLastEvent(timeline, 'pipeline_failed');

  return {
    persisted_run_duration_ms: persistedRunDurationMs,
    time_to_pipeline_started_ms: pipelineStarted?.since_start_ms ?? null,
    time_to_transcript_loaded_ms: transcriptLoaded?.since_start_ms ?? null,
    time_to_first_prompt_ms: firstPrompt?.since_start_ms ?? null,
    time_to_last_model_resolution_ms: lastModelResolution?.since_start_ms ?? null,
    time_to_terminal_ms: terminal?.since_start_ms ?? null,
    transcript_stage_ms:
      pipelineStarted?.since_start_ms != null && transcriptLoaded?.since_start_ms != null
        ? Math.max(0, transcriptLoaded.since_start_ms - pipelineStarted.since_start_ms)
        : null,
    model_stage_ms:
      firstPrompt?.since_start_ms != null && lastModelResolution?.since_start_ms != null
        ? Math.max(0, lastModelResolution.since_start_ms - firstPrompt.since_start_ms)
        : null,
    post_model_to_terminal_ms:
      lastModelResolution?.since_start_ms != null && terminal?.since_start_ms != null
        ? Math.max(0, terminal.since_start_ms - lastModelResolution.since_start_ms)
        : null,
  };
}

async function fetchJsonWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    return {
      response,
      text,
      json: safeJsonParse(text),
      duration_ms: durationMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runGeneration(input) {
  const endpoint = `${input.baseUrl.replace(/\/$/, '')}/api/youtube-to-blueprint`;
  const payload = {
    video_url: input.videoUrl,
    generate_review: false,
    generate_banner: false,
    source: 'youtube_mvp',
  };

  const result = await fetchJsonWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(input.authBearer ? { Authorization: `Bearer ${input.authBearer}` } : {}),
    },
    body: JSON.stringify(payload),
  }, input.timeoutMs);

  return {
    endpoint,
    request_payload: payload,
    http_status: result.response.status,
    ok: Boolean(result.json?.ok),
    duration_ms: result.duration_ms,
    run_id: String(result.json?.run_id || result.json?.data?.run_id || '').trim() || null,
    error_code: result.json?.error_code || null,
    error_message: result.json?.message || null,
    response_json: result.json,
  };
}

async function resolveUserAuthBearer(input) {
  loadLocalEnvFallback();
  if (input.anonymous) return null;

  const existingBearer = String(input.traceAuthBearer || process.env.YT2BP_TRACE_AUTH_BEARER || '').trim();
  if (existingBearer) return existingBearer;

  const url = String(process.env.VITE_SUPABASE_URL || '').trim();
  const publishableKey = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  const email = String(input.email || process.env.BLEU_ACCOUNT_1_EMAIL || '').trim();
  const password = String(input.password || process.env.BLEU_ACCOUNT_1_PASSWORD || '').trim();
  if (!url || !publishableKey || !email || !password) return null;

  const client = createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw new Error(`Probe sign-in failed: ${error.message}`);
  }
  return String(data.session?.access_token || '').trim() || null;
}

async function fetchTraceViaApi(input) {
  if (!input.traceAuthBearer) {
    return {
      ok: false,
      source: 'api',
      error: 'trace auth bearer not configured',
    };
  }

  const url = `${input.baseUrl.replace(/\/$/, '')}/api/generation-runs/${encodeURIComponent(input.runId)}?include_events=1&limit=${input.maxEvents}`;
  const result = await fetchJsonWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.traceAuthBearer}`,
    },
  }, input.timeoutMs);

  if (!result.response.ok || !result.json?.ok || !result.json?.data) {
    return {
      ok: false,
      source: 'api',
      error: result.json?.message || `trace api failed (${result.response.status})`,
      http_status: result.response.status,
    };
  }

  return {
    ok: true,
    source: 'api',
    run: result.json.data,
    events: Array.isArray(result.json.data.events) ? result.json.data.events : [],
  };
}

function createServiceSupabaseClient() {
  loadLocalEnvFallback();
  const url = String(process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchTraceViaSupabase(input) {
  const client = createServiceSupabaseClient();
  if (!client) {
    return {
      ok: false,
      source: 'supabase',
      error: 'VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured',
    };
  }

  const { data: run, error: runError } = await client
    .from('generation_runs')
    .select('*')
    .eq('run_id', input.runId)
    .maybeSingle();
  if (runError) {
    return {
      ok: false,
      source: 'supabase',
      error: runError.message,
    };
  }
  if (!run) {
    return {
      ok: false,
      source: 'supabase',
      error: 'generation run not found',
    };
  }

  const { data: events, error: eventsError } = await client
    .from('generation_run_events')
    .select('id, run_id, seq, level, event, payload, created_at')
    .eq('run_id', input.runId)
    .order('id', { ascending: true })
    .limit(input.maxEvents);
  if (eventsError) {
    return {
      ok: false,
      source: 'supabase',
      error: eventsError.message,
    };
  }

  return {
    ok: true,
    source: 'supabase',
    run,
    events: Array.isArray(events) ? events : [],
  };
}

function printHumanReadable(result) {
  console.log('YT2BP Timing Probe');
  console.log(`- base_url: ${result.base_url}`);
  console.log(`- video_url: ${result.video_url}`);
  console.log(`- request_http_status: ${result.request.http_status}`);
  console.log(`- request_ok: ${result.request.ok}`);
  console.log(`- request_duration_ms: ${result.request.duration_ms}`);
  console.log(`- run_id: ${result.request.run_id || 'n/a'}`);
  console.log(`- trace_source: ${result.trace.source}`);
  console.log(`- run_status: ${result.trace.run?.status || 'n/a'}`);
  console.log(`- transcript_source: ${result.summary.transcript_source || 'n/a'}`);
  console.log(`- model_used: ${result.summary.model_used || 'n/a'}`);
  console.log(`- persisted_run_duration_ms: ${result.summary.persisted_run_duration_ms ?? 'n/a'}`);
  console.log(`- time_to_transcript_loaded_ms: ${result.summary.time_to_transcript_loaded_ms ?? 'n/a'}`);
  console.log(`- model_stage_ms: ${result.summary.model_stage_ms ?? 'n/a'}`);
  console.log(`- post_model_to_terminal_ms: ${result.summary.post_model_to_terminal_ms ?? 'n/a'}`);
  console.log('- events:');

  if (!result.timeline.length) {
    console.log('  - none');
    return;
  }

  for (const event of result.timeline) {
    const sinceStart = event.since_start_ms == null ? 'n/a' : `+${event.since_start_ms}ms`;
    const delta = event.delta_ms == null ? 'n/a' : `Δ${event.delta_ms}ms`;
    const payloadSummary = event.payload_summary ? ` ${event.payload_summary}` : '';
    console.log(`  - [${event.seq}] ${event.event} ${sinceStart} ${delta}${payloadSummary}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const timeoutMs = clampInt(args.timeoutMs, 180000, 5000, 600000);
  const maxEvents = clampInt(args.maxEvents, 200, 1, 1000);
  const videoUrl = String(args.videoUrl || '').trim();
  if (!videoUrl) {
    throw new Error('--video-url is required.');
  }
  const authBearer = await resolveUserAuthBearer(args);

  const request = await runGeneration({
    baseUrl: args.baseUrl,
    videoUrl,
    timeoutMs,
    authBearer,
  });

  if (!request.run_id) {
    const output = {
      base_url: args.baseUrl,
      video_url: videoUrl,
      request,
      trace: {
        ok: false,
        source: null,
        error: 'run_id missing from generation response',
      },
    };
    if (args.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log('YT2BP Timing Probe');
      console.log(`- request_http_status: ${request.http_status}`);
      console.log(`- request_ok: ${request.ok}`);
      console.log(`- request_duration_ms: ${request.duration_ms}`);
      console.log(`- error_code: ${request.error_code || 'n/a'}`);
      console.log(`- error_message: ${request.error_message || 'n/a'}`);
      console.log('- trace: unavailable (missing run_id)');
    }
    process.exitCode = 1;
    return;
  }

  const apiTrace = await fetchTraceViaApi({
    baseUrl: args.baseUrl,
    runId: request.run_id,
    maxEvents,
    timeoutMs,
    traceAuthBearer: authBearer || String(args.traceAuthBearer || '').trim(),
  });
  const trace = apiTrace.ok
    ? apiTrace
    : await fetchTraceViaSupabase({
        runId: request.run_id,
        maxEvents,
      });

  if (!trace.ok) {
    const output = {
      base_url: args.baseUrl,
      video_url: videoUrl,
      request,
      trace,
    };
    if (args.json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log('YT2BP Timing Probe');
      console.log(`- request_http_status: ${request.http_status}`);
      console.log(`- request_ok: ${request.ok}`);
      console.log(`- request_duration_ms: ${request.duration_ms}`);
      console.log(`- run_id: ${request.run_id}`);
      console.log(`- trace_error: ${trace.error}`);
    }
    process.exitCode = 1;
    return;
  }

  const run = trace.run || {};
  const runStartedMs = parseTimeMs(run.timing?.started_at || run.started_at);
  const rawEvents = Array.isArray(trace.events) ? [...trace.events] : [];
  rawEvents.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  const timeline = buildEventTimeline(rawEvents, runStartedMs);
  const derived = buildDerivedTimingSummary(run.timing || run, timeline);
  const transcriptSource = extractTranscriptSource(rawEvents, run);
  const modelUsed = String(run.model?.used || run.model_used || '').trim() || null;

  const output = {
    base_url: args.baseUrl,
    video_url: videoUrl,
    request,
    trace: {
      ok: true,
      source: trace.source,
      run,
      events: rawEvents,
    },
    summary: {
      transcript_source: transcriptSource,
      model_used: modelUsed,
      ...derived,
    },
    timeline,
  };

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  printHumanReadable(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
