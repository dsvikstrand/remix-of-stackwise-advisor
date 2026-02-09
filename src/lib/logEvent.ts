import { apiFetch } from '@/lib/api';

type LogEventPayload = {
  eventName: string;
  userId?: string | null;
  blueprintId?: string | null;
  path?: string;
  metadata?: Record<string, unknown>;
};

export async function logMvpEvent({
  eventName,
  userId,
  blueprintId,
  path,
  metadata,
}: LogEventPayload) {
  if (!eventName) return;

  try {
    await apiFetch('log-event', {
      body: {
        event_name: eventName,
        user_id: userId ?? null,
        blueprint_id: blueprintId ?? null,
        path: path ?? window.location.pathname,
        metadata: metadata ?? {},
      },
      keepalive: true,
      pinnedToEdge: true,
      stream: true,
    });
  } catch {
    // Fire-and-forget: logging should never block UX.
  }
}
