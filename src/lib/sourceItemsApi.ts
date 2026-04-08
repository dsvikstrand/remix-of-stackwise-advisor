import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export type SourceItemLookupRow = {
  id: string;
  source_page_id: string | null;
  source_channel_id: string | null;
  source_url: string | null;
  title: string | null;
  source_channel_title: string | null;
  thumbnail_url: string | null;
  metadata: unknown;
  source_native_id?: string | null;
};

type SourceItemsLookupResponse = {
  items: SourceItemLookupRow[];
  source_item_id_by_blueprint_id: Record<string, string>;
};

function getApiBase() {
  if (!config.agenticBackendUrl) return null;
  return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
}

async function getOptionalAuthHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function lookupSourceItems(input: {
  sourceIds?: string[];
  blueprintIds?: string[];
}): Promise<SourceItemsLookupResponse> {
  const base = getApiBase();
  if (!base) {
    throw new Error('Backend API is not configured.');
  }

  const authHeader = await getOptionalAuthHeader();
  const response = await fetch(`${base}/source-items/lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      source_ids: input.sourceIds || [],
      blueprint_ids: input.blueprintIds || [],
    }),
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<SourceItemsLookupResponse> | null;
  if (!response.ok || !json || !json.ok) {
    throw new Error(json?.message || `Request failed (${response.status})`);
  }

  return {
    items: json.data.items || [],
    source_item_id_by_blueprint_id: json.data.source_item_id_by_blueprint_id || {},
  };
}
