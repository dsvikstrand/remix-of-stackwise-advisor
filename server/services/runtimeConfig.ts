export type BackendRuntimeMode = 'combined' | 'web_only' | 'worker_only';

export type BackendRuntimeConfig = {
  runHttpServer: boolean;
  runIngestionWorker: boolean;
  runtimeMode: BackendRuntimeMode;
};

export function parseRuntimeFlag(raw: string | undefined, fallback: boolean) {
  const normalized = String(raw ?? (fallback ? 'true' : 'false')).trim().toLowerCase();
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  return fallback;
}

export function readBackendRuntimeConfig(env: NodeJS.ProcessEnv): BackendRuntimeConfig {
  const runHttpServer = parseRuntimeFlag(env.RUN_HTTP_SERVER, true);
  const runIngestionWorker = parseRuntimeFlag(env.RUN_INGESTION_WORKER, true);
  if (!runHttpServer && !runIngestionWorker) {
    throw new Error('INVALID_BACKEND_RUNTIME_MODE');
  }
  const runtimeMode: BackendRuntimeMode = runHttpServer && runIngestionWorker
    ? 'combined'
    : runHttpServer
      ? 'web_only'
      : 'worker_only';

  return {
    runHttpServer,
    runIngestionWorker,
    runtimeMode,
  };
}
