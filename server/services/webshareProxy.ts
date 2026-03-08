import { createRequire } from 'node:module';
import type { TranscriptTransportMetadata } from '../transcript/types';

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
  transport: TranscriptTransportMetadata;
};

type ProxyConnectionConfig = {
  uri: string;
  token?: string;
};

type ResolvedProxyConnection = {
  config: ProxyConnectionConfig;
  transport: TranscriptTransportMetadata;
};

const TRUE_PATTERN = /^(1|true|yes|on)$/i;
const require = createRequire(import.meta.url);

let cachedProxyUrl: string | null = null;
let cachedDispatcher: ClosableDispatcher | undefined;
let didWarnIncompleteConfig = false;
let didWarnMissingUndici = false;
let cachedProxyAgentConstructor: ProxyAgentConstructor | null | undefined;
let cachedUndiciRequestFn: UndiciRequestFn | null | undefined;
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

function buildExplicitProxyConfig(): ResolvedProxyConnection | null {
  const explicitProxyUrl = readEnv('WEBSHARE_PROXY_URL');
  if (explicitProxyUrl) {
    const parsed = new URL(explicitProxyUrl);
    const username = parsed.username ? decodeURIComponent(parsed.username) : '';
    const password = parsed.password ? decodeURIComponent(parsed.password) : '';
    parsed.username = '';
    parsed.password = '';
    return {
      config: {
        uri: parsed.toString(),
        token: username || password
          ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
          : undefined,
      },
      transport: {
        provider: 'yt_to_text',
        proxy_enabled: true,
        proxy_mode: 'webshare_explicit',
        proxy_selector: 'explicit',
        proxy_selected_index: null,
        proxy_host: parsed.hostname || null,
      },
    } satisfies ResolvedProxyConnection;
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

  return {
    config: buildProxyConnectionConfig(host, port, username, password),
    transport: {
      provider: 'yt_to_text',
      proxy_enabled: true,
      proxy_mode: 'webshare_explicit',
      proxy_selector: 'explicit',
      proxy_selected_index: null,
      proxy_host: host,
    },
  } satisfies ResolvedProxyConnection;
}

export function getYtToTextProxyDebugMode(): 'disabled' | 'explicit' {
  if (!isTruthyEnv(process.env.YT_TO_TEXT_USE_WEBSHARE_PROXY)) {
    return 'disabled';
  }
  return 'explicit';
}

async function resolveProxyConnectionConfig(): Promise<ResolvedProxyConnection | null> {
  return buildExplicitProxyConfig();
}

export async function getYtToTextProxyRequestTools(): Promise<YtToTextProxyRequestTools | null> {
  if (!isTruthyEnv(process.env.YT_TO_TEXT_USE_WEBSHARE_PROXY)) {
    return null;
  }

  const proxyConnection = await resolveProxyConnectionConfig();
  if (!proxyConnection) return null;

  const ProxyAgent = getProxyAgentConstructor();
  const request = getUndiciRequestFunction();
  if (!ProxyAgent || !request) return null;

  if (!cachedDispatcher || cachedProxyUrl !== proxyConnection.config.uri) {
    cachedProxyUrl = proxyConnection.config.uri;
    cachedDispatcher = new ProxyAgent({
      uri: proxyConnection.config.uri,
      token: proxyConnection.config.token,
    });
  }

  return {
    dispatcher: cachedDispatcher,
    request,
    transport: proxyConnection.transport,
  };
}

export async function resetYtToTextProxyDispatcher() {
  const dispatcher = cachedDispatcher;
  cachedProxyUrl = null;
  cachedDispatcher = undefined;
  didWarnIncompleteConfig = false;
  didWarnMissingUndici = false;
  cachedProxyAgentConstructor = undefined;
  cachedUndiciRequestFn = undefined;
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
