CREATE TABLE public.booking_codes (
  code text PRIMARY KEY,
  selections jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.booking_codes TO anon, authenticated;
GRANT ALL ON public.booking_codes TO service_role;
ALTER TABLE public.booking_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can load booking codes" ON public.booking_codes FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.create_booking_code(_selections jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF jsonb_typeof(_selections) <> 'array' OR jsonb_array_length(_selections) = 0 OR jsonb_array_length(_selections) > 30 THEN
    RAISE EXCEPTION 'Invalid selections';
  END IF;
  LOOP
    _code := '';
    FOR i IN 1..6 LOOP _code := _code || substr(_chars, 1 + floor(random()*length(_chars))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM booking_codes WHERE code = _code);
  END LOOP;
  INSERT INTO booking_codes(code, selections, created_by) VALUES (_code, _selections, auth.uid());
  RETURN _code;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_booking_code(jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_booking_code(jsonb) TO authenticated;