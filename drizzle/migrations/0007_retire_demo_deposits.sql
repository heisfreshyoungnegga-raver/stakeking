CREATE OR REPLACE FUNCTION public.demo_deposit(_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Demo deposits are disabled. Deposits require verified payment.';
END;
$function$;
COMMENT ON FUNCTION public.demo_deposit(numeric) IS 'DEPRECATED: demo credits disabled; real deposits require verified provider payment.';
REVOKE ALL ON FUNCTION public.demo_deposit(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demo_deposit(numeric) TO authenticated, service_role;