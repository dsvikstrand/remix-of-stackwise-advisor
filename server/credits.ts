import fs from 'fs';
import path from 'path';

type UserUsage = {
  date: string;
  used: number;
};

type UsageState = {
  users: Record<string, UserUsage>;
  global: {
    timestamps: number[];
  };
};

const DAILY_CREDITS = Number(process.env.AI_DAILY_CREDITS) || 10;
const GLOBAL_WINDOW_MS = Number(process.env.AI_GLOBAL_WINDOW_MS) || 10 * 60 * 1000;
const GLOBAL_MAX = Number(process.env.AI_GLOBAL_MAX) || 20;
const CREDITS_BYPASS = /^(1|true|yes)$/i.test(process.env.AI_CREDITS_BYPASS ?? '');
const USAGE_FILE =
  process.env.AI_USAGE_FILE ||
  path.join(process.cwd(), 'server', 'data', 'ai-usage.json');

const state: UsageState = loadState();

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadState(): UsageState {
  try {
    if (!fs.existsSync(USAGE_FILE)) {
      return { users: {}, global: { timestamps: [] } };
    }
    const raw = fs.readFileSync(USAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as UsageState;
    return {
      users: parsed?.users ?? {},
      global: { timestamps: parsed?.global?.timestamps ?? [] },
    };
  } catch {
    return { users: {}, global: { timestamps: [] } };
  }
}

let writeQueue = Promise.resolve();
function persistState() {
  ensureDir(USAGE_FILE);
  const payload = JSON.stringify(state, null, 2);
  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(USAGE_FILE, payload))
    .catch(() => undefined);
}

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function nextResetAt(dateKey: string): string {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString();
}

function pruneGlobal(nowMs: number) {
  state.global.timestamps = state.global.timestamps.filter(
    (ts) => nowMs - ts <= GLOBAL_WINDOW_MS
  );
}

export function getCredits(userId: string) {
  const dateKey = todayKey();
  if (CREDITS_BYPASS) {
    return {
      remaining: DAILY_CREDITS,
      limit: DAILY_CREDITS,
      resetAt: nextResetAt(dateKey),
      bypass: true,
    };
  }
  const user = state.users[userId];
  const used = user?.date === dateKey ? user.used : 0;
  const remaining = Math.max(0, DAILY_CREDITS - used);
  return {
    remaining,
    limit: DAILY_CREDITS,
    resetAt: nextResetAt(dateKey),
  };
}

export function consumeCredit(userId: string) {
  const dateKey = todayKey();
  if (CREDITS_BYPASS) {
    return {
      ok: true as const,
      remaining: DAILY_CREDITS,
      limit: DAILY_CREDITS,
      resetAt: nextResetAt(dateKey),
      bypass: true,
    };
  }
  const nowMs = Date.now();

  pruneGlobal(nowMs);
  if (state.global.timestamps.length >= GLOBAL_MAX) {
    const oldest = state.global.timestamps[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + GLOBAL_WINDOW_MS - nowMs) / 1000)
    );
    return {
      ok: false as const,
      reason: 'global' as const,
      retryAfterSeconds,
    };
  }

  const current = state.users[userId];
  const used = current?.date === dateKey ? current.used : 0;
  if (used >= DAILY_CREDITS) {
    return {
      ok: false as const,
      reason: 'user' as const,
      remaining: 0,
      limit: DAILY_CREDITS,
      resetAt: nextResetAt(dateKey),
    };
  }

  state.users[userId] = { date: dateKey, used: used + 1 };
  state.global.timestamps.push(nowMs);
  persistState();

  return {
    ok: true as const,
    remaining: Math.max(0, DAILY_CREDITS - (used + 1)),
    limit: DAILY_CREDITS,
    resetAt: nextResetAt(dateKey),
  };
}
