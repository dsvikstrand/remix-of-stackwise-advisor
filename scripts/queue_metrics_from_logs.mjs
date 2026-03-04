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
    lines: Number(read('--lines', '4000')),
  };
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

const MONTH_INDEX = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

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

function parseTimestampPrefix(line) {
  const match = line.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, monthToken, dayToken, hourToken, minuteToken, secondToken] = match;
  const monthIndex = MONTH_INDEX[monthToken];
  if (monthIndex == null) return null;
  const now = new Date();
  const candidate = new Date(
    now.getFullYear(),
    monthIndex,
    Number(dayToken),
    Number(hourToken),
    Number(minuteToken),
    Number(secondToken),
    0,
  );
  if (!Number.isFinite(candidate.getTime())) return null;
  if (candidate.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
    candidate.setFullYear(candidate.getFullYear() - 1);
  }
  return candidate.getTime();
}

function parseQueueMetricsFromLogText(raw) {
  const lines = raw.split(/\r?\n/);
  const finishedDurations = [];
  const timestamps = [];
  const errorBuckets = new Map();
  const scopeBuckets = new Map();
  let finishedCount = 0;
  let failedCount = 0;

  for (const line of lines) {
    const match = line.match(/\[(unlock_job_finished|unlock_job_failed)\]\s+(\{.*\})/);
    if (!match) continue;
    const event = match[1];
    let payload;
    try {
      payload = JSON.parse(match[2]);
    } catch {
      continue;
    }
    const timestampMs = parseTimestampPrefix(line);
    if (timestampMs != null) timestamps.push(timestampMs);

    const scopeRaw = typeof payload.scope === 'string' ? payload.scope.trim() : '';
    if (scopeRaw) {
      scopeBuckets.set(scopeRaw, (scopeBuckets.get(scopeRaw) ?? 0) + 1);
    }

    if (event === 'unlock_job_finished') {
      finishedCount += 1;
      const duration = Number(payload.duration_ms);
      if (Number.isFinite(duration)) finishedDurations.push(duration);
      continue;
    }

    failedCount += 1;
    const errorKey = typeof payload.error_code === 'string' && payload.error_code.trim().length > 0
      ? payload.error_code.trim()
      : 'UNKNOWN';
    errorBuckets.set(errorKey, (errorBuckets.get(errorKey) ?? 0) + 1);
  }

  const sortedDurations = finishedDurations.slice().sort((a, b) => a - b);
  const sortedTimestamps = timestamps.slice().sort((a, b) => a - b);
  let jobsPerMinuteEstimate = null;
  if (sortedTimestamps.length >= 2) {
    const windowMs = sortedTimestamps[sortedTimestamps.length - 1] - sortedTimestamps[0];
    if (windowMs > 0) {
      jobsPerMinuteEstimate = Number((((finishedCount + failedCount) * 60_000) / windowMs).toFixed(2));
    }
  }

  return {
    finished_count: finishedCount,
    failed_count: failedCount,
    duration_median_ms: median(sortedDurations),
    duration_p95_ms: percentile(sortedDurations, 95),
    duration_max_ms: sortedDurations.length ? sortedDurations[sortedDurations.length - 1] : null,
    jobs_per_minute_estimate: jobsPerMinuteEstimate,
    error_code_distribution: Object.fromEntries([...errorBuckets.entries()].sort((a, b) => b[1] - a[1])),
    scope_distribution: Object.fromEntries([...scopeBuckets.entries()].sort((a, b) => b[1] - a[1])),
  };
}

function main() {
  const { source, json, lines } = parseArgs(process.argv);
  const raw = readRaw(source, lines);
  const summary = {
    source,
    ...parseQueueMetricsFromLogText(raw),
  };

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('Queue Metrics Summary');
  console.log(`- source: ${summary.source}`);
  console.log(`- finished_count: ${summary.finished_count}`);
  console.log(`- failed_count: ${summary.failed_count}`);
  console.log(`- duration_median_ms: ${summary.duration_median_ms ?? 'n/a'}`);
  console.log(`- duration_p95_ms: ${summary.duration_p95_ms ?? 'n/a'}`);
  console.log(`- duration_max_ms: ${summary.duration_max_ms ?? 'n/a'}`);
  console.log(`- jobs_per_minute_estimate: ${summary.jobs_per_minute_estimate ?? 'n/a'}`);

  console.log('- scope_distribution:');
  if (Object.keys(summary.scope_distribution).length === 0) {
    console.log('  - none');
  } else {
    for (const [key, value] of Object.entries(summary.scope_distribution)) {
      console.log(`  - ${key}: ${value}`);
    }
  }

  console.log('- error_code_distribution:');
  if (Object.keys(summary.error_code_distribution).length === 0) {
    console.log('  - none');
  } else {
    for (const [key, value] of Object.entries(summary.error_code_distribution)) {
      console.log(`  - ${key}: ${value}`);
    }
  }
}

main();
