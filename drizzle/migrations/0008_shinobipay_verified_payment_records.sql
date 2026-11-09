CREATE TABLE public.shinobipay_deposits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 reference text NOT NULL UNIQUE, intent_id text UNIQUE, amount_minor integer NOT NULL CHECK(amount_minor BETWEEN 100 AND 500000),
 mode text NOT NULL CHECK(mode IN ('test','live')), status text NOT NULL DEFAULT 'creating', last_sequence integer NOT NULL DEFAULT -1,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shinobipay_deposits TO authenticated;
GRANT ALL ON public.shinobipay_deposits TO service_role;
ALTER TABLE public.shinobipay_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_read ON public.shinobipay_deposits FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.shinobipay_events (
 event_id text PRIMARY KEY, deposit_id uuid NOT NULL REFERENCES public.shinobipay_deposits(id), sequence integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.shinobipay_events TO service_role;
ALTER TABLE public.shinobipay_events ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.record_shinobipay_test_event(_event text, _intent text, _reference text, _amount integer, _status text, _sequence integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE d public.shinobipay_deposits%ROWTYPE;
BEGIN
 IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO d FROM public.shinobipay_deposits WHERE intent_id=_intent FOR UPDATE;
 IF NOT FOUND OR d.reference<>_reference OR d.amount_minor<>_amount OR d.mode<>'test' THEN RAISE EXCEPTION 'Payment mismatch'; END IF;
 IF _status NOT IN ('succeeded','failed','processing') OR _sequence<0 THEN RAISE EXCEPTION 'Invalid event'; END IF;
 IF EXISTS(SELECT 1 FROM public.shinobipay_events WHERE event_id=_event) THEN RETURN 'duplicate'; END IF;
 INSERT INTO public.shinobipay_events(event_id,deposit_id,sequence) VALUES(_event,d.id,_sequence);
 IF _sequence>d.last_sequence AND d.status NOT IN ('succeeded','failed') THEN
 UPDATE public.shinobipay_deposits SET status=_status,last_sequence=_sequence WHERE id=d.id;
 END IF;
 RETURN 'recorded_test_only';
END $fn$;
REVOKE ALL ON FUNCTION public.record_shinobipay_test_event(text,text,text,integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_shinobipay_test_event(text,text,text,integer,text,integer) TO service_role;