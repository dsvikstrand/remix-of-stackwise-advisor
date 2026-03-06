import fs from 'node:fs';
import path from 'node:path';

let loaded = false;

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex <= 0) return null;
  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

export function loadPlaywrightLocalEnv() {
  if (loaded) return;
  loaded = true;
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (process.env[parsed.key] == null || process.env[parsed.key] === '') {
      process.env[parsed.key] = parsed.value;
    }
  }
}

export function requirePlaywrightEnv(keys: string[]) {
  const missing = keys.filter((key) => {
    const value = process.env[key];
    return value == null || String(value).trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(`Missing Playwright env keys: ${missing.join(', ')}`);
  }
}

export function getPlaywrightEnv(key: string) {
  const value = process.env[key];
  if (value == null || String(value).trim() === '') {
    throw new Error(`Missing required Playwright env key: ${key}`);
  }
  return value;
}
