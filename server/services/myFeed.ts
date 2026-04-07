import { listMyFeedItemsFromDb } from '../../src/lib/myFeedData';

type DbClient = {
  from: (table: string) => any;
};

export async function listMyFeedItems(input: {
  db: DbClient;
  userId: string;
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
