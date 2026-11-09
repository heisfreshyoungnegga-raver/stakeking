ALTER TABLE public.bets ADD COLUMN cashed_out numeric NOT NULL DEFAULT 0;

CREATE TABLE public.cashout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL REFERENCES public.bets(id),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  kind text NOT NULL DEFAULT 'full',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cashout_events TO authenticated;
GRANT ALL ON public.cashout_events TO service_role;
ALTER TABLE public.cashout_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cashout events" ON public.cashout_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Current cashout offer for a bet, computed server-side only.
CREATE OR REPLACE FUNCTION public.cashout_offer(_bet uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bets%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.bets WHERE id = _bet AND user_id = auth.uid();
  IF NOT FOUND OR b.status <> 'open' THEN RETURN 0; END IF;
  RETURN round(b.stake * 0.905, 2);
END;
$$;

-- Full and partial cashout, atomic, with audit trail.
DROP FUNCTION public.cashout_bet(uuid);
CREATE OR REPLACE FUNCTION public.cashout_bet(_bet uuid, _amount numeric)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.bets%ROWTYPE;
  offer numeric;
  frac numeric;
BEGIN
  SELECT * INTO b FROM public.bets WHERE id = _bet FOR UPDATE;
  IF NOT FOUND OR b.user_id <> auth.uid() THEN RAISE EXCEPTION 'Bet not found'; END IF;
  IF b.status <> 'open' THEN RAISE EXCEPTION 'This bet is no longer open'; END IF;
  offer := round(b.stake * 0.905, 2);
  IF _amount IS NULL OR _amount <= 0 OR _amount > offer THEN
    RAISE EXCEPTION 'Invalid cashout amount (max %)', offer;
  END IF;

  UPDATE public.profiles SET balance = balance + _amount WHERE id = b.user_id;
  INSERT INTO public.transactions (user_id, type, amount, status, note)
    VALUES (b.user_id, 'cashout', _amount, 'completed', 'Cashout for bet ' || b.id);
  INSERT INTO public.cashout_events (bet_id, user_id, amount, kind)
    VALUES (b.id, b.user_id, _amount, CASE WHEN _amount >= offer - 0.005 THEN 'full' ELSE 'partial' END);

  IF _amount >= offer - 0.005 THEN
    UPDATE public.bets SET status = 'cashed_out', cashed_out = cashed_out + _amount WHERE id = b.id;
  ELSE
    frac := (offer - _amount) / offer;
    UPDATE public.bets
      SET stake = round(b.stake * frac, 2),
          potential_win = round(b.potential_win * frac, 2),
          cashed_out = cashed_out + _amount
      WHERE id = b.id;
  END IF;
  RETURN _amount;
END;
$$;