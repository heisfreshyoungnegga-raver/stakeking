CREATE TABLE public.payment_credentials (
 provider text PRIMARY KEY,
 api_key_ciphertext text,
 webhook_secret_ciphertext text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payment_credentials TO service_role;
ALTER TABLE public.payment_credentials ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.shinobipay_credential_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 RETURN coalesce((SELECT jsonb_build_object('apiKeySet', api_key_ciphertext IS NOT NULL, 'webhookSecretSet', webhook_secret_ciphertext IS NOT NULL) FROM public.payment_credentials WHERE provider = 'shinobipay'), '{"apiKeySet":false,"webhookSecretSet":false}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.shinobipay_credential_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shinobipay_credential_status() TO authenticated;
CREATE OR REPLACE FUNCTION public.save_shinobipay_credentials(_api_key_ciphertext text DEFAULT NULL, _webhook_secret_ciphertext text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF _api_key_ciphertext IS NULL AND _webhook_secret_ciphertext IS NULL THEN RETURN; END IF;
 INSERT INTO public.payment_credentials(provider, api_key_ciphertext, webhook_secret_ciphertext)
 VALUES ('shinobipay', _api_key_ciphertext, _webhook_secret_ciphertext)
 ON CONFLICT(provider) DO UPDATE SET api_key_ciphertext=coalesce(EXCLUDED.api_key_ciphertext, payment_credentials.api_key_ciphertext), webhook_secret_ciphertext=coalesce(EXCLUDED.webhook_secret_ciphertext, payment_credentials.webhook_secret_ciphertext), updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_shinobipay_credentials(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_shinobipay_credentials(text,text) TO authenticated;