-- Durable, idempotent delivery claims for the canonical admin push sender.
CREATE TABLE IF NOT EXISTS public.notification_push_deliveries (
  id BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL,
  token TEXT NOT NULL,
  app_type TEXT NOT NULL DEFAULT 'responder',
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'sent', 'retry')),
  attempts INTEGER NOT NULL DEFAULT 1,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_push_deliveries_unique
    UNIQUE (notification_id, token, app_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_push_deliveries_retry
  ON public.notification_push_deliveries (status, available_at);

ALTER TABLE public.notification_push_deliveries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_notification_push_delivery(
  p_notification_id BIGINT,
  p_token TEXT,
  p_app_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.notification_push_deliveries
    (notification_id, token, app_type)
  VALUES
    (p_notification_id, p_token, COALESCE(NULLIF(p_app_type, ''), 'responder'))
  ON CONFLICT (notification_id, token, app_type) DO NOTHING;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    RETURN TRUE;
  END IF;

  UPDATE public.notification_push_deliveries
  SET status = 'processing',
      attempts = attempts + 1,
      locked_at = NOW(),
      last_error = NULL
  WHERE notification_id = p_notification_id
    AND token = p_token
    AND app_type = COALESCE(NULLIF(p_app_type, ''), 'responder')
    AND status = 'retry'
    AND available_at <= NOW();

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected > 0 THEN
    RETURN TRUE;
  END IF;

  UPDATE public.notification_push_deliveries
  SET status = 'processing',
      attempts = attempts + 1,
      locked_at = NOW(),
      last_error = NULL
  WHERE notification_id = p_notification_id
    AND token = p_token
    AND app_type = COALESCE(NULLIF(p_app_type, ''), 'responder')
    AND status = 'processing'
    AND locked_at < NOW() - INTERVAL '10 minutes';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_notification_push_delivery(
  p_notification_id BIGINT,
  p_token TEXT,
  p_app_type TEXT,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL,
  p_retry_delay_seconds INTEGER DEFAULT 60
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notification_push_deliveries
  SET status = CASE WHEN p_success THEN 'sent' ELSE 'retry' END,
      sent_at = CASE WHEN p_success THEN NOW() ELSE NULL END,
      available_at = CASE
        WHEN p_success THEN NOW()
        ELSE NOW() + MAKE_INTERVAL(secs => GREATEST(p_retry_delay_seconds, 30))
      END,
      last_error = CASE WHEN p_success THEN NULL ELSE LEFT(p_error, 1000) END
  WHERE notification_id = p_notification_id
    AND token = p_token
    AND app_type = COALESCE(NULLIF(p_app_type, ''), 'responder')
    AND status = 'processing'
    AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_push_delivery(BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_notification_push_delivery(BIGINT, TEXT, TEXT, BOOLEAN, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_push_delivery(BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_push_delivery(BIGINT, TEXT, TEXT, BOOLEAN, TEXT, INTEGER) TO authenticated;
