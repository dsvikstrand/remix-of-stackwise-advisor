/*
  Harmless round-robin Webshare smoke test.
  Purpose:
    - Fetch direct proxies from the configured Webshare plan
    - Use them in strict order
    - Hit https://ipv4.webshare.io/ through each proxy
    - Print a compact JSON summary

  Typical usage:
    tsx scripts/round_robin_webshare_smoke.ts --count 10
*/

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

type ProxyRow = {
  id: string;
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  valid: boolean;
  country_code: string | null;
  city_name: string | null;
};

type ProxyListResponse = {
  count: number;
  results: ProxyRow[];
};

type SmokeRow = {
  index: number;
  proxy_id: string;
  proxy_address: string;
  port: number;
  country_code: string | null;
  city_name: string | null;
  ok: boolean;
  status_code: number | null;
  exit_ip: string | null;
  latency_ms: number;
  error: string | null;
};

function loadEnvFileIfPresent(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}

function loadProjectEnv() {
  const root = process.cwd();
  loadEnvFileIfPresent(path.join(root, '.env'));
  loadEnvFileIfPresent(path.join(root, '.env.production'));
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    return args[index + 1];
  };

  return {
    count: parsePositiveInt(get('--count'), 10),
    timeoutMs: parsePositiveInt(get('--timeout-ms'), 15_000),
  };
}

async function fetchProxyList(): Promise<ProxyRow[]> {
  const apiKey = String(process.env.WEBSHARE_API_KEY || '').trim();
  const planId = String(process.env.WEBSHARE_PLAN_ID || '').trim();
  const baseUrl = String(process.env.WEBSHARE_BASE_URL || 'https://proxy.webshare.io/api').trim();
  if (!apiKey) {
    throw new Error('WEBSHARE_API_KEY is required.');
  }
  if (!planId) {
    throw new Error('WEBSHARE_PLAN_ID is required.');
  }

  const response = await fetch(
    `${baseUrl.replace(/\/$/, '')}/v2/proxy/list/?mode=direct&plan_id=${encodeURIComponent(planId)}`,
    {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Webshare API returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as ProxyListResponse;
  if (!Array.isArray(payload?.results)) {
    throw new Error('Webshare API returned an unexpected response shape.');
  }

  return payload.results.filter((row) => row && row.valid !== false);
}

function getUndiciTools() {
  const requireFromRoot = createRequire(path.join(process.cwd(), 'package.json'));
  const undici = requireFromRoot('undici') as {
    request: (
      url: string,
      options: {
        method: string;
        dispatcher: unknown;
        signal: AbortSignal;
      },
    ) => Promise<{
      statusCode: number;
      body: { text: () => Promise<string> };
    }>;
    ProxyAgent: new (
      options: { uri: string; token?: string },
    ) => { destroy: () => Promise<void> | void };
  };
  return undici;
}

function buildProxyToken(proxy: ProxyRow) {
  return `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')}`;
}

async function smokeOneProxy(
  proxy: ProxyRow,
  index: number,
  timeoutMs: number,
): Promise<SmokeRow> {
  const { request, ProxyAgent } = getUndiciTools();
  const startedAt = Date.now();
  const agent = new ProxyAgent({
    uri: `http://${proxy.proxy_address}:${proxy.port}`,
    token: buildProxyToken(proxy),
  });

  try {
    const response = await request('https://ipv4.webshare.io/', {
      method: 'GET',
      dispatcher: agent,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = (await response.body.text()).trim();

    return {
      index,
      proxy_id: proxy.id,
      proxy_address: proxy.proxy_address,
      port: proxy.port,
      country_code: proxy.country_code,
      city_name: proxy.city_name,
      ok: response.statusCode >= 200 && response.statusCode < 300,
      status_code: response.statusCode,
      exit_ip: text || null,
      latency_ms: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      index,
      proxy_id: proxy.id,
      proxy_address: proxy.proxy_address,
      port: proxy.port,
      country_code: proxy.country_code,
      city_name: proxy.city_name,
      ok: false,
      status_code: null,
      exit_ip: null,
      latency_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await agent.destroy();
  }
}

async function main() {
  loadProjectEnv();
  const { count, timeoutMs } = parseArgs();
  const proxies = await fetchProxyList();
  const selected = proxies.slice(0, Math.max(1, count));
  if (!selected.length) {
    throw new Error('No usable direct proxies were returned by Webshare.');
  }

  const rows: SmokeRow[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    rows.push(await smokeOneProxy(selected[index], index + 1, timeoutMs));
  }

  const okCount = rows.filter((row) => row.ok).length;
  const failedCount = rows.length - okCount;

  console.log(JSON.stringify({
    ok: failedCount === 0,
    mode: 'round_robin_direct',
    target: 'https://ipv4.webshare.io/',
    total_requested: rows.length,
    ok_count: okCount,
    failed_count: failedCount,
    rows,
  }, null, 2));

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({
    ok: false,
    error: message,
  }, null, 2));
  process.exit(1);
});
