import { config } from '@/config/runtime';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

function getApiBase() {
  if (!config.agenticBackendUrl) return null;
  return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
}

export async function getPublishedBlueprintChannelSlug(blueprintId: string) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) return null;

  const base = getApiBase();
  if (!base) return null;

  const response = await fetch(`${base}/blueprints/${encodeURIComponent(normalizedBlueprintId)}/channel`, {
    method: 'GET',
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<{
    blueprint_id: string;
    published_channel_slug: string | null;
  }> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Blueprint channel request failed (${response.status})`);
  }
  return String(json.data.published_channel_slug || '').trim() || null;
}
