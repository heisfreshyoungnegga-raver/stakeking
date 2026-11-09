ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS competition_code text,
  ADD COLUMN IF NOT EXISTS home_team_full text,
  ADD COLUMN IF NOT EXISTS away_team_full text,
  ADD COLUMN IF NOT EXISTS odds_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS odds_bookmaker text,
  ADD COLUMN IF NOT EXISTS odds_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS odds_event_id text;

-- Stop generating synthetic markets from 1X2 prices; clear every non-provider price.
DROP TRIGGER IF EXISTS matches_fill_markets ON public.matches;
DROP TRIGGER IF EXISTS trg_matches_fill_markets ON public.matches;
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.matches'::regclass AND NOT tgisinternal AND tgfoid = 'public.matches_fill_markets'::regproc LOOP
    EXECUTE format('DROP TRIGGER %I ON public.matches', t.tgname);
  END LOOP;
END $$;
UPDATE public.matches SET markets = '{}'::jsonb, odds_available = false, odds_bookmaker = NULL, odds_updated_at = NULL;

CREATE TABLE IF NOT EXISTS public.odds_sync_state (
  sport_key text PRIMARY KEY,
  synced_at timestamptz NOT NULL DEFAULT now(),
  requests_remaining integer
);
GRANT ALL ON public.odds_sync_state TO service_role;
ALTER TABLE public.odds_sync_state ENABLE ROW LEVEL SECURITY;

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
    INSERT INTO public.matches (external_id, source, category_id, league, competition_code, home_team, away_team, home_team_full, away_team_full, home_team_id, away_team_id, home_crest, away_crest, api_status, start_time, status, minute, home_score, away_score, visible, synced_at)
    VALUES ((f->>'id')::bigint, 'football-data', cat, f->>'league', f->>'code', f->>'home', f->>'away', f->>'homeFull', f->>'awayFull',
            NULLIF(f->>'homeId','')::bigint, NULLIF(f->>'awayId','')::bigint, NULLIF(f->>'homeCrest',''), NULLIF(f->>'awayCrest',''), api,
            (f->>'utcDate')::timestamptz,
            CASE WHEN st='void' THEN 'upcoming' ELSE st END, NULLIF(f->>'minute','')::int,
            COALESCE(NULLIF(f->>'homeScore','')::int, 0), COALESCE(NULLIF(f->>'awayScore','')::int, 0), st <> 'void', now())
    ON CONFLICT (external_id) DO UPDATE SET
      league = EXCLUDED.league, competition_code = EXCLUDED.competition_code,
      home_team = EXCLUDED.home_team, away_team = EXCLUDED.away_team,
      home_team_full = EXCLUDED.home_team_full, away_team_full = EXCLUDED.away_team_full,
      home_team_id = EXCLUDED.home_team_id, away_team_id = EXCLUDED.away_team_id,
      home_crest = EXCLUDED.home_crest, away_crest = EXCLUDED.away_crest, api_status = EXCLUDED.api_status,
      start_time = EXCLUDED.start_time,
      status = CASE WHEN st='void' THEN matches.status WHEN matches.status='finished' THEN 'finished' ELSE EXCLUDED.status END,
      minute = EXCLUDED.minute, home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score,
      visible = st <> 'void', synced_at = now(),
      odds_available = CASE WHEN st IN ('finished','void') THEN false ELSE matches.odds_available END;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.sync_football_fixtures(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_football_fixtures(jsonb) TO service_role;

-- Writes provider odds for one competition. _odds: [{match_id, event_id, bookmaker, updated_at, home, draw, away, markets}]
-- Every listed match not in _odds loses its odds (suspended / not offered).
CREATE OR REPLACE FUNCTION public.apply_bookmaker_odds(_match_ids uuid[], _odds jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o jsonb; n int := 0;
BEGIN
  UPDATE public.matches SET odds_available = false, markets = '{}'::jsonb
   WHERE id = ANY(_match_ids) AND NOT (id::text IN (SELECT x->>'match_id' FROM jsonb_array_elements(_odds) x));
  FOR o IN SELECT * FROM jsonb_array_elements(_odds) LOOP
    UPDATE public.matches SET
      odds_home = COALESCE((o->>'home')::numeric, odds_home),
      odds_draw = COALESCE((o->>'draw')::numeric, odds_draw),
      odds_away = COALESCE((o->>'away')::numeric, odds_away),
      odds_available = (o->>'home') IS NOT NULL AND (o->>'draw') IS NOT NULL AND (o->>'away') IS NOT NULL,
      markets = COALESCE(o->'markets', '{}'::jsonb),
      odds_bookmaker = o->>'bookmaker', odds_updated_at = (o->>'updated_at')::timestamptz, odds_event_id = o->>'event_id'
    WHERE id = (o->>'match_id')::uuid AND id = ANY(_match_ids);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.apply_bookmaker_odds(uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bookmaker_odds(uuid[], jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.place_bet(numeric, uuid[], text[]);
CREATE OR REPLACE FUNCTION public.place_bet(_stake numeric, _match_ids uuid[], _picks text[], _expected_odds numeric[])
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); bal numeric; odds numeric := 1; sel jsonb := '[]'; m record; i int; o numeric; bid uuid; mk text; opt text; bcode text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _stake IS NULL OR _stake < 1 OR _stake > 10000 THEN RAISE EXCEPTION 'Stake must be between 1 and 10,000'; END IF;
  IF array_length(_match_ids,1) IS NULL OR array_length(_match_ids,1) <> array_length(_picks,1)
     OR array_length(_match_ids,1) <> array_length(_expected_odds,1) OR array_length(_match_ids,1) > 20 THEN RAISE EXCEPTION 'Invalid selections'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_match_ids) x) <> array_length(_match_ids,1) THEN RAISE EXCEPTION 'One selection per match'; END IF;
  FOR i IN 1..array_length(_match_ids,1) LOOP
    SELECT * INTO m FROM public.matches WHERE id = _match_ids[i] AND visible AND status <> 'finished'
      AND NOT (status = 'upcoming' AND start_time <= now());
    IF NOT FOUND THEN RAISE EXCEPTION 'Match unavailable'; END IF;
    IF NOT m.odds_available OR m.odds_updated_at IS NULL OR m.odds_updated_at < now() - interval '30 minutes' THEN
      RAISE EXCEPTION 'Odds unavailable for %', m.home_team || ' vs ' || m.away_team;
    END IF;
    IF position('|' in _picks[i]) > 0 THEN mk := split_part(_picks[i],'|',1); opt := split_part(_picks[i],'|',2);
    ELSE mk := '1X2'; opt := _picks[i]; END IF;
    IF mk = '1X2' THEN
      o := CASE opt WHEN 'home' THEN m.odds_home WHEN 'draw' THEN m.odds_draw WHEN 'away' THEN m.odds_away END;
    ELSE
      o := (m.markets -> mk ->> opt)::numeric;
    END IF;
    IF o IS NULL THEN RAISE EXCEPTION 'Market suspended: %', m.home_team || ' vs ' || m.away_team; END IF;
    IF o <> _expected_odds[i] THEN RAISE EXCEPTION 'ODDS_CHANGED'; END IF;
    odds := odds * o;
    sel := sel || jsonb_build_object('match_id', m.id, 'fixture_id', m.external_id, 'match', m.home_team || ' vs ' || m.away_team, 'market', mk, 'pick', opt, 'odds', o, 'bookmaker', m.odds_bookmaker, 'odds_updated_at', m.odds_updated_at);
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
REVOKE ALL ON FUNCTION public.place_bet(numeric, uuid[], text[], numeric[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bet(numeric, uuid[], text[], numeric[]) TO authenticated;