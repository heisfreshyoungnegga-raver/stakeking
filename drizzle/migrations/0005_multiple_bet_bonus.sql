ALTER TABLE public.bets ADD COLUMN bonus_rate numeric NOT NULL DEFAULT 0, ADD COLUMN bonus_amount numeric NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.apply_multiple_bet_bonus() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.bonus_rate := CASE WHEN jsonb_array_length(NEW.selections) >= 2 THEN 0.03 ELSE 0 END;
    NEW.bonus_amount := round(NEW.potential_win * NEW.bonus_rate, 2);
    NEW.potential_win := NEW.potential_win + NEW.bonus_amount;
  ELSIF NEW.stake IS DISTINCT FROM OLD.stake AND OLD.stake > 0 THEN
    NEW.bonus_amount := round(OLD.bonus_amount * NEW.stake / OLD.stake, 2);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.apply_multiple_bet_bonus() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER apply_multiple_bet_bonus BEFORE INSERT OR UPDATE ON public.bets FOR EACH ROW EXECUTE FUNCTION public.apply_multiple_bet_bonus();
COMMENT ON COLUMN public.bets.bonus_rate IS 'Rate captured at placement; existing tickets retain zero. New multiple bets receive 3 percent of base potential return.';
COMMENT ON COLUMN public.bets.bonus_amount IS 'Bonus included in potential_win; proportionally reduced after partial cashout.';