import { createRequire } from 'node:module';

type ClosableDispatcher = {
  close?: () => Promise<void> | void;
  destroy?: () => Promise<void> | void;
};

type ProxyAgentConstructor = new (
  options: string | { uri: string; token?: string },
) => ClosableDispatcher;
type UndiciRequestResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: {
    json: () => Promise<unknown>;
  };
};

export type UndiciRequestFn = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body: string;
    dispatcher: ClosableDispatcher;
  },
) => Promise<UndiciRequestResponse>;

type YtToTextProxyRequestTools = {
  dispatcher: ClosableDispatcher;
  request: UndiciRequestFn;
};

type ProxyConnectionConfig = {
  uri: string;
  token?: string;
};

type WebshareProxyListRow = {
  proxy_address?: unknown;
  port?: unknown;
  username?: unknown;
  password?: unknown;
  valid?: unknown;
};

type WebshareProxyListResponse = {
  results?: WebshareProxyListRow[];
};

const TRUE_PATTERN = /^(1|true|yes|on)$/i;
const require = createRequire(import.meta.url);

let cachedProxyUrl: string | null = null;
let cachedDispatcher: ClosableDispatcher | undefined;
let didWarnIncompleteConfig = false;
let didWarnMissingUndici = false;
let didWarnIndexSelectorConfig = false;
let didWarnIndexSelectorFailure = false;
let cachedProxyAgentConstructor: ProxyAgentConstructor | null | undefined;
let cachedUndiciRequestFn: UndiciRequestFn | null | undefined;
let cachedIndexProxyConfigKey: string | null = null;
let cachedIndexProxyConfigPromise: Promise<ProxyConnectionConfig | null> | null = null;
let proxyAgentFactoryOverride: ProxyAgentConstructor | null | undefined;
let undiciRequestOverride: UndiciRequestFn | null | undefined;

function isTruthyEnv(raw: string | undefined) {
  return TRUE_PATTERN.test(String(raw || '').trim());
}

function readEnv(name: string) {
  return String(process.env[name] || '').trim();
}

function warnIncompleteProxyConfig() {
  if (didWarnIncompleteConfig) return;
  didWarnIncompleteConfig = true;
  console.warn(
    '[webshare-proxy] YT_TO_TEXT_USE_WEBSHARE_PROXY is enabled, but the proxy configuration is incomplete. Falling back to direct requests.',
  );
}

function warnMissingUndici() {
  if (didWarnMissingUndici) return;
  didWarnMissingUndici = true;
  console.warn(
    '[webshare-proxy] Could not load undici proxy tools. Falling back to direct requests.',
  );
}

function warnIndexSelectorConfig(message: string) {
  if (didWarnIndexSelectorConfig) return;
  didWarnIndexSelectorConfig = true;
  console.warn(`[webshare-proxy] ${message} Falling back to the explicit fixed proxy config.`);
}

function warnIndexSelectorFailure(message: string) {
  if (didWarnIndexSelectorFailure) return;
  didWarnIndexSelectorFailure = true;
  console.warn(`[webshare-proxy] ${message} Falling back to the explicit fixed proxy config.`);
}

function getProxyAgentConstructor() {
  if (proxyAgentFactoryOverride !== undefined) {
    return proxyAgentFactoryOverride;
  }

  if (cachedProxyAgentConstructor !== undefined) return cachedProxyAgentConstructor;

  try {
    const undici = require('undici') as { ProxyAgent?: ProxyAgentConstructor };
    cachedProxyAgentConstructor = undici.ProxyAgent || null;
  } catch {
    cachedProxyAgentConstructor = null;
  }

  if (!cachedProxyAgentConstructor) {
    warnMissingUndici();
  }

  return cachedProxyAgentConstructor;
}

export function setYtToTextProxyAgentFactoryForTests(factory: ProxyAgentConstructor | null | undefined) {
  proxyAgentFactoryOverride = factory;
}

function getUndiciRequestFunction() {
  if (undiciRequestOverride !== undefined) {
    return undiciRequestOverride;
  }

  if (cachedUndiciRequestFn !== undefined) return cachedUndiciRequestFn;

  try {
    const undici = require('undici') as { request?: UndiciRequestFn };
    cachedUndiciRequestFn = undici.request || null;
  } catch {
    cachedUndiciRequestFn = null;
  }

  if (!cachedUndiciRequestFn) {
    warnMissingUndici();
  }

  return cachedUndiciRequestFn;
}

export function setYtToTextUndiciRequestForTests(requestFn: UndiciRequestFn | null | undefined) {
  undiciRequestOverride = requestFn;
}

function buildProxyConnectionConfig(host: string, port: number, username: string, password: string) {
  const proxyUrl = new URL(`http://${host}`);
  proxyUrl.port = String(port);
  return {
    uri: proxyUrl.toString(),
    token: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  } satisfies ProxyConnectionConfig;
}

function buildExplicitProxyConfig() {
  const explicitProxyUrl = readEnv('WEBSHARE_PROXY_URL');
  if (explicitProxyUrl) {
    const parsed = new URL(explicitProxyUrl);
    const username = parsed.username ? decodeURIComponent(parsed.username) : '';
    const password = parsed.password ? decodeURIComponent(parsed.password) : '';
    parsed.username = '';
    parsed.password = '';
    return {
      uri: parsed.toString(),
      token: username || password
        ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
        : undefined,
    } satisfies ProxyConnectionConfig;
  }

  const host = readEnv('WEBSHARE_PROXY_HOST');
  const portRaw = readEnv('WEBSHARE_PROXY_PORT');
  const username = readEnv('WEBSHARE_PROXY_USERNAME');
  const password = readEnv('WEBSHARE_PROXY_PASSWORD');

  if (!host && !portRaw && !username && !password) {
    warnIncompleteProxyConfig();
    return null;
  }

  const port = Number(portRaw);
  if (!host || !Number.isInteger(port) || port <= 0 || !username || !password) {
    warnIncompleteProxyConfig();
    return null;
  }

  return buildProxyConnectionConfig(host, port, username, password);
}

function isIndexSelectionEnabled() {
  return isTruthyEnv(process.env.YT_TO_TEXT_PROXY_SELECT_BY_INDEX);
}

type SelectedProxyIndex = number | 'rand';

function parseSelectedProxyIndex(): SelectedProxyIndex | null {
  const raw = readEnv('YT_TO_TEXT_PROXY_INDEX');
  if (!raw) return 0;
  if (raw.toLowerCase() === 'rand') return 'rand';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

async function fetchIndexedProxyConfig(): Promise<ProxyConnectionConfig | null> {
  if (!isIndexSelectionEnabled()) return null;

  const apiKey = readEnv('WEBSHARE_API_KEY');
  const planId = readEnv('WEBSHARE_PLAN_ID');
  const baseUrl = readEnv('WEBSHARE_BASE_URL') || 'https://proxy.webshare.io/api';
  const proxyIndex = parseSelectedProxyIndex();

  if (!apiKey || !planId || proxyIndex == null) {
    warnIndexSelectorConfig(
      'YT_TO_TEXT_PROXY_SELECT_BY_INDEX is enabled, but WEBSHARE_API_KEY, WEBSHARE_PLAN_ID, or YT_TO_TEXT_PROXY_INDEX is invalid.',
    );
    return null;
  }

  const cacheKey = `${baseUrl}|${planId}|${proxyIndex}`;
  if (cachedIndexProxyConfigKey === cacheKey && cachedIndexProxyConfigPromise) {
    return cachedIndexProxyConfigPromise;
  }

  cachedIndexProxyConfigKey = cacheKey;
  cachedIndexProxyConfigPromise = (async () => {
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/v2/proxy/list/?mode=direct&plan_id=${encodeURIComponent(planId)}`,
        {
          headers: {
            Authorization: `Token ${apiKey}`,
          },
        },
      );
      if (!response.ok) {
        warnIndexSelectorFailure(`Webshare API returned HTTP ${response.status} while selecting a proxy by index.`);
        return null;
      }

      const payload = await response.json().catch(() => null) as WebshareProxyListResponse | null;
      const usableRows = Array.isArray(payload?.results)
        ? payload.results.filter((row) => row?.valid !== false)
        : [];
      if (!usableRows.length) {
        warnIndexSelectorFailure('Webshare API returned no usable direct proxies.');
        return null;
      }
      const selectedRowIndex = proxyIndex === 'rand'
        ? Math.floor(Math.random() * usableRows.length)
        : proxyIndex;
      if (selectedRowIndex >= usableRows.length) {
        warnIndexSelectorFailure(
          `YT_TO_TEXT_PROXY_INDEX=${proxyIndex} is out of range for the available Webshare direct proxy list.`,
        );
        return null;
      }

      const selected = usableRows[selectedRowIndex];
      const host = typeof selected?.proxy_address === 'string' ? selected.proxy_address.trim() : '';
      const port = Number(selected?.port);
      const username = typeof selected?.username === 'string' ? selected.username.trim() : '';
      const password = typeof selected?.password === 'string' ? selected.password.trim() : '';
      if (!host || !Number.isInteger(port) || port <= 0 || !username || !password) {
        warnIndexSelectorFailure('The selected Webshare proxy entry is missing required fields.');
        return null;
      }

      return buildProxyConnectionConfig(host, port, username, password);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Unknown selector error.';
      warnIndexSelectorFailure(`Could not fetch the Webshare direct proxy list (${message}).`);
      return null;
    }
  })();

  return cachedIndexProxyConfigPromise;
}

async function resolveProxyConnectionConfig() {
  const indexedProxy = await fetchIndexedProxyConfig();
  if (indexedProxy) return indexedProxy;
  return buildExplicitProxyConfig();
}

export async function getYtToTextProxyRequestTools(): Promise<YtToTextProxyRequestTools | null> {
  if (!isTruthyEnv(process.env.YT_TO_TEXT_USE_WEBSHARE_PROXY)) {
    return null;
  }

  const proxyConfig = await resolveProxyConnectionConfig();
  if (!proxyConfig) return null;

  const ProxyAgent = getProxyAgentConstructor();
  const request = getUndiciRequestFunction();
  if (!ProxyAgent || !request) return null;

  if (!cachedDispatcher || cachedProxyUrl !== proxyConfig.uri) {
    cachedProxyUrl = proxyConfig.uri;
    cachedDispatcher = new ProxyAgent({
      uri: proxyConfig.uri,
      token: proxyConfig.token,
    });
  }

  return { dispatcher: cachedDispatcher, request };
}

export async function resetYtToTextProxyDispatcher() {
  const dispatcher = cachedDispatcher;
  cachedProxyUrl = null;
  cachedDispatcher = undefined;
  didWarnIncompleteConfig = false;
  didWarnMissingUndici = false;
  didWarnIndexSelectorConfig = false;
  didWarnIndexSelectorFailure = false;
  cachedProxyAgentConstructor = undefined;
  cachedUndiciRequestFn = undefined;
  cachedIndexProxyConfigKey = null;
  cachedIndexProxyConfigPromise = null;
  proxyAgentFactoryOverride = undefined;
  undiciRequestOverride = undefined;
  if (!dispatcher) return;
  if (typeof dispatcher.destroy === 'function') {
    await dispatcher.destroy();
    return;
  }
  if (typeof dispatcher.close === 'function') {
    await dispatcher.close();
  }
}
