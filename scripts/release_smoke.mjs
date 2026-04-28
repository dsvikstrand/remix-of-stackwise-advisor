#!/usr/bin/env node
import './require-node20.mjs';

const EXPECTED_PUBLIC_PREVIEW_STATUS = 401;

function parseArgs(argv) {
  const args = argv.slice(2);
  const read = (flag, fallback = '') => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() : fallback;
  };
  const readBool = (flag, fallback) => {
    const raw = read(flag, fallback === undefined ? '' : String(fallback));
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    const fallbackNormalized = String(fallback ?? '')
      .trim()
      .toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(fallbackNormalized);
  };

  return {
    apiBaseUrl: read('--api-base-url', String(process.env.RELEASE_API_BASE_URL || 'https://api.bleup.app').trim()),
    frontendBaseUrl: read('--frontend-base-url', String(process.env.RELEASE_FRONTEND_BASE_URL || '').trim()),
    releaseSha: read('--release-sha', String(process.env.RELEASE_SHA || '').trim()),
    serviceToken: read('--service-token', String(process.env.INGESTION_SERVICE_TOKEN || '').trim()),
    expectPwaRuntime: readBool('--expect-pwa-runtime', String(process.env.RELEASE_EXPECT_PWA_RUNTIME || 'true').trim()),
    json: args.includes('--json'),
  };
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function runCheck(name, fn) {
  try {
    return await fn();
  } catch (error) {
    return {
      name,
      pass: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkHealth(apiBaseUrl) {
  return runCheck('api_health', async () => {
    const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/api/health`);
    const body = await readJsonResponse(response);
    const pass = response.status === 200 && body && typeof body === 'object' && body.ok === true;
    return {
      name: 'api_health',
      pass,
      reason: pass ? 'ok' : `expected 200 {"ok":true}, got status=${response.status}`,
      details: {
        status: response.status,
        body,
      },
    };
  });
}

async function checkPublicPreview(apiBaseUrl) {
  return runCheck('public_youtube_preview_auth_guard', async () => {
    const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/api/source-subscriptions/public-youtube-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_input: '@MadameGlome' }),
    });
    const body = await readJsonResponse(response);
    const pass =
      response.status === EXPECTED_PUBLIC_PREVIEW_STATUS &&
      body &&
      typeof body === 'object' &&
      body.error === 'Unauthorized';
    return {
      name: 'public_youtube_preview_auth_guard',
      pass,
      reason: pass
        ? 'ok'
        : `expected ${EXPECTED_PUBLIC_PREVIEW_STATUS} Unauthorized, got status=${response.status}`,
      details: {
        status: response.status,
        body,
      },
    };
  });
}

async function checkQueueHealth(apiBaseUrl, serviceToken) {
  if (!serviceToken) {
    return {
      name: 'queue_health_runtime_mode',
      pass: true,
      skipped: true,
      reason: 'skipped (no service token provided)',
    };
  }

  return runCheck('queue_health_runtime_mode', async () => {
    const response = await fetch(`${trimTrailingSlash(apiBaseUrl)}/api/ops/queue/health`, {
      headers: { 'x-service-token': serviceToken },
    });
    const body = await readJsonResponse(response);
    const runtimeMode = body && typeof body === 'object' ? body?.data?.runtime_mode : null;
    const pass = response.status === 200 && body && typeof body === 'object' && body.ok === true;
    return {
      name: 'queue_health_runtime_mode',
      pass,
      reason: pass ? `ok (${runtimeMode || 'unknown'} runtime)` : `expected queue health ok=true, got status=${response.status}`,
      details: {
        status: response.status,
        body,
      },
    };
  });
}

async function checkFrontendRelease(frontendBaseUrl, releaseSha, apiBaseUrl) {
  if (!frontendBaseUrl || !releaseSha) {
    return {
      name: 'frontend_release_parity',
      pass: true,
      skipped: true,
      reason: 'skipped (frontend base URL or release SHA missing)',
    };
  }

  return runCheck('frontend_release_parity', async () => {
    const response = await fetch(`${trimTrailingSlash(frontendBaseUrl)}/release.json`);
    const body = await readJsonResponse(response);
    const pass =
      response.status === 200 &&
      body &&
      typeof body === 'object' &&
      body.release_sha === releaseSha &&
      body.backend_url === trimTrailingSlash(apiBaseUrl);
    return {
      name: 'frontend_release_parity',
      pass,
      reason: pass ? 'ok' : `expected release.json to match release_sha=${releaseSha}`,
      details: {
        status: response.status,
        body,
      },
    };
  });
}

async function checkFrontendAsset(frontendBaseUrl, path, name) {
  if (!frontendBaseUrl) {
    return {
      name,
      pass: true,
      skipped: true,
      reason: 'skipped (no frontend base URL provided)',
    };
  }

  return runCheck(name, async () => {
    const response = await fetch(`${trimTrailingSlash(frontendBaseUrl)}/${path.replace(/^\/+/, '')}`);
    const pass = response.status === 200;
    return {
      name,
      pass,
      reason: pass ? 'ok' : `expected 200 for ${path}, got status=${response.status}`,
      details: {
        status: response.status,
        url: response.url,
      },
    };
  });
}

async function checkServiceWorkerRuntime(frontendBaseUrl, expectPwaRuntime) {
  if (!frontendBaseUrl) {
    return {
      name: 'service_worker_runtime_contract',
      pass: true,
      skipped: true,
      reason: 'skipped (no frontend base URL provided)',
    };
  }

  if (!expectPwaRuntime) {
    return {
      name: 'service_worker_runtime_contract',
      pass: true,
      skipped: true,
      reason: 'skipped (PWA runtime not expected for this publish)',
    };
  }

  return runCheck('service_worker_runtime_contract', async () => {
    const response = await fetch(`${trimTrailingSlash(frontendBaseUrl)}/sw.js`);
    const body = await response.text();
    const hasNavCacheMarker = body.includes('bleup-nav-v1');
    const hasSkipWaitingMarker = body.includes('SKIP_WAITING');
    const hasReleaseJsonPrecacheEntry =
      /["']url["']\s*:\s*["'][^"']*release\.json["']/.test(body) ||
      /url:"[^"]*release\.json"/.test(body);
    const pass = response.status === 200 && hasNavCacheMarker && hasSkipWaitingMarker && !hasReleaseJsonPrecacheEntry;

    return {
      name: 'service_worker_runtime_contract',
      pass,
      reason: pass
        ? 'ok'
        : `expected sw.js runtime markers and no release.json precache entry, got status=${response.status}`,
      details: {
        status: response.status,
        has_nav_cache_marker: hasNavCacheMarker,
        has_skip_waiting_marker: hasSkipWaitingMarker,
        has_release_json_precache_entry: hasReleaseJsonPrecacheEntry,
      },
    };
  });
}

async function main() {
  const options = parseArgs(process.argv);
  const checks = [
    await checkHealth(options.apiBaseUrl),
    await checkPublicPreview(options.apiBaseUrl),
    await checkQueueHealth(options.apiBaseUrl, options.serviceToken),
    await checkFrontendRelease(options.frontendBaseUrl, options.releaseSha, options.apiBaseUrl),
    await checkFrontendAsset(options.frontendBaseUrl, 'manifest.webmanifest', 'manifest_asset'),
    await checkFrontendAsset(options.frontendBaseUrl, 'sw.js', 'service_worker_asset'),
    await checkFrontendAsset(options.frontendBaseUrl, 'offline.html', 'offline_fallback_asset'),
    await checkServiceWorkerRuntime(options.frontendBaseUrl, options.expectPwaRuntime),
  ];
  const failed = checks.filter((check) => !check.pass);
  const verdict = failed.length === 0 ? 'PASS' : 'FAIL';

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          verdict,
          api_base_url: options.apiBaseUrl,
          frontend_base_url: options.frontendBaseUrl || null,
          release_sha: options.releaseSha || null,
          checks,
        },
        null,
        2,
      ),
    );
    process.exit(failed.length === 0 ? 0 : 1);
  }

  console.log(`Release Smoke (${verdict})`);
  console.log(`- api_base_url: ${options.apiBaseUrl}`);
  if (options.frontendBaseUrl) console.log(`- frontend_base_url: ${options.frontendBaseUrl}`);
  if (options.releaseSha) console.log(`- release_sha: ${options.releaseSha}`);
  console.log(`- expect_pwa_runtime: ${options.expectPwaRuntime}`);
  for (const check of checks) {
    const prefix = check.skipped ? 'SKIP' : check.pass ? 'PASS' : 'FAIL';
    console.log(`- [${prefix}] ${check.name}: ${check.reason}`);
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
