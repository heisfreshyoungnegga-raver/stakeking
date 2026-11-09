CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE ref text;
BEGIN
  ref := nullif(upper(trim(coalesce(NEW.raw_user_meta_data->>'referral_code',''))),'');
  IF ref IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.referral_codes r WHERE r.code = ref AND r.active) THEN
      UPDATE public.referral_codes SET uses = uses + 1 WHERE code = ref;
    ELSE
      ref := NULL;
    END IF;
  END IF;
  INSERT INTO public.profiles (id, full_name, email, country, phone, referral_code, balance)
  VALUES (NEW.id, left(coalesce(NEW.raw_user_meta_data->>'full_name',''),100), coalesce(NEW.email,''),
    'Ghana',
    left(coalesce(NEW.raw_user_meta_data->>'phone',''),20), ref, 0);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END $function$;