import {
  reserveCredits,
  refundReservation,
  settleReservation,
  type CreditLedgerContext,
  type CreditReserveResult,
} from './creditWallet';

type DbClient = any;

export const MANUAL_GENERATION_CREDIT_COST = 1;

export type ManualGenerationReservation = {
  userId: string;
  amount: number;
  holdIdempotencyKey: string;
  settleIdempotencyKey: string;
  releaseIdempotencyKey: string;
  reasonCodeBase: string;
  context?: CreditLedgerContext;
};

type ReservePrefixInput<T> = {
  db: DbClient;
  items: Array<{
    item: T;
    reservation: ManualGenerationReservation;
  }>;
};

function normalizeReasonCodeBase(scope: string) {
  return String(scope || 'manual_generation')
    .trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase() || 'MANUAL_GENERATION';
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildManualGenerationReservation(input: {
  scope: string;
  userId: string;
  requestId: string;
  videoId: string;
  sourceItemId?: string | null;
  sourcePageId?: string | null;
  metadata?: Record<string, unknown>;
  amount?: number;
}): ManualGenerationReservation {
  const userId = String(input.userId || '').trim();
  const requestId = String(input.requestId || '').trim();
  const videoId = String(input.videoId || '').trim();
  const sourceItemId = String(input.sourceItemId || '').trim() || null;
  const sourcePageId = String(input.sourcePageId || '').trim() || null;
  const amount = round2(Math.max(0.01, Number(input.amount ?? MANUAL_GENERATION_CREDIT_COST)));
  const reasonCodeBase = normalizeReasonCodeBase(input.scope);
  const keyBase = `${reasonCodeBase}:${userId}:${requestId}:${sourceItemId || videoId}`;

  return {
    userId,
    amount,
    holdIdempotencyKey: `${keyBase}:hold`,
    settleIdempotencyKey: `${keyBase}:settle`,
    releaseIdempotencyKey: `${keyBase}:release`,
    reasonCodeBase,
    context: {
      source_item_id: sourceItemId,
      source_page_id: sourcePageId,
      metadata: {
        ...(input.metadata || {}),
        billing_scope: input.scope,
        request_id: requestId,
        video_id: videoId,
      },
    },
  };
}

export async function reserveManualGeneration(
  db: DbClient,
  reservation: ManualGenerationReservation,
): Promise<CreditReserveResult> {
  return reserveCredits(db, {
    userId: reservation.userId,
    amount: reservation.amount,
    idempotencyKey: reservation.holdIdempotencyKey,
    reasonCode: `${reservation.reasonCodeBase}_HOLD`,
    context: reservation.context,
  });
}

export async function settleManualGeneration(
  db: DbClient,
  reservation: ManualGenerationReservation,
) {
  return settleReservation(db, {
    userId: reservation.userId,
    amount: reservation.amount,
    idempotencyKey: reservation.settleIdempotencyKey,
    reasonCode: `${reservation.reasonCodeBase}_SETTLE`,
    context: reservation.context,
  });
}

export async function releaseManualGeneration(
  db: DbClient,
  reservation: ManualGenerationReservation,
) {
  return refundReservation(db, {
    userId: reservation.userId,
    amount: reservation.amount,
    idempotencyKey: reservation.releaseIdempotencyKey,
    reasonCode: `${reservation.reasonCodeBase}_RELEASE`,
    context: reservation.context,
  });
}

export async function reserveManualGenerationPrefix<T>(input: ReservePrefixInput<T>) {
  const reserved: Array<{
    item: T;
    reservation: ManualGenerationReservation;
  }> = [];
  const skippedUnaffordable: Array<{
    item: T;
    required: number;
    balance: number;
  }> = [];

  let blockedBalance: number | null = null;
  for (let index = 0; index < input.items.length; index += 1) {
    const candidate = input.items[index];
    if (blockedBalance != null) {
      skippedUnaffordable.push({
        item: candidate.item,
        required: candidate.reservation.amount,
        balance: blockedBalance,
      });
      continue;
    }
    const hold = await reserveManualGeneration(input.db, candidate.reservation);
    if (!hold.ok) {
      blockedBalance = hold.wallet.balance;
      skippedUnaffordable.push({
        item: candidate.item,
        required: candidate.reservation.amount,
        balance: hold.wallet.balance,
      });
      continue;
    }
    reserved.push(candidate);
  }

  return {
    reserved,
    skippedUnaffordable,
  };
}
