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
  v_bypass boolean;
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
  FROM public.source_auto_unlock_intents saui
  WHERE saui.source_item_id = p_source_item_id
    AND saui.status IN ('reserved', 'settled', 'ready')
  ORDER BY saui.created_at DESC
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
      v_bypass := (v_plan = 'admin');
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

      IF v_bypass OR COALESCE(v_wallet.balance, 0) >= (v_share_cents::numeric / 100.0) THEN
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

    SELECT plan
      INTO v_plan
    FROM public.get_generation_plan_for_user(v_user_id)
    LIMIT 1;
    v_plan := LOWER(TRIM(COALESCE(v_plan, 'free')));
    v_bypass := (v_plan = 'admin');

    IF NOT v_bypass THEN
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
    ELSE
      v_hold_ledger_id := NULL;
    END IF;

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
