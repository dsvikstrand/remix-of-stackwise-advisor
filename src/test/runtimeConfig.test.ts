import { describe, expect, it } from 'vitest';
import { parseRuntimeFlag, readBackendRuntimeConfig } from '../../server/services/runtimeConfig';

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
});
