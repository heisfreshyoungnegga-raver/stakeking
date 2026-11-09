ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS external_id bigint UNIQUE, ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual', ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- Hide every fabricated/manual fixture; only API-sourced fixtures are shown.
UPDATE public.matches SET visible = false WHERE external_id IS NULL;

CREATE OR REPLACE FUNCTION public.sync_football_fixtures(_fixtures jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f jsonb; cat uuid; n int := 0; st text; api text;
BEGIN
  SELECT id INTO cat FROM public.sports_categories WHERE slug = 'football' LIMIT 1;
  FOR f IN SELECT * FROM jsonb_array_elements(_fixtures) LOOP
    api := f->>'status';
    st := CASE WHEN api IN ('IN_PLAY','PAUSED','LIVE') THEN 'live'
               WHEN api IN ('FINISHED','AWARDED') THEN 'finished'
               WHEN api IN ('SCHEDULED','TIMED') THEN 'upcoming'
               ELSE 'void' END;
    INSERT INTO public.matches (external_id, source, category_id, league, home_team, away_team, start_time, status, minute, home_score, away_score, visible, synced_at)
    VALUES ((f->>'id')::bigint, 'football-data', cat, f->>'league', f->>'home', f->>'away', (f->>'utcDate')::timestamptz,
            CASE WHEN st='void' THEN 'upcoming' ELSE st END, NULLIF(f->>'minute','')::int,
            COALESCE(NULLIF(f->>'homeScore','')::int, 0), COALESCE(NULLIF(f->>'awayScore','')::int, 0), st <> 'void', now())
    ON CONFLICT (external_id) DO UPDATE SET
      league = EXCLUDED.league, home_team = EXCLUDED.home_team, away_team = EXCLUDED.away_team,
      start_time = EXCLUDED.start_time,
      status = CASE WHEN st='void' THEN matches.status WHEN matches.status='finished' THEN 'finished' ELSE EXCLUDED.status END,
      minute = EXCLUDED.minute, home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score,
      visible = st <> 'void', synced_at = now();
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.sync_football_fixtures(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_football_fixtures(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.place_bet(_stake numeric, _match_ids uuid[], _picks text[])
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); bal numeric; odds numeric := 1; sel jsonb := '[]'; m record; i int; o numeric; bid uuid; mk text; opt text; bcode text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _stake IS NULL OR _stake < 1 OR _stake > 10000 THEN RAISE EXCEPTION 'Stake must be between 1 and 10,000'; END IF;
  IF array_length(_match_ids,1) IS NULL OR array_length(_match_ids,1) <> array_length(_picks,1) OR array_length(_match_ids,1) > 20 THEN RAISE EXCEPTION 'Invalid selections'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_match_ids) x) <> array_length(_match_ids,1) THEN RAISE EXCEPTION 'One selection per match'; END IF;
  FOR i IN 1..array_length(_match_ids,1) LOOP
    SELECT * INTO m FROM public.matches WHERE id = _match_ids[i] AND visible AND status <> 'finished'
      AND NOT (status = 'upcoming' AND start_time <= now());
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
    sel := sel || jsonb_build_object('match_id', m.id, 'fixture_id', m.external_id, 'match', m.home_team || ' vs ' || m.away_team, 'market', mk, 'pick', opt, 'odds', o);
  END LOOP;
  SELECT balance INTO bal FROM public.profiles WHERE id = uid FOR UPDATE;
  IF bal < _stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  bcode := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  UPDATE public.profiles SET balance = balance - _stake, wager_progress = wager_progress + _stake WHERE id = uid;
  INSERT INTO public.bets (user_id, stake, total_odds, potential_win, selections, booking_code)
  VALUES (uid, _stake, round(odds,2), round(_stake*odds,2), sel, bcode) RETURNING id INTO bid;
  INSERT INTO public.transactions (user_id, type, amount, note) VALUES (uid, 'bet', -_stake, 'Bet placed');
  RETURN bid;
END $function$;