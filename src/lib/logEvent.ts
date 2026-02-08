import { supabase } from '@/integrations/supabase/client';
import { config, getFunctionUrl } from '@/config/runtime';

const LOG_EVENT_URL = getFunctionUrl('log-event');

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
  if (!LOG_EVENT_URL || !eventName) return;

  let accessToken: string | null = null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    accessToken = sessionData.session?.access_token ?? null;
  } catch {
    accessToken = null;
  }

  const authHeader = accessToken
    ? `Bearer ${accessToken}`
    : `Bearer ${config.supabaseAnonKey}`;

  try {
    await fetch(LOG_EVENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        event_name: eventName,
        user_id: userId ?? null,
        blueprint_id: blueprintId ?? null,
        path: path ?? window.location.pathname,
        metadata: metadata ?? {},
      }),
      keepalive: true,
    });
  } catch {
    // Fire-and-forget: logging should never block UX.
  }
}
