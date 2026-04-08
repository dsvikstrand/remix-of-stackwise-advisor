import { listMyFeedItemsFromDb } from '../../src/lib/myFeedData';

type DbClient = {
  from: (table: string) => any;
};

export async function listMyFeedItems(input: {
  db: DbClient;
  userId: string;
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
