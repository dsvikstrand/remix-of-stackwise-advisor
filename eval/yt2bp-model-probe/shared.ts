import fs from 'node:fs';
import path from 'node:path';

export interface ProbeCase {
  case_id: string;
  video_id: string;
  video_url: string;
  video_title: string;
  transcript_source: string;
  transcript_chars: number;
  updated_at: string;
  transcript: string;
}

export interface ProbeCaseFile {
  generated_at: string;
  source: string;
  cases: ProbeCase[];
}

export function readDotEnv(filePath = '.env') {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

export function getEnvValue(dotEnv: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const runtimeValue = String(process.env[key] || '').trim();
    if (runtimeValue) return runtimeValue;
    const dotValue = String(dotEnv[key] || '').trim();
    if (dotValue) return dotValue;
  }
  return '';
}

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function sanitizeFilePart(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}
