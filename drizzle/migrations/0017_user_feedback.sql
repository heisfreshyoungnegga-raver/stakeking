CREATE TABLE public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL DEFAULT 'idea' CHECK (kind IN ('idea','rating')),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),
  rating integer CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'idea' AND char_length(btrim(message)) >= 5) OR (kind = 'rating' AND rating IS NOT NULL))
);
GRANT SELECT, INSERT ON public.user_feedback TO authenticated;
GRANT ALL ON public.user_feedback TO service_role;
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own feedback" ON public.user_feedback FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "read own feedback or admin" ON public.user_feedback FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));