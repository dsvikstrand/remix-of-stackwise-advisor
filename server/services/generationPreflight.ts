import {
  reserveManualGenerationPrefix,
  type ManualGenerationReservation,
} from './manualGenerationBilling';

type DbClient = any;

type VariantReadyState = {
  state: 'ready';
  blueprintId?: string | null;
};

type VariantInProgressState = {
  state: 'in_progress';
  blueprintId?: string | null;
  ownedByCurrentJob?: boolean;
};

type VariantState = VariantReadyState | VariantInProgressState | null | undefined;

export type SourcePageSubscriptionAccess = {
  subscribed: boolean;
  subscription_id: string | null;
};

export async function resolveSourcePageSubscriptionAccess(input: {
  db: DbClient;
  userId: string;
  sourcePageId: string;
  sourceChannelId: string;
  getUserSubscriptionStateForSourcePage: (
    db: DbClient,
    args: { userId: string; sourcePageId: string; sourceChannelId?: string | null },
  ) => Promise<{ subscribed?: boolean; subscription_id?: string | null } | null>;
}): Promise<SourcePageSubscriptionAccess> {
  const subscriptionState = await input.getUserSubscriptionStateForSourcePage(input.db, {
    userId: input.userId,
    sourcePageId: input.sourcePageId,
    sourceChannelId: input.sourceChannelId,
  });
  if (subscriptionState?.subscribed) {
    return {
      subscribed: true,
      subscription_id: subscriptionState.subscription_id || null,
    };
  }

  return {
    subscribed: false,
    subscription_id: null,
  };
}

export async function classifyManualGenerationCandidates<T>(input: {
  items: T[];
  generationTier: string;
  getVideoId: (item: T) => string;
  getTitle: (item: T) => string;
  upsertSourceItem: (item: T) => Promise<{ id: string }>;
  resolveVariantOrReady: (args: {
    sourceItemId: string;
    generationTier: string;
    jobId?: string | null;
  }) => Promise<VariantState>;
  onReady?: (args: {
    item: T;
    sourceItemId: string;
    blueprintId: string;
  }) => Promise<void>;
}) {
  const ready: Array<{ video_id: string; title: string; blueprint_id: string | null }> = [];
  const inProgress: Array<{ video_id: string; title: string }> = [];
  const billable: Array<T & { source_item_id: string }> = [];

  for (const item of input.items) {
    const source = await input.upsertSourceItem(item);
    const variantState = await input.resolveVariantOrReady({
      sourceItemId: source.id,
      generationTier: input.generationTier,
    });

    if (variantState?.state === 'ready' && variantState.blueprintId) {
      if (input.onReady) {
        await input.onReady({
          item,
          sourceItemId: source.id,
          blueprintId: variantState.blueprintId,
        });
      }
      ready.push({
        video_id: input.getVideoId(item),
        title: input.getTitle(item),
        blueprint_id: variantState.blueprintId,
      });
      continue;
    }

    if (variantState?.state === 'in_progress') {
      inProgress.push({
        video_id: input.getVideoId(item),
        title: input.getTitle(item),
      });
      continue;
    }

    billable.push({
      ...(item as Record<string, unknown>),
      source_item_id: source.id,
    } as T & { source_item_id: string });
  }

  return {
    ready,
    inProgress,
    billable,
  };
}

export async function reserveManualGenerationWorkPrefix<T>(input: {
  db: DbClient;
  items: Array<{
    item: T;
    reservation: ManualGenerationReservation;
  }>;
  mapSkippedUnaffordable: (args: {
    item: T;
    required: number;
    balance: number;
  }) => unknown;
}) {
  const reservationResult = await reserveManualGenerationPrefix({
    db: input.db,
    items: input.items,
  });

  return {
    reserved: reservationResult.reserved,
    skippedUnaffordable: reservationResult.skippedUnaffordable.map(({ item, required, balance }) => (
      input.mapSkippedUnaffordable({
        item,
        required,
        balance,
      })
    )),
  };
}

export async function readQueueAdmissionCounts(input: {
  db: DbClient;
  userId: string;
  countQueueDepth: (db: DbClient, args: { userId?: string; includeRunning: true; scope?: string; scopes?: string[] }) => Promise<number>;
  countQueueWorkItems: (db: DbClient, args: { userId?: string; includeRunning: true; scope?: string; scopes?: string[] }) => Promise<number>;
  scope?: string;
}) {
  const args = input.scope
    ? { includeRunning: true as const, scope: input.scope }
    : { includeRunning: true as const };

  const [queueDepth, userQueueDepth] = await Promise.all([
    input.countQueueDepth(input.db, args),
    input.countQueueDepth(input.db, { ...args, userId: input.userId }),
  ]);

  return {
    queue_depth: queueDepth,
    user_queue_depth: userQueueDepth,
    // Aggressive mode intentionally drops the more expensive work-item scans.
    queue_work_items: queueDepth,
    user_queue_work_items: userQueueDepth,
  };
}

export function wouldExceedQueueAdmission(input: {
  counts: {
    queue_depth: number;
    user_queue_depth: number;
    queue_work_items: number;
    user_queue_work_items: number;
  };
  newWorkItems: number;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  queueWorkItemsHardLimit: number;
  queueWorkItemsPerUserLimit: number;
}) {
  const wouldExceedQueueDepth = input.counts.queue_depth >= input.queueDepthHardLimit
    || input.counts.user_queue_depth >= input.queueDepthPerUserLimit;
  const wouldExceedWorkItems = false;

  return {
    wouldExceedQueueDepth,
    wouldExceedWorkItems,
    blocked: wouldExceedQueueDepth || wouldExceedWorkItems,
  };
}

export function buildManualGenerationResultBuckets(input: {
  durationBlocked: unknown[];
  skippedExisting: unknown[];
  inProgress: unknown[];
  skippedUnaffordable: unknown[];
  unavailable?: unknown[];
}) {
  return {
    duration_blocked_count: input.durationBlocked.length,
    duration_blocked: input.durationBlocked,
    skipped_existing_count: input.skippedExisting.length,
    skipped_existing: input.skippedExisting,
    in_progress_count: input.inProgress.length,
    in_progress: input.inProgress,
    skipped_unaffordable_count: input.skippedUnaffordable.length,
    skipped_unaffordable: input.skippedUnaffordable,
    unavailable_count: (input.unavailable || []).length,
    unavailable: input.unavailable || [],
  };
}
