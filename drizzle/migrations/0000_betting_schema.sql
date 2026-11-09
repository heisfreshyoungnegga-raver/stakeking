
CREATE TYPE public.app_role AS ENUM ('admin','user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'Ghana',
  phone text NOT NULL DEFAULT '',
  referral_code text,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, country) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE POLICY "own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.sports_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text NOT NULL DEFAULT '⚽',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sports_categories TO authenticated;
GRANT SELECT ON public.sports_categories TO anon;
GRANT ALL ON public.sports_categories TO service_role;
ALTER TABLE public.sports_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read categories" ON public.sports_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin categories" ON public.sports_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.sports_categories(id) ON DELETE CASCADE,
  league text NOT NULL DEFAULT '',
  home_team text NOT NULL,
  away_team text NOT NULL,
  start_time timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'upcoming',
  minute int,
  home_score int NOT NULL DEFAULT 0,
  away_score int NOT NULL DEFAULT 0,
  odds_home numeric(6,2) NOT NULL DEFAULT 2.00,
  odds_draw numeric(6,2) NOT NULL DEFAULT 3.00,
  odds_away numeric(6,2) NOT NULL DEFAULT 3.50,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT SELECT ON public.matches TO anon;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read matches" ON public.matches FOR SELECT TO anon, authenticated USING (visible OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin matches" ON public.matches FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stake numeric(12,2) NOT NULL,
  total_odds numeric(10,2) NOT NULL,
  potential_win numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'open',
  selections jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bets TO authenticated;
GRANT ALL ON public.bets TO service_role;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bets" ON public.bets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tx" ON public.transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT SELECT ON public.promotions TO anon;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read promos" ON public.promotions FOR SELECT TO anon, authenticated USING (active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin promos" ON public.promotions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  bonus numeric(12,2) NOT NULL DEFAULT 0,
  uses int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin refs" ON public.referral_codes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.site_content (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_content TO authenticated;
GRANT SELECT ON public.site_content TO anon;
GRANT ALL ON public.site_content TO service_role;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read content" ON public.site_content FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin content" ON public.site_content FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Signup handler: profile, role, demo credit, referral bonus
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ref text; bonus numeric := 0;
BEGIN
  ref := nullif(upper(trim(coalesce(NEW.raw_user_meta_data->>'referral_code',''))),'');
  IF ref IS NOT NULL THEN
    SELECT r.bonus INTO bonus FROM public.referral_codes r WHERE r.code = ref AND r.active;
    IF FOUND THEN UPDATE public.referral_codes SET uses = uses + 1 WHERE code = ref; ELSE bonus := 0; ref := NULL; END IF;
  END IF;
  INSERT INTO public.profiles (id, full_name, email, country, phone, referral_code, balance)
  VALUES (NEW.id, left(coalesce(NEW.raw_user_meta_data->>'full_name',''),100), coalesce(NEW.email,''),
    CASE WHEN NEW.raw_user_meta_data->>'country' = 'Nigeria' THEN 'Nigeria' ELSE 'Ghana' END,
    left(coalesce(NEW.raw_user_meta_data->>'phone',''),20), ref, 1000 + coalesce(bonus,0));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.transactions (user_id, type, amount, note) VALUES (NEW.id, 'bonus', 1000, 'Welcome demo credits');
  IF coalesce(bonus,0) > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, note) VALUES (NEW.id, 'bonus', bonus, 'Referral bonus: ' || ref);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Place a demo bet
CREATE OR REPLACE FUNCTION public.place_bet(_stake numeric, _match_ids uuid[], _picks text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); bal numeric; odds numeric := 1; sel jsonb := '[]'; m record; i int; o numeric; bid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _stake IS NULL OR _stake < 1 OR _stake > 10000 THEN RAISE EXCEPTION 'Stake must be between 1 and 10,000'; END IF;
  IF array_length(_match_ids,1) IS NULL OR array_length(_match_ids,1) <> array_length(_picks,1) OR array_length(_match_ids,1) > 20 THEN RAISE EXCEPTION 'Invalid selections'; END IF;
  FOR i IN 1..array_length(_match_ids,1) LOOP
    SELECT * INTO m FROM public.matches WHERE id = _match_ids[i] AND visible AND status <> 'finished';
    IF NOT FOUND THEN RAISE EXCEPTION 'Match unavailable'; END IF;
    o := CASE _picks[i] WHEN 'home' THEN m.odds_home WHEN 'draw' THEN m.odds_draw WHEN 'away' THEN m.odds_away ELSE NULL END;
    IF o IS NULL THEN RAISE EXCEPTION 'Invalid pick'; END IF;
    odds := odds * o;
    sel := sel || jsonb_build_object('match_id', m.id, 'match', m.home_team || ' vs ' || m.away_team, 'pick', _picks[i], 'odds', o);
  END LOOP;
  SELECT balance INTO bal FROM public.profiles WHERE id = uid FOR UPDATE;
  IF bal < _stake THEN RAISE EXCEPTION 'Insufficient demo balance'; END IF;
  UPDATE public.profiles SET balance = balance - _stake WHERE id = uid;
  INSERT INTO public.bets (user_id, stake, total_odds, potential_win, selections)
  VALUES (uid, _stake, round(odds,2), round(_stake*odds,2), sel) RETURNING id INTO bid;
  INSERT INTO public.transactions (user_id, type, amount, note) VALUES (uid, 'bet', -_stake, 'Bet placed');
  RETURN bid;
END $$;

-- Demo top-up
CREATE OR REPLACE FUNCTION public.demo_deposit(_amount numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nb numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _amount IS NULL OR _amount < 10 OR _amount > 5000 THEN RAISE EXCEPTION 'Amount must be between 10 and 5,000'; END IF;
  UPDATE public.profiles SET balance = balance + _amount WHERE id = uid RETURNING balance INTO nb;
  INSERT INTO public.transactions (user_id, type, amount, note) VALUES (uid, 'deposit', _amount, 'Demo credits added');
  RETURN nb;
END $$;

-- Withdrawal request (recorded only, never processed)
CREATE OR REPLACE FUNCTION public.request_withdrawal(_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _amount IS NULL OR _amount < 10 THEN RAISE EXCEPTION 'Minimum is 10'; END IF;
  INSERT INTO public.transactions (user_id, type, amount, status, note) VALUES (uid, 'withdrawal', -_amount, 'disabled', 'Cash withdrawals not available in demo mode');
END $$;

-- Admin balance adjust
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(_user uuid, _amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.profiles SET balance = greatest(0, balance + _amount) WHERE id = _user;
  INSERT INTO public.transactions (user_id, type, amount, note) VALUES (_user, 'adjustment', _amount, 'Admin adjustment');
END $$;

-- Admin settle bet
CREATE OR REPLACE FUNCTION public.admin_settle_bet(_bet uuid, _won boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO b FROM public.bets WHERE id = _bet AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bet not open'; END IF;
  UPDATE public.bets SET status = CASE WHEN _won THEN 'won' ELSE 'lost' END WHERE id = _bet;
  IF _won THEN
    UPDATE public.profiles SET balance = balance + b.potential_win WHERE id = b.user_id;
    INSERT INTO public.transactions (user_id, type, amount, note) VALUES (b.user_id, 'win', b.potential_win, 'Bet won');
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.place_bet, public.demo_deposit, public.request_withdrawal, public.admin_adjust_balance, public.admin_settle_bet FROM anon, public;
GRANT EXECUTE ON FUNCTION public.place_bet, public.demo_deposit, public.request_withdrawal, public.admin_adjust_balance, public.admin_settle_bet TO authenticated;

-- Seed
INSERT INTO public.sports_categories (name, slug, icon, sort_order) VALUES
 ('Football','football','⚽',1),('Basketball','basketball','🏀',2),('Tennis','tennis','🎾',3),('Ice Hockey','hockey','🏒',4),('Boxing','boxing','🥊',5);

INSERT INTO public.matches (category_id, league, home_team, away_team, start_time, status, minute, home_score, away_score, odds_home, odds_draw, odds_away)
SELECT c.id, v.league, v.h, v.a, now() + v.offs, v.st, v.mn, v.hs, v.as_, v.o1, v.ox, v.o2
FROM public.sports_categories c,
(VALUES
 ('Premier League','Arsenal','Chelsea', interval '-50 minutes','live',52,1,0,1.85,3.60,4.20),
 ('Ghana Premier League','Hearts of Oak','Asante Kotoko', interval '-30 minutes','live',31,0,0,2.60,3.00,2.75),
 ('NPFL','Enyimba','Rangers International', interval '-75 minutes','live',78,2,1,1.55,4.10,5.80),
 ('La Liga','Real Madrid','Barcelona', interval '3 hours','upcoming',NULL,0,0,2.10,3.50,3.20),
 ('Serie A','Inter','AC Milan', interval '5 hours','upcoming',NULL,0,0,2.05,3.30,3.60),
 ('Bundesliga','Bayern Munich','Dortmund', interval '1 day','upcoming',NULL,0,0,1.60,4.30,5.00),
 ('CAF Champions League','Al Ahly','Mamelodi Sundowns', interval '1 day 4 hours','upcoming',NULL,0,0,2.30,3.10,3.10),
 ('Premier League','Liverpool','Man City', interval '2 days','upcoming',NULL,0,0,2.40,3.50,2.80)
) AS v(league,h,a,offs,st,mn,hs,as_,o1,ox,o2)
WHERE c.slug = 'football';

INSERT INTO public.matches (category_id, league, home_team, away_team, start_time, status, odds_home, odds_draw, odds_away)
SELECT c.id, 'NBA', 'Lakers', 'Celtics', now() + interval '6 hours', 'upcoming', 1.90, 15.00, 1.95 FROM public.sports_categories c WHERE slug='basketball';
INSERT INTO public.matches (category_id, league, home_team, away_team, start_time, status, odds_home, odds_draw, odds_away)
SELECT c.id, 'ATP Finals', 'Alcaraz', 'Sinner', now() + interval '1 day', 'upcoming', 1.80, 30.00, 2.00 FROM public.sports_categories c WHERE slug='tennis';

INSERT INTO public.promotions (title, description) VALUES
 ('Welcome Bonus','Every new account starts with 1,000 demo credits.'),
 ('Accumulator Boost','Build a 5+ selection slip and watch your odds multiply.');

INSERT INTO public.referral_codes (code, bonus) VALUES ('WELCOME100', 100);

INSERT INTO public.site_content (key, value) VALUES
 ('hero_title','Bet smarter. Play for fun.'),
 ('hero_subtitle','Live football odds from Ghana, Nigeria and the world — demo credits only.'),
 ('announcement','Demo mode: no real money is wagered. Cash withdrawals are disabled.');
