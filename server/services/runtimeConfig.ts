export type BackendRuntimeMode = 'combined' | 'web_only' | 'worker_only';

export type BackendRuntimeConfig = {
  runHttpServer: boolean;
  runIngestionWorker: boolean;
  runtimeMode: BackendRuntimeMode;
};

export type WorkerRuntimeControls = {
  oracleBootstrapProfile: 'full' | 'worker_critical';
  runOracleReadPlaneBootstrap: boolean;
  runOracleMirrorBootstrap: boolean;
  runYoutubeRefreshScheduler: boolean;
  runNotificationPushDispatcher: boolean;
  memoryLoggingEnabled: boolean;
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

export function readWorkerRuntimeControls(
  env: NodeJS.ProcessEnv,
  runtimeMode: BackendRuntimeMode,
): WorkerRuntimeControls {
  const workerOnly = runtimeMode === 'worker_only';
  const runOracleReadPlaneBootstrap = workerOnly
    ? parseRuntimeFlag(env.WORKER_ENABLE_ORACLE_READ_PLANE_BOOTSTRAP, false)
    : true;
  const runOracleMirrorBootstrap = workerOnly
    ? parseRuntimeFlag(env.WORKER_ENABLE_ORACLE_MIRROR_BOOTSTRAP, false)
    : true;

  return {
    oracleBootstrapProfile: workerOnly ? 'worker_critical' : 'full',
    runOracleReadPlaneBootstrap,
    runOracleMirrorBootstrap,
    runYoutubeRefreshScheduler: workerOnly
      ? parseRuntimeFlag(env.WORKER_ENABLE_YOUTUBE_REFRESH_SCHEDULER, false)
      : true,
    runNotificationPushDispatcher: workerOnly
      ? parseRuntimeFlag(env.WORKER_ENABLE_NOTIFICATION_PUSH_DISPATCHER, false)
      : true,
    memoryLoggingEnabled: parseRuntimeFlag(env.WORKER_MEMORY_LOGGING_ENABLED, workerOnly),
  };
}
