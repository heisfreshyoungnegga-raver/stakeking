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
    VALUES ((f->>'id')::bigint, 'football-data', cat, f->>'league', NULLIF(f->>'code',''), f->>'home', f->>'away', f->>'homeFull', f->>'awayFull',
            NULLIF(f->>'homeId','')::bigint, NULLIF(f->>'awayId','')::bigint, NULLIF(f->>'homeCrest',''), NULLIF(f->>'awayCrest',''), api,
            (f->>'utcDate')::timestamptz,
            CASE WHEN st='void' THEN 'upcoming' ELSE st END, NULLIF(f->>'minute','')::int,
            COALESCE(NULLIF(f->>'homeScore','')::int, 0), COALESCE(NULLIF(f->>'awayScore','')::int, 0), st <> 'void', now())
    ON CONFLICT (external_id) DO UPDATE SET
      league = EXCLUDED.league, competition_code = COALESCE(EXCLUDED.competition_code, matches.competition_code),
      home_team = EXCLUDED.home_team, away_team = EXCLUDED.away_team,
      home_team_full = COALESCE(EXCLUDED.home_team_full, matches.home_team_full), away_team_full = COALESCE(EXCLUDED.away_team_full, matches.away_team_full),
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
UPDATE public.matches SET synced_at = now() - interval '1 hour' WHERE synced_at IS NOT NULL;