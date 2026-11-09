CREATE OR REPLACE FUNCTION public.cashout_bet(_bet uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); b record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO b FROM public.bets WHERE id = _bet AND user_id = uid AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bet not open'; END IF;
  UPDATE public.bets SET status = 'cashed_out' WHERE id = _bet;
  UPDATE public.profiles SET balance = balance + b.stake WHERE id = uid;
  INSERT INTO public.transactions (user_id, type, amount, note) VALUES (uid, 'cashout', b.stake, 'Bet cashed out (demo)');
  RETURN b.stake;
END $$;

REVOKE EXECUTE ON FUNCTION public.cashout_bet(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cashout_bet(uuid) TO authenticated;