import fs from 'node:fs';
import path from 'node:path';

let didLoadEnv = false;

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

export function loadProjectEnv() {
  if (didLoadEnv) return;
  didLoadEnv = true;

  const root = process.cwd();
  loadEnvFileIfPresent(path.join(root, '.env'));
  loadEnvFileIfPresent(path.join(root, '.env.production'));
}

loadProjectEnv();
