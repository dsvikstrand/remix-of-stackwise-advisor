-- Treat the final success/failure bucket as 3+ attempts so historical runs align with
-- the current retry model exposed in the dashboard.

DROP VIEW IF EXISTS public.blueprint_generation_daily;

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
      AND attempt_count >= 3
  )::bigint AS num_three_tries,
  COUNT(*) FILTER (
    WHERE status = 'failed'
      AND attempt_count >= 3
  )::bigint AS num_fails
FROM public.blueprint_generation_run_metrics_v1
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.blueprint_generation_daily IS
  'Daily rollup for blueprint generation monitoring. total_generations sums model outputs; num_one_tries/num_two_tries count successful runs by attempt count; num_three_tries and num_fails are 3+ attempt buckets.';
