import fs from 'node:fs';
import path from 'node:path';

let didLoadEnv = false;

export function shouldLoadProjectEnv(env: NodeJS.ProcessEnv = process.env) {
  return String(env.INVOCATION_ID || '').trim() === '';
}

export function loadEnvFileIfPresent(filePath: string, env: NodeJS.ProcessEnv = process.env) {
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
    if (!Object.prototype.hasOwnProperty.call(env, key)) env[key] = value;
  });
}

export function loadProjectEnv(input: { root?: string; env?: NodeJS.ProcessEnv } = {}) {
  if (didLoadEnv) return;
  didLoadEnv = true;

  const env = input.env || process.env;
  if (!shouldLoadProjectEnv(env)) return;

  const root = input.root || process.cwd();
  loadEnvFileIfPresent(path.join(root, '.env'), env);
}

export function resetProjectEnvLoaderForTests() {
  didLoadEnv = false;
}

loadProjectEnv();
