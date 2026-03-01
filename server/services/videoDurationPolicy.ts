export type VideoDurationPolicyDecision = 'allow' | 'too_long' | 'unknown';

export type VideoDurationPolicyConfig = {
  enabled: boolean;
  maxSeconds: number;
  blockUnknown: boolean;
};

export type DurationBlockedItem = {
  video_id: string;
  title: string;
  error_code: 'VIDEO_TOO_LONG' | 'VIDEO_DURATION_UNAVAILABLE';
  reason: 'too_long' | 'unknown';
  max_duration_seconds: number;
  video_duration_seconds: number | null;
};

export function toDurationSeconds(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const normalized = Math.max(0, Math.floor(num));
  return normalized;
}

function parseBoolean(raw: string | undefined, fallback: boolean) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}

function parseIntInRange(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function readVideoDurationPolicyFromEnv(env: NodeJS.ProcessEnv) {
  return {
    enabled: parseBoolean(env.GENERATION_DURATION_CAP_ENABLED, false),
    maxSeconds: parseIntInRange(env.GENERATION_MAX_VIDEO_SECONDS, 2700, 60, 6 * 3600),
    blockUnknown: parseBoolean(env.GENERATION_BLOCK_UNKNOWN_DURATION, true),
    lookupTimeoutMs: parseIntInRange(env.GENERATION_DURATION_LOOKUP_TIMEOUT_MS, 8000, 1000, 30_000),
  };
}

export function classifyVideoDuration(input: {
  durationSeconds: number | null;
  maxSeconds: number;
  blockUnknown: boolean;
}): VideoDurationPolicyDecision {
  const maxSeconds = Math.max(1, Math.floor(input.maxSeconds));
  if (input.durationSeconds == null) {
    return input.blockUnknown ? 'unknown' : 'allow';
  }
  if (input.durationSeconds > maxSeconds) return 'too_long';
  return 'allow';
}

export function toDurationBlockedItem(input: {
  videoId: string;
  title: string;
  durationSeconds: number | null;
  maxSeconds: number;
  decision: Exclude<VideoDurationPolicyDecision, 'allow'>;
}): DurationBlockedItem {
  return {
    video_id: String(input.videoId || '').trim(),
    title: String(input.title || '').trim() || `Video ${String(input.videoId || '').trim()}`,
    error_code: input.decision === 'too_long' ? 'VIDEO_TOO_LONG' : 'VIDEO_DURATION_UNAVAILABLE',
    reason: input.decision,
    max_duration_seconds: Math.max(1, Math.floor(input.maxSeconds)),
    video_duration_seconds: input.durationSeconds == null ? null : Math.max(0, Math.floor(input.durationSeconds)),
  };
}

export function splitByDurationPolicy<T>(input: {
  items: T[];
  config: VideoDurationPolicyConfig;
  getVideoId: (item: T) => string;
  getTitle: (item: T) => string;
  getDurationSeconds: (item: T) => number | null;
}) {
  const allowed: T[] = [];
  const blocked: DurationBlockedItem[] = [];
  if (!input.config.enabled) {
    return { allowed: [...input.items], blocked };
  }

  for (const item of input.items) {
    const durationSeconds = input.getDurationSeconds(item);
    const decision = classifyVideoDuration({
      durationSeconds,
      maxSeconds: input.config.maxSeconds,
      blockUnknown: input.config.blockUnknown,
    });
    if (decision === 'allow') {
      allowed.push(item);
      continue;
    }
    blocked.push(toDurationBlockedItem({
      videoId: input.getVideoId(item),
      title: input.getTitle(item),
      durationSeconds,
      maxSeconds: input.config.maxSeconds,
      decision,
    }));
  }
  return { allowed, blocked };
}

export function buildDurationFilteredReasonCounts(blocked: DurationBlockedItem[]) {
  const counts: Record<'too_long' | 'unknown', number> = {
    too_long: 0,
    unknown: 0,
  };
  for (const row of blocked) {
    if (row.reason === 'too_long') counts.too_long += 1;
    else counts.unknown += 1;
  }
  return counts;
}
