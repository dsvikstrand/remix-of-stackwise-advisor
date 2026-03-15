import { getOpenAIDailyCostSnapshot, type OpenAIDailyCostSnapshot } from './openaiDailyCosts';

export type BlueprintGenerationChargeMode =
  | 'disabled'
  | 'free_window_open'
  | 'credit_charging_active'
  | 'fallback_charge_mode';

export type BlueprintGenerationChargePolicy = {
  mode: BlueprintGenerationChargeMode;
  budgetUsd: number;
  openaiDailyCostUsd: number | null;
  source: OpenAIDailyCostSnapshot['source'] | 'disabled' | 'fallback_charge_mode';
  windowStartIso: string | null;
  windowEndIso: string | null;
  evaluatedAtIso: string;
};

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function clampNumber(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getDailyBudgetUsd() {
  return round4(clampNumber(process.env.OPENAI_DAILY_FREE_BUDGET_USD, 0, 0, 10_000));
}

export async function getBlueprintGenerationChargePolicy(): Promise<BlueprintGenerationChargePolicy> {
  const evaluatedAtIso = new Date().toISOString();
  const budgetUsd = getDailyBudgetUsd();
  if (!(budgetUsd > 0)) {
    return {
      mode: 'disabled',
      budgetUsd: 0,
      openaiDailyCostUsd: null,
      source: 'disabled',
      windowStartIso: null,
      windowEndIso: null,
      evaluatedAtIso,
    };
  }

  try {
    const snapshot = await getOpenAIDailyCostSnapshot();
    return {
      mode: snapshot.amountUsd < budgetUsd ? 'free_window_open' : 'credit_charging_active',
      budgetUsd,
      openaiDailyCostUsd: snapshot.amountUsd,
      source: snapshot.source,
      windowStartIso: snapshot.windowStartIso,
      windowEndIso: snapshot.windowEndIso,
      evaluatedAtIso,
    };
  } catch {
    return {
      mode: 'fallback_charge_mode',
      budgetUsd,
      openaiDailyCostUsd: null,
      source: 'fallback_charge_mode',
      windowStartIso: null,
      windowEndIso: null,
      evaluatedAtIso,
    };
  }
}
