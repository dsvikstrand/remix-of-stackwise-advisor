import type { User } from '@supabase/supabase-js';
import { logMvpEvent } from '@/lib/logEvent';

export type P3Surface = 'channels_index' | 'channel_page' | 'wall' | 'explore';
export type AuthState = 'signed_in' | 'anon';
export type JoinErrorBucket = 'auth_required' | 'network' | 'constraint' | 'unknown';

const EVENT_VERSION = 'p3_step3_v0';
const SESSION_KEY = 'bleu_session_id';
const ONCE_PREFIX = 'bleu_once_';

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = randomId();
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // sessionStorage can be blocked (privacy mode). Fall back to in-memory id.
    return randomId();
  }
}

export function getAuthState(user: User | null | undefined): AuthState {
  return user ? 'signed_in' : 'anon';
}

export function logOncePerSession(key: string, fn: () => void) {
  try {
    const storageKey = `${ONCE_PREFIX}${key}`;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, '1');
  } catch {
    // If storage is blocked, we can't guarantee "once". Still run the action.
  }
  fn();
}

export function bucketJoinError(err: unknown): JoinErrorBucket {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const msg = message.toLowerCase();

  if (msg.includes('must be logged in') || msg.includes('sign in')) return 'auth_required';
  if (err instanceof TypeError || msg.includes('failed to fetch') || msg.includes('network')) return 'network';

  const code = (err as any)?.code;
  if (typeof code === 'string' && (code.startsWith('23') || code === '409')) return 'constraint';
  if (msg.includes('duplicate') || msg.includes('violat') || msg.includes('constraint')) return 'constraint';

  return 'unknown';
}

type LogP3EventInput = {
  eventName: string;
  surface: P3Surface;
  user: User | null | undefined;
  blueprintId?: string | null;
  metadata?: Record<string, unknown>;
};

export function logP3Event({
  eventName,
  surface,
  user,
  blueprintId,
  metadata,
}: LogP3EventInput) {
  const payload = {
    event_version: EVENT_VERSION,
    session_id: getOrCreateSessionId(),
    surface,
    auth_state: getAuthState(user),
    ...(metadata ?? {}),
  };

  // Fire-and-forget: never block UX on telemetry.
  void logMvpEvent({
    eventName,
    userId: user?.id ?? null,
    blueprintId: blueprintId ?? null,
    metadata: payload,
  });
}

