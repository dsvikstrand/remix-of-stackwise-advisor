export type TranscriptPruningConfig = {
  enabled: boolean;
  budgetChars: number;
  thresholds: [number, number, number];
  windows: [number, number, number, number];
  separator: string;
  minWindowChars: number;
};

export type TranscriptPruningWindow = {
  index: number;
  start: number;
  end: number;
};

export type TranscriptPruningResult = {
  text: string;
  meta: {
    enabled: boolean;
    applied: boolean;
    original_chars: number;
    pruned_chars: number;
    budget_chars: number;
    window_count: number;
    threshold_bucket: string;
    windows: TranscriptPruningWindow[];
  };
};

const DEFAULT_SEPARATOR = '\n\n...\n\n';

const DEFAULT_CONFIG: TranscriptPruningConfig = {
  enabled: true,
  budgetChars: 4500,
  thresholds: [4500, 9000, 16000],
  windows: [1, 4, 6, 8],
  separator: DEFAULT_SEPARATOR,
  minWindowChars: 120,
};

function parseBoolean(raw: unknown, fallback: boolean) {
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(raw: unknown) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  if (rounded <= 0) return null;
  return rounded;
}

function parseCsvPositiveInts(raw: unknown) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const values = text
    .split(',')
    .map((part) => parsePositiveInt(part.trim()))
    .filter((value): value is number => value != null);
  return values.length > 0 ? values : null;
}

function normalizeTranscriptText(input: string) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function buildThresholdBucket(length: number, thresholds: [number, number, number]) {
  const [t1, t2, t3] = thresholds;
  if (length <= t1) return `<=${t1}`;
  if (length <= t2) return `${t1 + 1}-${t2}`;
  if (length <= t3) return `${t2 + 1}-${t3}`;
  return `>${t3}`;
}

function resolveWindowCount(length: number, config: TranscriptPruningConfig) {
  const [t1, t2, t3] = config.thresholds;
  const [w1, w2, w3, w4] = config.windows;
  if (length <= t1) return w1;
  if (length <= t2) return w2;
  if (length <= t3) return w3;
  return w4;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeWindowPositions(input: {
  transcriptLength: number;
  windowCount: number;
  windowSize: number;
}) {
  const { transcriptLength, windowCount, windowSize } = input;
  const maxStart = Math.max(0, transcriptLength - windowSize);
  const rawWindows: TranscriptPruningWindow[] = [];

  for (let i = 0; i < windowCount; i += 1) {
    const center = windowCount <= 1
      ? Math.floor((transcriptLength - 1) / 2)
      : Math.round((i * (transcriptLength - 1)) / (windowCount - 1));
    const start = clamp(center - Math.floor(windowSize / 2), 0, maxStart);
    const end = Math.min(transcriptLength, start + windowSize);
    rawWindows.push({
      index: i,
      start,
      end,
    });
  }

  const deduped: TranscriptPruningWindow[] = [];
  const seen = new Set<string>();
  for (const row of rawWindows) {
    const key = `${row.start}:${row.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped.sort((a, b) => a.start - b.start);
}

export function readTranscriptPruningConfigFromEnv(env: Record<string, unknown> = process.env) {
  const warnings: string[] = [];
  const enabled = parseBoolean(env.YT2BP_TRANSCRIPT_PRUNE_ENABLED, DEFAULT_CONFIG.enabled);

  let budgetChars = parsePositiveInt(env.YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS) || DEFAULT_CONFIG.budgetChars;
  if (!parsePositiveInt(env.YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS) && String(env.YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS || '').trim()) {
    warnings.push('YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS is invalid. Falling back to 4500.');
  }
  budgetChars = clamp(budgetChars, 500, 200_000);

  const parsedThresholds = parseCsvPositiveInts(env.YT2BP_TRANSCRIPT_PRUNE_THRESHOLDS);
  let thresholds: [number, number, number] = DEFAULT_CONFIG.thresholds;
  if (parsedThresholds) {
    if (
      parsedThresholds.length === 3
      && parsedThresholds[0] < parsedThresholds[1]
      && parsedThresholds[1] < parsedThresholds[2]
    ) {
      thresholds = [parsedThresholds[0], parsedThresholds[1], parsedThresholds[2]];
    } else {
      warnings.push('YT2BP_TRANSCRIPT_PRUNE_THRESHOLDS is invalid. Falling back to 4500,9000,16000.');
    }
  } else if (String(env.YT2BP_TRANSCRIPT_PRUNE_THRESHOLDS || '').trim()) {
    warnings.push('YT2BP_TRANSCRIPT_PRUNE_THRESHOLDS is invalid. Falling back to 4500,9000,16000.');
  }

  const parsedWindows = parseCsvPositiveInts(env.YT2BP_TRANSCRIPT_PRUNE_WINDOWS);
  let windows: [number, number, number, number] = DEFAULT_CONFIG.windows;
  if (parsedWindows) {
    if (
      parsedWindows.length === 4
      && parsedWindows[0] <= parsedWindows[1]
      && parsedWindows[1] <= parsedWindows[2]
      && parsedWindows[2] <= parsedWindows[3]
      && parsedWindows.every((value) => value >= 1)
    ) {
      windows = [parsedWindows[0], parsedWindows[1], parsedWindows[2], parsedWindows[3]];
    } else {
      warnings.push('YT2BP_TRANSCRIPT_PRUNE_WINDOWS is invalid. Falling back to 1,4,6,8.');
    }
  } else if (String(env.YT2BP_TRANSCRIPT_PRUNE_WINDOWS || '').trim()) {
    warnings.push('YT2BP_TRANSCRIPT_PRUNE_WINDOWS is invalid. Falling back to 1,4,6,8.');
  }

  return {
    config: {
      enabled,
      budgetChars,
      thresholds,
      windows,
      separator: DEFAULT_SEPARATOR,
      minWindowChars: DEFAULT_CONFIG.minWindowChars,
    } as TranscriptPruningConfig,
    warnings,
  };
}

export function pruneTranscriptForGeneration(input: {
  transcriptText: string;
  config: TranscriptPruningConfig;
}) {
  const normalized = normalizeTranscriptText(input.transcriptText);
  const originalChars = normalized.length;
  const thresholdBucket = buildThresholdBucket(originalChars, input.config.thresholds);
  const disabledMeta = {
    enabled: input.config.enabled,
    applied: false,
    original_chars: originalChars,
    pruned_chars: originalChars,
    budget_chars: input.config.budgetChars,
    window_count: 1,
    threshold_bucket: thresholdBucket,
    windows: [] as TranscriptPruningWindow[],
  };

  if (!input.config.enabled) {
    return {
      text: normalized,
      meta: disabledMeta,
    } satisfies TranscriptPruningResult;
  }

  if (originalChars <= input.config.budgetChars) {
    return {
      text: normalized,
      meta: disabledMeta,
    } satisfies TranscriptPruningResult;
  }

  const requestedWindowCount = resolveWindowCount(originalChars, input.config);
  const windowCount = Math.max(1, requestedWindowCount);
  const separatorOverhead = input.config.separator.length * Math.max(0, windowCount - 1);
  const contentBudget = Math.max(1, input.config.budgetChars - separatorOverhead);
  const baseWindowSize = Math.max(1, Math.floor(contentBudget / windowCount));
  const minWindowFloor = Math.max(1, Math.min(input.config.minWindowChars, baseWindowSize));
  const windowSize = Math.max(minWindowFloor, baseWindowSize);

  const windows = computeWindowPositions({
    transcriptLength: originalChars,
    windowCount,
    windowSize,
  });

  const slices = windows.map((window) => normalized.slice(window.start, window.end));
  let pruned = slices.join(input.config.separator).trim();
  if (pruned.length > input.config.budgetChars) {
    pruned = pruned.slice(0, input.config.budgetChars).trimEnd();
  }

  return {
    text: pruned,
    meta: {
      enabled: input.config.enabled,
      applied: true,
      original_chars: originalChars,
      pruned_chars: pruned.length,
      budget_chars: input.config.budgetChars,
      window_count: windows.length,
      threshold_bucket: thresholdBucket,
      windows,
    },
  } satisfies TranscriptPruningResult;
}
