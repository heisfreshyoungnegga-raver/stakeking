
ALTER TABLE public.matches ADD COLUMN markets jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN wager_required numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN wager_progress numeric(12,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.build_markets(h numeric, d numeric, a numeric)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'Over/Under 2.5', jsonb_build_object('Over', round(1.55 + h/6, 2), 'Under', round(1.6 + a/8, 2)),
    'Over/Under 1.5', jsonb_build_object('Over', round(1.15 + h/20, 2), 'Under', round(3.2 + a/5, 2)),
    'GG/NG', jsonb_build_object('GG', round(1.6 + d/12, 2), 'NG', round(1.9 + d/15, 2)),
    'Double Chance', jsonb_build_object('1X', round(greatest(1.05, 1/(1/h+1/d)), 2), '12', round(greatest(1.05, 1/(1/h+1/a)), 2), 'X2', round(greatest(1.05, 1/(1/d+1/a)), 2)),
    'Asian Handicap -0.5', jsonb_build_object('Home', round(h, 2), 'Away', round(greatest(1.1, 1/(1/d+1/a)), 2)),
    'Asian Handicap +0.5', jsonb_build_object('Home', round(greatest(1.1, 1/(1/h+1/d)), 2), 'Away', round(a, 2)),
    'European Handicap (0:1)', jsonb_build_object('1', round(h*1.9, 2), 'X', round(d*1.15, 2), '2', round(greatest(1.1, a/2.2), 2)),
    'Correct Score', jsonb_build_object(
      '1-0', round(5 + h, 2), '2-0', round(7 + h*1.5, 2), '2-1', round(8 + h, 2), '3-0', round(12 + h*2, 2), '3-1', round(13 + h*2, 2),
      '0-0', round(7 + d, 2), '1-1', round(5.5 + d/2, 2), '2-2', round(12 + d, 2),
      '0-1', round(5 + a, 2), '0-2', round(7 + a*1.5, 2), '1-2', round(8 + a, 2), '0-3', round(12 + a*2, 2))
  )
$$;

UPDATE public.matches SET markets = public.build_markets(odds_home, odds_draw, odds_away);

CREATE OR REPLACE FUNCTION public.matches_fill_markets()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.markets = '{}'::jsonb OR TG_OP = 'INSERT' OR NEW.odds_home IS DISTINCT FROM OLD.odds_home OR NEW.odds_draw IS DISTINCT FROM OLD.odds_draw OR NEW.odds_away IS DISTINCT FROM OLD.odds_away THEN
    NEW.markets := public.build_markets(NEW.odds_home, NEW.odds_draw, NEW.odds_away);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER matches_markets BEFORE INSERT OR UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.matches_fill_markets();

INSERT INTO public.sports_categories (name, slug, icon, sort_order) VALUES ('Volleyball','volleyball','🏐',6) ON CONFLICT DO NOTHING;

-- picks: '1X2|home' style. Legacy 'home'/'draw'/'away' still accepted.
DROP FUNCTION public.place_bet(numeric, uuid[], text[]);
CREATE OR REPLACE FUNCTION public.place_bet(_stake numeric, _match_ids uuid[], _picks text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); bal numeric; odds numeric := 1; sel jsonb := '[]'; m record; i int; o numeric; bid uuid; mk text; opt text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _stake IS NULL OR _stake < 1 OR _stake > 10000 THEN RAISE EXCEPTION 'Stake must be between 1 and 10,000'; END IF;
  IF array_length(_match_ids,1) IS NULL OR array_length(_match_ids,1) <> array_length(_picks,1) OR array_length(_match_ids,1) > 20 THEN RAISE EXCEPTION 'Invalid selections'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_match_ids) x) <> array_length(_match_ids,1) THEN RAISE EXCEPTION 'One selection per match'; END IF;
  FOR i IN 1..array_length(_match_ids,1) LOOP
    SELECT * INTO m FROM public.matches WHERE id = _match_ids[i] AND visible AND status <> 'finished';
    IF NOT FOUND THEN RAISE EXCEPTION 'Match unavailable'; END IF;
    IF position('|' in _picks[i]) > 0 THEN mk := split_part(_picks[i],'|',1); opt := split_part(_picks[i],'|',2);
    ELSE mk := '1X2'; opt := _picks[i]; END IF;
    IF mk = '1X2' THEN
      o := CASE opt WHEN 'home' THEN m.odds_home WHEN 'draw' THEN m.odds_draw WHEN 'away' THEN m.odds_away END;
    ELSE
      o := (m.markets -> mk ->> opt)::numeric;
    END IF;
    IF o IS NULL THEN RAISE EXCEPTION 'Invalid pick'; END IF;
    odds := odds * o;
    sel := sel || jsonb_build_object('match_id', m.id, 'match', m.home_team || ' vs ' || m.away_team, 'market', mk, 'pick', opt, 'odds', o);
  END LOOP;
  SELECT balance INTO bal FROM public.profiles WHERE id = uid FOR UPDATE;
  IF bal < _stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE public.profiles SET balance = balance - _stake, wager_progress = wager_progress + _stake WHERE id = uid;
  INSERT INTO public.bets (user_id, stake, total_odds, potential_win, selections)
  VALUES (uid, _stake, round(odds,2), round(_stake*odds,2), sel) RETURNING id INTO bid;
  INSERT INTO public.transactions (user_id, type, amount, note) VALUES (uid, 'bet', -_stake, 'Bet placed');
  RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.demo_deposit(_amount numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nb numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _amount IS NULL OR _amount < 10 OR _amount > 5000 THEN RAISE EXCEPTION 'Amount must be between 10 and 5,000'; END IF;
  UPDATE public.profiles SET balance = balance + _amount, wager_required = wager_required + 2*_amount WHERE id = uid RETURNING balance INTO nb;
  INSERT INTO public.transactions (user_id, type, amount, note) VALUES (uid, 'deposit', _amount, 'Demo credits added');
  RETURN nb;
END $$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); p record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _amount IS NULL OR _amount < 10 THEN RAISE EXCEPTION 'Minimum withdrawal is 10'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = uid FOR UPDATE;
  IF p.wager_progress < p.wager_required THEN RAISE EXCEPTION 'Wagering requirement not met: % of % wagered', p.wager_progress, p.wager_required; END IF;
  IF p.balance < _amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE public.profiles SET balance = balance - _amount WHERE id = uid;
  INSERT INTO public.transactions (user_id, type, amount, status, note) VALUES (uid, 'withdrawal', -_amount, 'pending', 'Awaiting admin approval');
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_withdrawal(_tx uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO t FROM public.transactions WHERE id = _tx AND type = 'withdrawal' AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a pending withdrawal'; END IF;
  IF _approve THEN
    UPDATE public.transactions SET status = 'approved', note = 'Approved by admin (demo — no cash paid)' WHERE id = _tx;
  ELSE
    UPDATE public.transactions SET status = 'rejected', note = 'Rejected by admin — refunded' WHERE id = _tx;
    UPDATE public.profiles SET balance = balance - t.amount WHERE id = t.user_id;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.place_bet(numeric, uuid[], text[]), public.admin_review_withdrawal(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.place_bet(numeric, uuid[], text[]), public.admin_review_withdrawal(uuid, boolean) TO authenticated;
