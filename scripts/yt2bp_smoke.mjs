#!/usr/bin/env node
import fs from 'node:fs';

const EXPECTED_FAIL_BUCKETS = new Set([
  'NO_CAPTIONS',
  'PROVIDER_FAIL',
  'SAFETY_BLOCKED',
  'GENERATION_FAIL',
  'TRANSCRIPT_EMPTY',
  'TIMEOUT',
]);

function parseArgs(argv) {
  const args = argv.slice(2);
  const read = (flag, fallback = null) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    baseUrl: read('--base-url', process.env.YT2BP_BASE_URL || 'http://localhost:8787'),
    file: read('--file', 'docs/app/yt2bp_smoke_urls.txt'),
    maxMs: Number(read('--max-ms', '120000')),
    json: args.includes('--json'),
  };
}

function parseCases(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => !l.startsWith('#'));
  const cases = lines.map((line) => {
    const [kind, url] = line.split('|').map((x) => x?.trim());
    if (!kind || !url) throw new Error(`Invalid line in ${filePath}: ${line}`);
    return { kind, url };
  });
  if (!cases.length) throw new Error(`No smoke cases found in ${filePath}`);
  return cases;
}

async function runCase(baseUrl, item, maxMs) {
  const started = Date.now();
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/youtube-to-blueprint`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_url: item.url,
      generate_review: false,
      generate_banner: false,
      source: 'youtube_mvp',
    }),
  });
  const durationMs = Date.now() - started;
  const body = await response.json().catch(() => ({}));
  const ok = Boolean(body?.ok);
  let errorCode = body?.error_code || null;
  if (!errorCode && response.status === 504) errorCode = 'TIMEOUT';

  let pass = false;
  let reason = '';

  if (item.kind === 'success') {
    pass = ok && durationMs <= maxMs;
    reason = pass ? 'ok' : `expected success within ${maxMs}ms`;
  } else if (item.kind === 'expected_fail') {
    pass = !ok && errorCode && EXPECTED_FAIL_BUCKETS.has(errorCode);
    reason = pass ? 'ok' : `expected fail bucket in ${[...EXPECTED_FAIL_BUCKETS].join(',')}`;
  } else if (item.kind === 'edge') {
    pass = durationMs <= maxMs && (ok || (!ok && errorCode && EXPECTED_FAIL_BUCKETS.has(errorCode)));
    reason = pass ? 'ok' : 'expected success or known fail bucket';
  } else {
    throw new Error(`Unknown smoke case kind: ${item.kind}`);
  }

  return {
    kind: item.kind,
    url: item.url,
    http_status: response.status,
    ok,
    error_code: errorCode,
    duration_ms: durationMs,
    pass,
    reason,
  };
}

async function main() {
  const { baseUrl, file, maxMs, json } = parseArgs(process.argv);
  const cases = parseCases(file);
  const results = [];

  for (const item of cases) {
    // run sequentially to avoid self-induced rate limit noise
    // and keep incident triage deterministic.
    // eslint-disable-next-line no-await-in-loop
    const result = await runCase(baseUrl, item, maxMs);
    results.push(result);
  }

  const failed = results.filter((r) => !r.pass);
  const verdict = failed.length === 0 ? 'PASS' : 'FAIL';

  if (json) {
    console.log(JSON.stringify({ verdict, base_url: baseUrl, max_ms: maxMs, results }, null, 2));
    process.exit(failed.length === 0 ? 0 : 1);
  }

  console.log(`YT2BP Smoke (${verdict})`);
  console.log(`- base_url: ${baseUrl}`);
  console.log(`- max_ms: ${maxMs}`);
  for (const r of results) {
    console.log(`- [${r.pass ? 'PASS' : 'FAIL'}] ${r.kind} ${r.url}`);
    console.log(`  status=${r.http_status} ok=${r.ok} error=${r.error_code ?? 'none'} duration_ms=${r.duration_ms} reason=${r.reason}`);
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
