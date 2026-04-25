import { describe, expect, it } from 'vitest';
import {
  parseRuntimeFlag,
  readBackendRuntimeConfig,
  readWorkerRuntimeControls,
} from '../../server/services/runtimeConfig';

describe('runtime config service', () => {
  it('parses common runtime flag values', () => {
    expect(parseRuntimeFlag('true', false)).toBe(true);
    expect(parseRuntimeFlag('on', false)).toBe(true);
    expect(parseRuntimeFlag('1', false)).toBe(true);
    expect(parseRuntimeFlag('false', true)).toBe(false);
    expect(parseRuntimeFlag('off', true)).toBe(false);
    expect(parseRuntimeFlag('0', true)).toBe(false);
  });

  it('defaults to combined mode when both runtime flags are unset', () => {
    expect(readBackendRuntimeConfig({})).toEqual({
      runHttpServer: true,
      runIngestionWorker: true,
      runtimeMode: 'combined',
    });
  });

  it('resolves web_only mode when only the HTTP server is enabled', () => {
    expect(readBackendRuntimeConfig({
      RUN_HTTP_SERVER: 'true',
      RUN_INGESTION_WORKER: 'false',
    })).toEqual({
      runHttpServer: true,
      runIngestionWorker: false,
      runtimeMode: 'web_only',
    });
  });

  it('resolves worker_only mode when only the worker is enabled', () => {
    expect(readBackendRuntimeConfig({
      RUN_HTTP_SERVER: 'false',
      RUN_INGESTION_WORKER: 'true',
    })).toEqual({
      runHttpServer: false,
      runIngestionWorker: true,
      runtimeMode: 'worker_only',
    });
  });

  it('throws when both runtime flags are disabled', () => {
    expect(() => readBackendRuntimeConfig({
      RUN_HTTP_SERVER: 'false',
      RUN_INGESTION_WORKER: 'false',
    })).toThrow('INVALID_BACKEND_RUNTIME_MODE');
  });

  it('keeps full bootstrap and auxiliary schedulers in combined mode', () => {
    expect(readWorkerRuntimeControls({}, 'combined')).toEqual({
      oracleBootstrapProfile: 'full',
      runOracleReadPlaneBootstrap: true,
      runOracleMirrorBootstrap: true,
      runYoutubeRefreshScheduler: true,
      runNotificationPushDispatcher: true,
      runUnlockSweeps: true,
      runStaleJobRecovery: true,
      runQueueSweepControl: true,
      memoryLoggingEnabled: false,
    });
  });

  it('defaults worker_only to worker-critical bootstrap without auxiliary schedulers', () => {
    expect(readWorkerRuntimeControls({}, 'worker_only')).toEqual({
      oracleBootstrapProfile: 'worker_critical',
      runOracleReadPlaneBootstrap: false,
      runOracleMirrorBootstrap: false,
      runYoutubeRefreshScheduler: false,
      runNotificationPushDispatcher: false,
      runUnlockSweeps: false,
      runStaleJobRecovery: false,
      runQueueSweepControl: false,
      memoryLoggingEnabled: true,
    });
  });

  it('allows explicit worker-only diagnostic opt-ins', () => {
    expect(readWorkerRuntimeControls({
      WORKER_ENABLE_ORACLE_READ_PLANE_BOOTSTRAP: 'true',
      WORKER_ENABLE_ORACLE_MIRROR_BOOTSTRAP: '1',
      WORKER_ENABLE_YOUTUBE_REFRESH_SCHEDULER: 'on',
      WORKER_ENABLE_NOTIFICATION_PUSH_DISPATCHER: 'yes',
      WORKER_ENABLE_UNLOCK_SWEEPS: 'true',
      WORKER_ENABLE_STALE_JOB_RECOVERY: 'true',
      WORKER_ENABLE_QUEUE_SWEEP_CONTROL: 'true',
      WORKER_MEMORY_LOGGING_ENABLED: 'false',
    }, 'worker_only')).toEqual({
      oracleBootstrapProfile: 'worker_critical',
      runOracleReadPlaneBootstrap: true,
      runOracleMirrorBootstrap: true,
      runYoutubeRefreshScheduler: true,
      runNotificationPushDispatcher: true,
      runUnlockSweeps: true,
      runStaleJobRecovery: true,
      runQueueSweepControl: true,
      memoryLoggingEnabled: false,
    });
  });
});
