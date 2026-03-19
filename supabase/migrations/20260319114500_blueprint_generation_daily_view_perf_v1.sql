-- Performance follow-up for daily blueprint generation rollups.

CREATE INDEX IF NOT EXISTS idx_generation_run_events_prompt_operation_run_id
  ON public.generation_run_events (((payload ->> 'operation')), run_id)
  WHERE event = 'prompt_rendered';

DROP VIEW IF EXISTS public.blueprint_generation_daily;
DROP VIEW IF EXISTS public.blueprint_generation_run_metrics_v1;

CREATE VIEW public.blueprint_generation_run_metrics_v1 AS
WITH prompt_events AS (
  SELECT
    e.run_id,
    COUNT(*) FILTER (
      WHERE e.operation = 'generateYouTubeBlueprint'
    )::integer AS attempt_count,
    COUNT(*) FILTER (
      WHERE e.operation IN (
        'generateYouTubeBlueprint',
        'generateYouTubeBlueprintPass2Transform'
      )
    )::integer AS output_count
  FROM (
    SELECT
      run_id,
      payload ->> 'operation' AS operation
    FROM public.generation_run_events
    WHERE event = 'prompt_rendered'
      AND (payload ->> 'operation') IN (
        'generateYouTubeBlueprint',
        'generateYouTubeBlueprintPass2Transform'
      )
  ) e
  GROUP BY e.run_id
)
SELECT
  r.run_id,
  r.user_id,
  r.blueprint_id,
  r.video_id,
  r.status,
  r.model_primary,
  r.model_used,
  r.fallback_used,
  r.fallback_model,
  r.reasoning_effort,
  r.error_code,
  r.error_message,
  r.started_at,
  r.finished_at,
  r.created_at,
  COALESCE(p.attempt_count, 0) AS attempt_count,
  COALESCE(p.output_count, 0) AS output_count
FROM public.generation_runs r
LEFT JOIN prompt_events p
  ON p.run_id = r.run_id;

CREATE VIEW public.blueprint_generation_daily AS
SELECT
  date_trunc('day', created_at) AS day,
  COUNT(*) FILTER (WHERE status = 'succeeded')::bigint AS total_blueprints,
  COALESCE(SUM(output_count), 0)::bigint AS total_generations,
  COUNT(*) FILTER (
    WHERE status = 'succeeded'
      AND attempt_count = 1
  )::bigint AS num_one_tries,
  COUNT(*) FILTER (
    WHERE status = 'succeeded'
      AND attempt_count = 2
  )::bigint AS num_two_tries,
  COUNT(*) FILTER (
    WHERE status = 'succeeded'
      AND attempt_count = 3
  )::bigint AS num_three_tries,
  COUNT(*) FILTER (
    WHERE status = 'failed'
      AND attempt_count >= 3
  )::bigint AS num_fails
FROM public.blueprint_generation_run_metrics_v1
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.blueprint_generation_run_metrics_v1 IS
  'Per-run blueprint generation metrics derived from durable trace events. attempt_count counts main generateYouTubeBlueprint calls; output_count counts main generation plus pass2 transform outputs.';

COMMENT ON VIEW public.blueprint_generation_daily IS
  'Daily rollup for blueprint generation monitoring. total_generations sums model outputs; num_one_tries/num_two_tries/num_three_tries count successful runs by attempt count; num_fails counts runs that still failed after three or more attempts.';
