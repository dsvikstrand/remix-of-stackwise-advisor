import { listMyFeedItemsFromDb } from '../../src/lib/myFeedData';

type DbClient = {
  from: (table: string) => any;
};

export async function listMyFeedItems(input: {
  db: DbClient;
  userId: string;
}) {
  return listMyFeedItemsFromDb(input);
}
