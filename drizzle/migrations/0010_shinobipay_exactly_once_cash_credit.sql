CREATE TABLE public.shinobipay_cash_wallets (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0)
);
GRANT SELECT ON public.shinobipay_cash_wallets TO authenticated;
GRANT ALL ON public.shinobipay_cash_wallets TO service_role;
ALTER TABLE public.shinobipay_cash_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.shinobipay_cash_wallets FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.shinobipay_cash_credits (
 deposit_id uuid PRIMARY KEY REFERENCES public.shinobipay_deposits(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 intent_id text NOT NULL UNIQUE,
 event_id text NOT NULL UNIQUE REFERENCES public.shinobipay_events(event_id),
 amount_minor integer NOT NULL CHECK(amount_minor BETWEEN 100 AND 500000),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shinobipay_cash_credits TO authenticated;
GRANT ALL ON public.shinobipay_cash_credits TO service_role;
ALTER TABLE public.shinobipay_cash_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.shinobipay_cash_credits FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.shinobipay_credit_gate (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.shinobipay_credit_gate TO service_role;
ALTER TABLE public.shinobipay_credit_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shinobipay_events ADD COLUMN IF NOT EXISTS verified_status text;
ALTER TABLE public.shinobipay_events ADD COLUMN IF NOT EXISTS verified_amount_minor integer;
ALTER TABLE public.shinobipay_events ADD COLUMN IF NOT EXISTS verified_intent_id text;
ALTER TABLE public.shinobipay_deposits ADD COLUMN IF NOT EXISTS credited_at timestamptz;
COMMENT ON TABLE public.shinobipay_cash_wallets IS 'Isolated verified ShinobiPay cash only; legacy betting, signup bonuses and withdrawals cannot spend this wallet.';
COMMENT ON TABLE public.shinobipay_credit_gate IS 'Absent or disabled row blocks all live credits. Application live creation and callbacks remain independently hard-disabled.';
CREATE OR REPLACE FUNCTION public.confirm_shinobipay_verified_event(_event text, _intent text, _reference text, _amount integer, _status text, _sequence integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.shinobipay_deposits%ROWTYPE; e public.shinobipay_events%ROWTYPE; inserted integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _event IS NULL OR _intent IS NULL OR _reference IS NULL OR _amount IS NULL OR _status IS NULL OR _sequence IS NULL OR _event !~ '^evt_[A-Za-z0-9_-]{1,196}$' OR _intent !~ '^pi_[A-Za-z0-9_-]{1,197}$' OR length(_reference) NOT BETWEEN 1 AND 200 OR _amount NOT BETWEEN 100 AND 500000 OR _sequence<0 OR _status NOT IN ('succeeded','failed','processing') THEN RAISE EXCEPTION 'Invalid event'; END IF;
 SELECT * INTO d FROM public.shinobipay_deposits WHERE reference=_reference FOR UPDATE;
 IF NOT FOUND OR d.amount_minor<>_amount OR (d.intent_id IS NOT NULL AND d.intent_id<>_intent) THEN RAISE EXCEPTION 'Payment mismatch'; END IF;
 IF d.mode='live' THEN
  IF NOT EXISTS(SELECT 1 FROM public.shinobipay_credit_gate WHERE id AND enabled) OR NOT EXISTS(SELECT 1 FROM public.shinobipay_deposits WHERE mode='test' AND status='succeeded' AND webhook_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'Live crediting disabled'; END IF;
 END IF;
 INSERT INTO public.shinobipay_events(event_id,deposit_id,sequence,verified_status,verified_amount_minor,verified_intent_id)
 VALUES(_event,d.id,_sequence,_status,_amount,_intent) ON CONFLICT(event_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN
  SELECT * INTO e FROM public.shinobipay_events WHERE event_id=_event;
  IF e.deposit_id IS DISTINCT FROM d.id OR e.sequence IS DISTINCT FROM _sequence OR e.verified_status IS DISTINCT FROM _status OR e.verified_amount_minor IS DISTINCT FROM _amount OR e.verified_intent_id IS DISTINCT FROM _intent THEN RAISE EXCEPTION 'Event mismatch'; END IF;
  RETURN 'duplicate';
 END IF;
 IF _sequence<=d.last_sequence THEN RETURN 'stale'; END IF;
 IF d.webhook_verified_at IS NOT NULL THEN RETURN 'duplicate'; END IF;
 IF d.status='failed' AND d.last_sequence>=0 THEN RETURN 'terminal'; END IF;
 UPDATE public.shinobipay_deposits SET intent_id=_intent,status=_status,last_sequence=_sequence,
 webhook_verified_at=CASE WHEN _status='succeeded' THEN now() ELSE webhook_verified_at END WHERE id=d.id;
 IF d.mode='test' THEN RETURN 'recorded_test_only'; END IF;
 IF _status<>'succeeded' THEN RETURN 'recorded'; END IF;
 INSERT INTO public.shinobipay_cash_credits(deposit_id,user_id,intent_id,event_id,amount_minor)
 VALUES(d.id,d.user_id,_intent,_event,_amount) ON CONFLICT(deposit_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 IF inserted=0 THEN RETURN 'duplicate'; END IF;
 INSERT INTO public.shinobipay_cash_wallets(user_id,balance_minor) VALUES(d.user_id,_amount)
 ON CONFLICT(user_id) DO UPDATE SET balance_minor=public.shinobipay_cash_wallets.balance_minor+EXCLUDED.balance_minor;
 UPDATE public.shinobipay_deposits SET credited_at=now() WHERE id=d.id;
 RETURN 'credited';
END; $$;
REVOKE ALL ON FUNCTION public.confirm_shinobipay_verified_event(text,text,text,integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_shinobipay_verified_event(text,text,text,integer,text,integer) TO service_role;