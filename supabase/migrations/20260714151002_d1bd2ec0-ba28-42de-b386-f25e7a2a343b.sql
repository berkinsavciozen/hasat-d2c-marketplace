CREATE TABLE public.mcp_tool_calls (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX mcp_tool_calls_user_time_idx ON public.mcp_tool_calls (user_id, called_at DESC);

GRANT SELECT, INSERT, DELETE ON public.mcp_tool_calls TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mcp_tool_calls_id_seq TO authenticated;
GRANT ALL ON public.mcp_tool_calls TO service_role;
GRANT ALL ON SEQUENCE public.mcp_tool_calls_id_seq TO service_role;

ALTER TABLE public.mcp_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mcp tool calls"
  ON public.mcp_tool_calls FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own mcp tool calls"
  ON public.mcp_tool_calls FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.check_and_record_mcp_call()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  recent_count integer;
  window_start timestamptz := now() - interval '10 minutes';
BEGIN
  -- Skip enforcement for service_role / non-authenticated callers
  IF uid IS NULL THEN
    RETURN true;
  END IF;

  -- Opportunistic cleanup: delete rows older than 1 hour (kept only for stats/debug)
  DELETE FROM public.mcp_tool_calls
    WHERE called_at < now() - interval '1 hour';

  SELECT count(*) INTO recent_count
    FROM public.mcp_tool_calls
    WHERE user_id = uid AND called_at > window_start;

  IF recent_count >= 30 THEN
    RAISE EXCEPTION 'Çok fazla istek gönderildi, birkaç dakika sonra tekrar deneyin.';
  END IF;

  INSERT INTO public.mcp_tool_calls (user_id) VALUES (uid);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_record_mcp_call() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_mcp_call() TO service_role;