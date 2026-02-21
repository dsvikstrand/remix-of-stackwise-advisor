
-- ============================================================
-- Missing tables needed for type generation / build parity
-- ============================================================

-- 1. source_pages
CREATE TABLE public.source_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL DEFAULT 'youtube',
  external_id text NOT NULL,
  external_url text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  avatar_url text,
  banner_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
ALTER TABLE public.source_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view source pages" ON public.source_pages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert source pages" ON public.source_pages FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update source pages" ON public.source_pages FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 2. source_items
CREATE TABLE public.source_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type text NOT NULL DEFAULT 'youtube_video',
  source_native_id text NOT NULL DEFAULT '',
  canonical_key text NOT NULL,
  source_url text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  source_channel_id text,
  source_channel_title text,
  source_page_id uuid REFERENCES public.source_pages(id),
  thumbnail_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingest_status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_key)
);
ALTER TABLE public.source_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view source items" ON public.source_items FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert source items" ON public.source_items FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update source items" ON public.source_items FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 3. user_feed_items
CREATE TABLE public.user_feed_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  source_item_id uuid REFERENCES public.source_items(id),
  blueprint_id uuid REFERENCES public.blueprints(id),
  state text NOT NULL DEFAULT 'my_feed_pending_accept',
  last_decision_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_item_id)
);
ALTER TABLE public.user_feed_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own feed items" ON public.user_feed_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own feed items" ON public.user_feed_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own feed items" ON public.user_feed_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own feed items" ON public.user_feed_items FOR DELETE USING (auth.uid() = user_id);

-- 4. channel_candidates
CREATE TABLE public.channel_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_feed_item_id uuid NOT NULL REFERENCES public.user_feed_items(id),
  channel_slug text NOT NULL DEFAULT '',
  submitted_by_user_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_feed_item_id, channel_slug)
);
ALTER TABLE public.channel_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own candidates" ON public.channel_candidates FOR SELECT USING (auth.uid() = submitted_by_user_id);
CREATE POLICY "Users can insert candidates" ON public.channel_candidates FOR INSERT WITH CHECK (auth.uid() = submitted_by_user_id);
CREATE POLICY "Users can update their own candidates" ON public.channel_candidates FOR UPDATE USING (auth.uid() = submitted_by_user_id);

-- 5. channel_gate_decisions
CREATE TABLE public.channel_gate_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES public.channel_candidates(id),
  gate_id text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT 'pass',
  reason_code text NOT NULL DEFAULT '',
  score numeric,
  method_version text DEFAULT 'gate-v1',
  policy_version text DEFAULT 'bleuv1-gate-policy-v1.0',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.channel_gate_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view gate decisions" ON public.channel_gate_decisions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert gate decisions" ON public.channel_gate_decisions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 6. source_item_unlocks
CREATE TABLE public.source_item_unlocks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_item_id uuid NOT NULL REFERENCES public.source_items(id),
  source_page_id uuid REFERENCES public.source_pages(id),
  status text NOT NULL DEFAULT 'available',
  estimated_cost numeric NOT NULL DEFAULT 0.1,
  reserved_by_user_id uuid,
  reservation_expires_at timestamptz,
  reserved_ledger_id uuid,
  blueprint_id uuid REFERENCES public.blueprints(id),
  job_id text,
  last_error_code text,
  last_error_message text,
  transcript_status text DEFAULT 'unknown',
  transcript_attempt_count integer DEFAULT 0,
  transcript_no_caption_hits integer DEFAULT 0,
  transcript_last_probe_at timestamptz,
  transcript_retry_after timestamptz,
  transcript_probe_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_item_id)
);
ALTER TABLE public.source_item_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view unlocks" ON public.source_item_unlocks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert unlocks" ON public.source_item_unlocks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update unlocks" ON public.source_item_unlocks FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 7. user_credit_wallets
CREATE TABLE public.user_credit_wallets (
  user_id uuid NOT NULL PRIMARY KEY,
  balance numeric NOT NULL DEFAULT 10,
  capacity numeric NOT NULL DEFAULT 10,
  refill_rate_per_sec numeric NOT NULL DEFAULT 0.002778,
  last_refill_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_credit_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own wallet" ON public.user_credit_wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can insert wallet" ON public.user_credit_wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own wallet" ON public.user_credit_wallets FOR UPDATE USING (auth.uid() = user_id);

-- 8. credit_ledger
CREATE TABLE public.credit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  delta numeric NOT NULL DEFAULT 0,
  entry_type text NOT NULL DEFAULT 'grant',
  reason_code text NOT NULL DEFAULT '',
  source_item_id uuid,
  source_page_id uuid,
  unlock_id uuid,
  idempotency_key text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own ledger" ON public.credit_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can insert ledger entries" ON public.credit_ledger FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 9. user_source_subscriptions
CREATE TABLE public.user_source_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  source_page_id uuid REFERENCES public.source_pages(id),
  source_channel_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_source_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own subscriptions" ON public.user_source_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own subscriptions" ON public.user_source_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subscriptions" ON public.user_source_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own subscriptions" ON public.user_source_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- Triggers for updated_at on new tables
CREATE TRIGGER update_source_pages_updated_at BEFORE UPDATE ON public.source_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_source_items_updated_at BEFORE UPDATE ON public.source_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_feed_items_updated_at BEFORE UPDATE ON public.user_feed_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_channel_candidates_updated_at BEFORE UPDATE ON public.channel_candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_source_item_unlocks_updated_at BEFORE UPDATE ON public.source_item_unlocks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_credit_wallets_updated_at BEFORE UPDATE ON public.user_credit_wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_source_subscriptions_updated_at BEFORE UPDATE ON public.user_source_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
