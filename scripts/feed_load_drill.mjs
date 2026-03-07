#!/usr/bin/env node

function parseArgs(argv) {
  const options = {
    baseUrl: 'https://api.bleup.app',
    urls: ['/wall', '/my-feed', '/api/credits', '/api/ingestion/jobs/latest-mine'],
    requests: 120,
    concurrency: 8,
    timeoutMs: 10_000,
    authToken: '',
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--base-url' && next) {
      options.baseUrl = String(next).trim();
      i += 1;
      continue;
    }
    if (arg === '--urls' && next) {
      options.urls = String(next)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === '--requests' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) options.requests = Math.floor(parsed);
      i += 1;
      continue;
    }
    if (arg === '--concurrency' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) options.concurrency = Math.floor(parsed);
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms' && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed > 0) options.timeoutMs = Math.floor(parsed);
      i += 1;
      continue;
    }
    if (arg === '--auth-token' && next) {
      options.authToken = String(next).trim();
      i += 1;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
    }
  }

  if (!options.urls.length) {
    throw new Error('At least one URL path is required.');
  }
  return options;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function formatSummary(summary) {
  const lines = [];
  lines.push('Feed load drill summary');
  lines.push(`base_url: ${summary.base_url}`);
  lines.push(`paths: ${summary.paths.join(', ')}`);
  lines.push(`requests_total: ${summary.requests_total}`);
  lines.push(`requests_succeeded: ${summary.requests_succeeded}`);
  lines.push(`requests_failed: ${summary.requests_failed}`);
  lines.push(`duration_ms_total: ${summary.duration_ms_total}`);
  lines.push(`latency_p50_ms: ${summary.latency_p50_ms}`);
  lines.push(`latency_p95_ms: ${summary.latency_p95_ms}`);
  lines.push(`latency_max_ms: ${summary.latency_max_ms}`);
  lines.push('status_distribution:');
  Object.entries(summary.status_distribution).forEach(([code, count]) => {
    lines.push(`  ${code}: ${count}`);
  });
  if (Object.keys(summary.failure_examples).length) {
    lines.push('failure_examples:');
    Object.entries(summary.failure_examples).forEach(([key, count]) => {
      lines.push(`  ${key}: ${count}`);
    });
  }
  return lines.join('\n');
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  let cursor = 0;
  const latencies = [];
  const statusDistribution = {};
  const failureExamples = {};
  let succeeded = 0;
  let failed = 0;

  async function runOne(requestIndex) {
    const path = options.urls[requestIndex % options.urls.length];
    const url = `${options.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    const reqStart = Date.now();
    try {
      const headers = {};
      if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      const durationMs = Date.now() - reqStart;
      latencies.push(durationMs);
      const code = String(response.status);
      statusDistribution[code] = (statusDistribution[code] || 0) + 1;
      if (response.ok) {
        succeeded += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      const durationMs = Date.now() - reqStart;
      latencies.push(durationMs);
      failed += 1;
      statusDistribution.ERR = (statusDistribution.ERR || 0) + 1;
      const key = error instanceof Error ? `${error.name}:${error.message}` : String(error);
      failureExamples[key] = (failureExamples[key] || 0) + 1;
    } finally {
      clearTimeout(timer);
    }
  }

  const workers = Array.from({ length: options.concurrency }).map(async () => {
    while (true) {
      const next = cursor;
      cursor += 1;
      if (next >= options.requests) break;
      await runOne(next);
    }
  });
  await Promise.all(workers);

  const durationMsTotal = Date.now() - startedAt;
  const summary = {
    captured_at: new Date().toISOString(),
    base_url: options.baseUrl,
    paths: options.urls,
    requests_total: options.requests,
    requests_succeeded: succeeded,
    requests_failed: failed,
    duration_ms_total: durationMsTotal,
    latency_p50_ms: percentile(latencies, 50),
    latency_p95_ms: percentile(latencies, 95),
    latency_max_ms: latencies.length ? Math.max(...latencies) : null,
    status_distribution: statusDistribution,
    failure_examples: failureExamples,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(formatSummary(summary));
}

run().catch((error) => {
  console.error('[feed_load_drill_failed]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
