export type QueueLogMetrics = {
  finished_count: number;
  failed_count: number;
  duration_median_ms: number | null;
  duration_p95_ms: number | null;
  duration_max_ms: number | null;
  jobs_per_minute_estimate: number | null;
  error_code_distribution: Record<string, number>;
  scope_distribution: Record<string, number>;
};

type ParsedQueueEvent = {
  event: 'unlock_job_finished' | 'unlock_job_failed';
  payload: Record<string, unknown>;
  timestampMs: number | null;
};

const MONTH_INDEX: Record<string, number> = {
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

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  const clamped = Math.max(0, Math.min(sorted.length - 1, idx));
  return sorted[clamped] ?? null;
}

function median(sorted: number[]) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid] ?? null;
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseTimestampPrefix(line: string) {
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

function parseLine(line: string): ParsedQueueEvent | null {
  const match = line.match(/\[(unlock_job_finished|unlock_job_failed)\]\s+(\{.*\})/);
  if (!match) return null;
  const event = match[1] as ParsedQueueEvent['event'];
  const payloadRaw = match[2];
  try {
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    return {
      event,
      payload,
      timestampMs: parseTimestampPrefix(line),
    };
  } catch {
    return null;
  }
}

export function parseQueueMetricsFromLogText(raw: string): QueueLogMetrics {
  const lines = raw.split(/\r?\n/);
  const parsed = lines
    .map((line) => parseLine(line))
    .filter((entry): entry is ParsedQueueEvent => entry != null);

  const finishedDurations: number[] = [];
  const timestamps: number[] = [];
  const errorBuckets = new Map<string, number>();
  const scopeBuckets = new Map<string, number>();

  let finishedCount = 0;
  let failedCount = 0;

  for (const entry of parsed) {
    if (entry.timestampMs != null) timestamps.push(entry.timestampMs);

    const scopeRaw = typeof entry.payload.scope === 'string' ? entry.payload.scope.trim() : '';
    if (scopeRaw) {
      scopeBuckets.set(scopeRaw, (scopeBuckets.get(scopeRaw) ?? 0) + 1);
    }

    if (entry.event === 'unlock_job_finished') {
      finishedCount += 1;
      const duration = toFiniteNumber(entry.payload.duration_ms);
      if (duration != null) finishedDurations.push(duration);
      continue;
    }

    failedCount += 1;
    const errorCodeRaw = typeof entry.payload.error_code === 'string' ? entry.payload.error_code.trim() : '';
    const errorKey = errorCodeRaw || 'UNKNOWN';
    errorBuckets.set(errorKey, (errorBuckets.get(errorKey) ?? 0) + 1);
  }

  const sortedDurations = finishedDurations.slice().sort((a, b) => a - b);
  const sortedTimestamps = timestamps.slice().sort((a, b) => a - b);
  let jobsPerMinuteEstimate: number | null = null;
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
