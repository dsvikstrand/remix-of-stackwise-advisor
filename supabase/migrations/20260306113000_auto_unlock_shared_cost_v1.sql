-- bleuV1 shared-cost auto unlock intents + participant billing

CREATE TABLE IF NOT EXISTS public.source_auto_unlock_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id uuid NOT NULL REFERENCES public.source_items(id) ON DELETE CASCADE,
  source_page_id uuid REFERENCES public.source_pages(id) ON DELETE SET NULL,
  unlock_id uuid REFERENCES public.source_item_unlocks(id) ON DELETE SET NULL,
  source_channel_id text,
  intent_owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'reserved',
  trigger text,
  snapshot_count integer NOT NULL DEFAULT 0,
  funded_count integer NOT NULL DEFAULT 0,
  total_share_cents integer NOT NULL DEFAULT 100,
  job_id uuid REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE SET NULL,
  release_reason_code text,
  last_error_code text,
  last_error_message text,
  settled_at timestamptz,
  released_at timestamptz,
  ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('reserved', 'settled', 'released', 'ready')),
  CHECK (snapshot_count >= 0),
  CHECK (funded_count >= 0),
  CHECK (total_share_cents >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS source_auto_unlock_intents_active_source_item_idx
  ON public.source_auto_unlock_intents (source_item_id)
  WHERE status IN ('reserved', 'settled', 'ready');

CREATE INDEX IF NOT EXISTS source_auto_unlock_intents_owner_created_idx
  ON public.source_auto_unlock_intents (intent_owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.source_auto_unlock_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES public.source_auto_unlock_intents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stable_sort_order integer NOT NULL,
  funding_status text NOT NULL DEFAULT 'held',
  share_cents integer NOT NULL,
  hold_idempotency_key text NOT NULL,
  settle_idempotency_key text NOT NULL,
  release_idempotency_key text NOT NULL,
  hold_ledger_id uuid REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  settle_ledger_id uuid REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  release_ledger_id uuid REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  release_reason_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intent_id, user_id),
  UNIQUE (hold_idempotency_key),
  UNIQUE (settle_idempotency_key),
  UNIQUE (release_idempotency_key),
  CHECK (stable_sort_order >= 1),
  CHECK (funding_status IN ('held', 'settled', 'released')),
  CHECK (share_cents > 0)
);

CREATE INDEX IF NOT EXISTS source_auto_unlock_participants_intent_idx
  ON public.source_auto_unlock_participants (intent_id, stable_sort_order);

ALTER TABLE public.source_item_unlocks
  ADD COLUMN IF NOT EXISTS auto_unlock_intent_id uuid REFERENCES public.source_auto_unlock_intents(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS update_source_auto_unlock_intents_updated_at ON public.source_auto_unlock_intents;
CREATE TRIGGER update_source_auto_unlock_intents_updated_at
  BEFORE UPDATE ON public.source_auto_unlock_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_source_auto_unlock_participants_updated_at ON public.source_auto_unlock_participants;
CREATE TRIGGER update_source_auto_unlock_participants_updated_at
  BEFORE UPDATE ON public.source_auto_unlock_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.reserve_source_auto_unlock_intent(
  p_source_item_id uuid,
  p_source_page_id uuid,
  p_unlock_id uuid,
  p_source_channel_id text,
  p_video_id text,
  p_trigger text,
  p_eligible_user_ids uuid[]
)
RETURNS TABLE (
  state text,
  intent_id uuid,
  status text,
  owner_user_id uuid,
  reserved_now boolean,
  snapshot_count integer,
  funded_count integer,
  total_share_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.source_auto_unlock_intents%ROWTYPE;
  v_candidates uuid[];
  v_next uuid[];
  v_user_id uuid;
  v_index integer;
  v_count integer;
  v_base_share integer;
  v_leftover integer;
  v_share_cents integer;
  v_plan text;
  v_daily_limit_override integer;
  v_daily_grant numeric(12,3);
  v_wallet public.user_credit_wallets%ROWTYPE;
  v_window_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  v_hold_ledger_id uuid;
  v_intent_id uuid;
  v_owner_user_id uuid;
BEGIN
  IF p_source_item_id IS NULL THEN
    state := 'invalid_source_item';
    intent_id := NULL;
    status := NULL;
    owner_user_id := NULL;
    reserved_now := false;
    snapshot_count := 0;
    funded_count := 0;
    total_share_cents := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_source_item_id::text));

  SELECT array_agg(user_id ORDER BY user_id)
    INTO v_candidates
  FROM (
    SELECT DISTINCT user_id
    FROM unnest(COALESCE(p_eligible_user_ids, ARRAY[]::uuid[])) AS user_id
    WHERE user_id IS NOT NULL
  ) eligible;

  IF COALESCE(array_length(v_candidates, 1), 0) = 0 THEN
    state := 'empty_funded_set';
    intent_id := NULL;
    status := NULL;
    owner_user_id := NULL;
    reserved_now := false;
    snapshot_count := 0;
    funded_count := 0;
    total_share_cents := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
    INTO v_existing
  FROM public.source_auto_unlock_intents
  WHERE source_item_id = p_source_item_id
    AND status IN ('reserved', 'settled', 'ready')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    state := 'existing_intent';
    intent_id := v_existing.id;
    status := v_existing.status;
    owner_user_id := v_existing.intent_owner_user_id;
    reserved_now := false;
    snapshot_count := v_existing.snapshot_count;
    funded_count := v_existing.funded_count;
    total_share_cents := v_existing.total_share_cents;
    RETURN NEXT;
    RETURN;
  END IF;

  LOOP
    v_count := COALESCE(array_length(v_candidates, 1), 0);
    IF v_count = 0 THEN
      state := 'empty_funded_set';
      intent_id := NULL;
      status := NULL;
      owner_user_id := NULL;
      reserved_now := false;
      snapshot_count := 0;
      funded_count := 0;
      total_share_cents := 0;
      RETURN NEXT;
      RETURN;
    END IF;

    v_base_share := floor(100.0 / v_count);
    v_leftover := 100 - (v_base_share * v_count);
    v_next := ARRAY[]::uuid[];

    FOR v_index IN 1..v_count LOOP
      v_user_id := v_candidates[v_index];
      v_share_cents := v_base_share + CASE WHEN v_index <= v_leftover THEN 1 ELSE 0 END;

      SELECT plan, daily_limit_override
        INTO v_plan, v_daily_limit_override
      FROM public.get_generation_plan_for_user(v_user_id)
      LIMIT 1;

      v_plan := LOWER(TRIM(COALESCE(v_plan, 'free')));
      v_daily_grant := CASE
        WHEN v_daily_limit_override IS NOT NULL AND v_daily_limit_override >= 0 THEN v_daily_limit_override::numeric
        WHEN v_plan = 'plus' THEN 20.00
        WHEN v_plan = 'admin' THEN 20.00
        ELSE 3.00
      END;

      INSERT INTO public.user_credit_wallets (
        user_id,
        balance,
        capacity,
        refill_rate_per_sec,
        last_refill_at,
        created_at,
        updated_at
      )
      VALUES (
        v_user_id,
        v_daily_grant,
        v_daily_grant,
        0,
        v_window_start,
        now(),
        now()
      )
      ON CONFLICT (user_id) DO NOTHING;

      SELECT *
        INTO v_wallet
      FROM public.user_credit_wallets
      WHERE user_id = v_user_id
      FOR UPDATE;

      IF v_wallet.user_id IS NULL THEN
        CONTINUE;
      END IF;

      IF v_wallet.last_refill_at < v_window_start OR COALESCE(v_wallet.capacity, 0) <> v_daily_grant THEN
        UPDATE public.user_credit_wallets
        SET
          balance = CASE
            WHEN v_wallet.last_refill_at < v_window_start THEN v_daily_grant
            ELSE LEAST(GREATEST(COALESCE(v_wallet.balance, 0), 0), v_daily_grant)
          END,
          capacity = v_daily_grant,
          refill_rate_per_sec = 0,
          last_refill_at = CASE
            WHEN v_wallet.last_refill_at < v_window_start THEN v_window_start
            ELSE v_wallet.last_refill_at
          END,
          updated_at = now()
        WHERE user_id = v_user_id
        RETURNING *
        INTO v_wallet;
      END IF;

      IF COALESCE(v_wallet.balance, 0) >= (v_share_cents::numeric / 100.0) THEN
        v_next := array_append(v_next, v_user_id);
      END IF;
    END LOOP;

    EXIT WHEN v_next = v_candidates;
    v_candidates := v_next;
  END LOOP;

  v_count := COALESCE(array_length(v_candidates, 1), 0);
  v_base_share := floor(100.0 / v_count);
  v_leftover := 100 - (v_base_share * v_count);
  v_owner_user_id := v_candidates[1];

  INSERT INTO public.source_auto_unlock_intents (
    source_item_id,
    source_page_id,
    unlock_id,
    source_channel_id,
    intent_owner_user_id,
    status,
    trigger,
    snapshot_count,
    funded_count,
    total_share_cents
  )
  VALUES (
    p_source_item_id,
    p_source_page_id,
    p_unlock_id,
    NULLIF(TRIM(COALESCE(p_source_channel_id, '')), ''),
    v_owner_user_id,
    'reserved',
    NULLIF(TRIM(COALESCE(p_trigger, '')), ''),
    COALESCE(array_length(p_eligible_user_ids, 1), 0),
    v_count,
    100
  )
  RETURNING id INTO v_intent_id;

  FOR v_index IN 1..v_count LOOP
    v_user_id := v_candidates[v_index];
    v_share_cents := v_base_share + CASE WHEN v_index <= v_leftover THEN 1 ELSE 0 END;

    UPDATE public.user_credit_wallets
    SET
      balance = ROUND((balance - (v_share_cents::numeric / 100.0))::numeric, 3),
      updated_at = now()
    WHERE user_id = v_user_id;

    INSERT INTO public.credit_ledger (
      user_id,
      delta,
      entry_type,
      reason_code,
      source_item_id,
      source_page_id,
      unlock_id,
      idempotency_key,
      metadata
    )
    VALUES (
      v_user_id,
      ROUND((-(v_share_cents::numeric / 100.0))::numeric, 3),
      'hold',
      'AUTO_UNLOCK_HOLD',
      p_source_item_id,
      p_source_page_id,
      p_unlock_id,
      format('auto_unlock:%s:user:%s:hold', v_intent_id, v_user_id),
      jsonb_build_object(
        'intent_id', v_intent_id,
        'video_id', NULLIF(TRIM(COALESCE(p_video_id, '')), ''),
        'source', 'subscription_auto_unlock',
        'trigger', NULLIF(TRIM(COALESCE(p_trigger, '')), '')
      )
    )
    RETURNING id INTO v_hold_ledger_id;

    INSERT INTO public.source_auto_unlock_participants (
      intent_id,
      user_id,
      stable_sort_order,
      funding_status,
      share_cents,
      hold_idempotency_key,
      settle_idempotency_key,
      release_idempotency_key,
      hold_ledger_id
    )
    VALUES (
      v_intent_id,
      v_user_id,
      v_index,
      'held',
      v_share_cents,
      format('auto_unlock:%s:user:%s:hold', v_intent_id, v_user_id),
      format('auto_unlock:%s:user:%s:settle', v_intent_id, v_user_id),
      format('auto_unlock:%s:user:%s:release', v_intent_id, v_user_id),
      v_hold_ledger_id
    );
  END LOOP;

  state := 'reserved';
  intent_id := v_intent_id;
  status := 'reserved';
  owner_user_id := v_owner_user_id;
  reserved_now := true;
  snapshot_count := COALESCE(array_length(p_eligible_user_ids, 1), 0);
  funded_count := v_count;
  total_share_cents := 100;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_source_auto_unlock_intent(uuid, uuid, uuid, text, text, text, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.reserve_source_auto_unlock_intent(uuid, uuid, uuid, text, text, text, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.update_profile_unlock_score_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entry_type = 'settle'
     AND NEW.reason_code IN ('UNLOCK_SETTLE', 'AUTO_UNLOCK_SETTLE')
     AND NEW.unlock_id IS NOT NULL THEN
    UPDATE public.profiles
    SET unlocked_blueprints_count = COALESCE(unlocked_blueprints_count, 0) + 1
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

WITH unlock_counts AS (
  SELECT
    user_id,
    COUNT(*)::integer AS unlock_count
  FROM public.credit_ledger
  WHERE entry_type = 'settle'
    AND reason_code IN ('UNLOCK_SETTLE', 'AUTO_UNLOCK_SETTLE')
    AND unlock_id IS NOT NULL
  GROUP BY user_id
)
UPDATE public.profiles p
SET unlocked_blueprints_count = COALESCE(u.unlock_count, 0)
FROM unlock_counts u
WHERE p.user_id = u.user_id;

UPDATE public.profiles
SET unlocked_blueprints_count = 0
WHERE user_id NOT IN (
  SELECT user_id
  FROM public.credit_ledger
  WHERE entry_type = 'settle'
    AND reason_code IN ('UNLOCK_SETTLE', 'AUTO_UNLOCK_SETTLE')
    AND unlock_id IS NOT NULL
);
