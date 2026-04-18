import { listMyFeedItemsFromDb } from '../../src/lib/myFeedData';

type DbClient = {
  from: (table: string) => any;
};

export async function listMyFeedItems(input: {
  db: DbClient;
  userId: string;
  readChannelCandidateRows?: (input: {
    db: DbClient;
    feedItemIds: string[];
    statuses?: string[];
  }) => Promise<Array<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    created_at: string;
  }>>;
  readFeedRows?: (input: {
    db: DbClient;
    userId: string;
    limit: number;
    sourceItemIds?: string[];
    requireBlueprint?: boolean;
  }) => Promise<Array<{
    id: string;
    user_id: string;
    source_item_id: string | null;
    blueprint_id: string | null;
    state: string;
    last_decision_code: string | null;
    generated_at_on_wall?: string | null;
    created_at: string;
    updated_at?: string;
  }>>;
  readSourceRows?: (input: {
    db: DbClient;
    sourceIds: string[];
  }) => Promise<Array<{
    id: string;
    source_channel_id?: string | null;
    source_page_id?: string | null;
    source_url?: string | null;
    title?: string | null;
    source_channel_title?: string | null;
    thumbnail_url?: string | null;
    metadata?: unknown;
  }>>;
  readUnlockRows?: (input: { db: DbClient; sourceIds: string[] }) => Promise<Array<{
    source_item_id: string;
    status: string;
    estimated_cost: number | string;
    reservation_expires_at: string | null;
    blueprint_id: string | null;
    last_error_code: string | null;
    transcript_status: string | null;
  }>>;
}) {
  return listMyFeedItemsFromDb(input);
}
