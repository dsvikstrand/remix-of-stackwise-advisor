type OpenAIDailyCostSnapshot = {
  amountUsd: number;
  currency: string;
  windowStartIso: string;
  windowEndIso: string;
  fetchedAtIso: string;
  source: 'openai_costs_api';
};

const DEFAULT_CACHE_SECONDS = 120;

let cachedSnapshot: OpenAIDailyCostSnapshot | null = null;
let cachedWindowStartIso: string | null = null;
let cacheExpiresAtMs = 0;

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function clampInt(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function getAdminKey() {
  return String(process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_API_KEY_ADMIN || '').trim();
}

function getCacheSeconds() {
  return clampInt(process.env.OPENAI_DAILY_COST_CACHE_SECONDS, DEFAULT_CACHE_SECONDS, 0, 3600);
}

function resolveUtcDailyWindow(nowMs = Date.now()) {
  const now = new Date(nowMs);
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startTimeUnix: Math.floor(start.getTime() / 1000),
    windowStartIso: start.toISOString(),
    windowEndIso: end.toISOString(),
  };
}

function readBucketAmountUsd(bucket: any) {
  if (!bucket || typeof bucket !== 'object') return 0;
  if (bucket.amount && typeof bucket.amount === 'object') {
    const direct = Number(bucket.amount.value);
    return Number.isFinite(direct) ? direct : 0;
  }
  if (Array.isArray(bucket.results)) {
    return bucket.results.reduce((sum: number, row: any) => {
      const value = Number(row?.amount?.value);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }
  return 0;
}

export async function getOpenAIDailyCostSnapshot(): Promise<OpenAIDailyCostSnapshot> {
  const adminKey = getAdminKey();
  if (!adminKey) {
    throw new Error('OPENAI_ADMIN_KEY_MISSING');
  }

  const { startTimeUnix, windowStartIso, windowEndIso } = resolveUtcDailyWindow();
  const nowMs = Date.now();
  if (
    cachedSnapshot
    && cachedWindowStartIso === windowStartIso
    && cacheExpiresAtMs > nowMs
  ) {
    return cachedSnapshot;
  }

  const url = new URL('https://api.openai.com/v1/organization/costs');
  url.searchParams.set('start_time', String(startTimeUnix));
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OPENAI_COSTS_API_${response.status}:${body.slice(0, 200)}`);
  }

  const payload = await response.json().catch(() => null) as any;
  const bucket = Array.isArray(payload?.data) ? payload.data[0] : null;
  const amountUsd = round4(readBucketAmountUsd(bucket));
  const snapshot: OpenAIDailyCostSnapshot = {
    amountUsd,
    currency: String(bucket?.amount?.currency || bucket?.results?.[0]?.amount?.currency || 'usd').trim().toLowerCase() || 'usd',
    windowStartIso: typeof bucket?.start_time === 'number'
      ? new Date(bucket.start_time * 1000).toISOString()
      : windowStartIso,
    windowEndIso: typeof bucket?.end_time === 'number'
      ? new Date(bucket.end_time * 1000).toISOString()
      : windowEndIso,
    fetchedAtIso: new Date(nowMs).toISOString(),
    source: 'openai_costs_api',
  };

  cachedSnapshot = snapshot;
  cachedWindowStartIso = windowStartIso;
  cacheExpiresAtMs = nowMs + (getCacheSeconds() * 1000);
  return snapshot;
}

export function resetOpenAIDailyCostCacheForTests() {
  cachedSnapshot = null;
  cachedWindowStartIso = null;
  cacheExpiresAtMs = 0;
}

export type { OpenAIDailyCostSnapshot };
