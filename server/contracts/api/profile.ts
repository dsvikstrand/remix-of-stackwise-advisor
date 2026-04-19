import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type ProfileHistoryBadge = 'Blueprint' | 'Creator';

export type ProfileHistoryBlueprintItem = {
  id: string;
  kind: 'blueprint';
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
  avatarUrl: string | null;
  badge: 'Blueprint';
  statusText: string | null;
  bannerUrl: string | null;
};

export type ProfileHistoryCreatorItem = {
  id: string;
  kind: 'creator';
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
  avatarUrl: string | null;
  badge: 'Creator';
  statusText: null;
  bannerUrl: null;
};

export type ProfileHistoryItem = ProfileHistoryBlueprintItem | ProfileHistoryCreatorItem;

export type ProfileHistoryResponse = {
  profile_user_id: string;
  is_owner_view: boolean;
  items: ProfileHistoryItem[];
};

export type ProfileRouteDeps = {
  getServiceSupabaseClient: () => DbClient | null;
  normalizeTranscriptTruthStatus: (value: unknown) => string;
  readFeedRows?: any;
  readSourceRows?: any;
  readUnlockRows?: any;
  readVariantRows?: any;
  readChannelCandidateRows?: any;
  readBlueprintRows?: any;
};
