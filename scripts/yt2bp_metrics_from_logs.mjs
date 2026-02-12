#!/usr/bin/env node
import fs from 'node:fs';
import { execSync } from 'node:child_process';

function parseArgs(argv) {
  const args = argv.slice(2);
  const read = (flag, fallback = null) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : fallback;
  };
  return {
    source: read('--source', 'journalctl'),
    json: args.includes('--json'),
    lines: Number(read('--lines', '2000')),
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  const clamped = Math.max(0, Math.min(sorted.length - 1, idx));
  return sorted[clamped];
}

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function toFixedOrNull(v) {
  return v == null ? null : Number(v.toFixed(2));
}

function readRaw(source, lines) {
  if (source === 'journalctl') {
    return execSync(`journalctl -u agentic-backend.service -n ${lines} --no-pager`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return fs.readFileSync(source, 'utf8');
}

function main() {
  const { source, json, lines } = parseArgs(process.argv);
  const raw = readRaw(source, lines);
  const logLines = raw.split(/\r?\n/);

  const reqLines = logLines.filter((line) => line.includes('POST /api/youtube-to-blueprint'));
  const durations = [];
  const errorBuckets = new Map();

  let successCount = 0;
  let failCount = 0;
  let rateLimitedCount = 0;

  for (const line of reqLines) {
    const statusMatch = line.match(/\s(\d{3})\s([0-9.]+)ms/);
    const status = statusMatch ? Number(statusMatch[1]) : null;
    const durationMs = statusMatch ? Number(statusMatch[2]) : null;
    if (durationMs != null && Number.isFinite(durationMs)) durations.push(durationMs);

    if (status != null) {
      if (status >= 200 && status < 300) successCount += 1;
      else failCount += 1;
    }

    const bucketMatch = line.match(/bucket_error_code=([A-Z_]+)/);
    const bucket = bucketMatch?.[1] ?? (status && status >= 400 ? `HTTP_${status}` : null);
    if (bucket) {
      errorBuckets.set(bucket, (errorBuckets.get(bucket) ?? 0) + 1);
      if (bucket === 'RATE_LIMITED') rateLimitedCount += 1;
    }
  }

  const sortedDurations = durations.slice().sort((a, b) => a - b);
  const summary = {
    submit_count: reqLines.length,
    success_count: successCount,
    fail_count: failCount,
    error_code_distribution: Object.fromEntries([...errorBuckets.entries()].sort((a, b) => b[1] - a[1])),
    median_duration_ms: toFixedOrNull(median(sortedDurations)),
    p95_duration_ms: toFixedOrNull(percentile(sortedDurations, 95)),
    rate_limited_count: rateLimitedCount,
    source,
  };

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('YT2BP Metrics Summary');
  console.log(`- source: ${summary.source}`);
  console.log(`- submit_count: ${summary.submit_count}`);
  console.log(`- success_count: ${summary.success_count}`);
  console.log(`- fail_count: ${summary.fail_count}`);
  console.log(`- median_duration_ms: ${summary.median_duration_ms ?? 'n/a'}`);
  console.log(`- p95_duration_ms: ${summary.p95_duration_ms ?? 'n/a'}`);
  console.log(`- rate_limited_count: ${summary.rate_limited_count}`);
  console.log('- error_code_distribution:');
  if (Object.keys(summary.error_code_distribution).length === 0) {
    console.log('  - none');
  } else {
    for (const [k, v] of Object.entries(summary.error_code_distribution)) {
      console.log(`  - ${k}: ${v}`);
    }
  }
}

main();
