ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS second_half_at timestamptz;

CREATE OR REPLACE FUNCTION public.matches_track_second_half()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.api_status = 'PAUSED' AND NEW.api_status = 'IN_PLAY' AND NEW.second_half_at IS NULL THEN
    NEW.second_half_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS matches_track_second_half ON public.matches;
CREATE TRIGGER matches_track_second_half BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.matches_track_second_half();