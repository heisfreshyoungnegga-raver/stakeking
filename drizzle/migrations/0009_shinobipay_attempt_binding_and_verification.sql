ALTER TABLE public.shinobipay_deposits ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'mobile_money';
ALTER TABLE public.shinobipay_deposits ADD COLUMN IF NOT EXISTS network text;
ALTER TABLE public.shinobipay_deposits ADD COLUMN IF NOT EXISTS webhook_verified_at timestamptz;
CREATE OR REPLACE FUNCTION public.record_shinobipay_test_event(_event text, _intent text, _reference text, _amount integer, _status text, _sequence integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.shinobipay_deposits%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO d FROM public.shinobipay_deposits WHERE reference=_reference FOR UPDATE;
 IF NOT FOUND OR d.amount_minor<>_amount OR d.mode<>'test' OR (d.intent_id IS NOT NULL AND d.intent_id<>_intent) THEN RAISE EXCEPTION 'Payment mismatch'; END IF;
 IF _status NOT IN ('succeeded','failed','processing') OR _sequence<0 OR _intent !~ '^pi_[A-Za-z0-9_-]+$' OR _event !~ '^evt_[A-Za-z0-9_-]+$' THEN RAISE EXCEPTION 'Invalid event'; END IF;
 IF EXISTS(SELECT 1 FROM public.shinobipay_events WHERE event_id=_event) THEN
  IF NOT EXISTS(SELECT 1 FROM public.shinobipay_events WHERE event_id=_event AND deposit_id=d.id AND sequence=_sequence) THEN RAISE EXCEPTION 'Event mismatch'; END IF;
  RETURN 'duplicate';
 END IF;
 INSERT INTO public.shinobipay_events(event_id,deposit_id,sequence) VALUES(_event,d.id,_sequence);
 UPDATE public.shinobipay_deposits SET intent_id=_intent,
 status=CASE WHEN _sequence>d.last_sequence AND (d.status NOT IN ('succeeded','failed') OR d.webhook_verified_at IS NULL) THEN _status ELSE d.status END,
 last_sequence=greatest(last_sequence,_sequence),
 webhook_verified_at=CASE WHEN _sequence>d.last_sequence AND _status='succeeded' THEN coalesce(webhook_verified_at,now()) ELSE webhook_verified_at END
 WHERE id=d.id;
 RETURN 'recorded_test_only';
END; $$;
REVOKE ALL ON FUNCTION public.record_shinobipay_test_event(text,text,text,integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_shinobipay_test_event(text,text,text,integer,text,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.bind_shinobipay_test_intent(_reference text, _intent text, _amount integer, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.shinobipay_deposits%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO d FROM public.shinobipay_deposits WHERE reference=_reference FOR UPDATE;
 IF NOT FOUND OR d.mode<>'test' OR d.amount_minor<>_amount OR (d.intent_id IS NOT NULL AND d.intent_id<>_intent) THEN RAISE EXCEPTION 'Payment mismatch'; END IF;
 IF _intent !~ '^pi_[A-Za-z0-9_-]+$' OR _status NOT IN ('requires_action','processing','succeeded','failed','unknown') THEN RAISE EXCEPTION 'Invalid intent'; END IF;
 UPDATE public.shinobipay_deposits SET intent_id=_intent,status=CASE WHEN last_sequence<0 THEN _status ELSE status END WHERE id=d.id;
END; $$;
REVOKE ALL ON FUNCTION public.bind_shinobipay_test_intent(text,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_shinobipay_test_intent(text,text,integer,text) TO service_role;