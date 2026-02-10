import fs from 'node:fs';
import path from 'node:path';

const DOMAIN_ROOT_REL = path.join('eval', 'domain_assets', 'v0');

function normalizeDomainId(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

function isSafeDomainId(id: string): boolean {
  // Keep it strict to avoid surprising paths.
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id);
}

function normalizeRelPath(raw: unknown): string {
  const s = String(raw || '').trim().replace(/\\/g, '/');
  // Disallow absolute and traversal. We keep this simple and strict.
  if (!s || s.startsWith('/') || s.includes('..')) throw new Error('invalid_rel_path');
  return s;
}

export function resolveDomainDir(domainIdRaw: unknown): { domainId: string; absDir: string; relDir: string } {
  const domainId = normalizeDomainId(domainIdRaw);
  if (!domainId || !isSafeDomainId(domainId)) throw new Error('invalid_domain_id');
  const absDir = path.resolve(process.cwd(), DOMAIN_ROOT_REL, domainId);
  const relDir = path.relative(process.cwd(), absDir).replace(/\\/g, '/');
  return { domainId, absDir, relDir };
}

export function domainExists(domainIdRaw: unknown): boolean {
  try {
    const { absDir } = resolveDomainDir(domainIdRaw);
    return fs.existsSync(absDir) && fs.statSync(absDir).isDirectory();
  } catch {
    return false;
  }
}

export function resolveDomainAsset(domainIdRaw: unknown, relPathRaw: unknown): { absPath: string; relPath: string } {
  const { absDir } = resolveDomainDir(domainIdRaw);
  const rel = normalizeRelPath(relPathRaw);
  const absPath = path.resolve(absDir, rel);
  const absDirWithSep = absDir.endsWith(path.sep) ? absDir : absDir + path.sep;
  if (!absPath.startsWith(absDirWithSep)) throw new Error('path_escape');
  const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, '/');
  return { absPath, relPath };
}
