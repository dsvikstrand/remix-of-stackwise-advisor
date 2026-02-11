import fs from 'node:fs';
import path from 'node:path';

import type { EvalBoundsV0 } from './types';

type FileInfo = { path: string; hash: string; version: number };

export type LoadedBoundsAssetsV0 = {
  bounds: EvalBoundsV0;
  files: {
    inventory: FileInfo;
    blueprints: FileInfo;
    prompt_pack: FileInfo;
    control_pack: FileInfo;
  };
  hash: string;
};

export function loadBoundsAssetsV0(opts: {
  baseDir: string;
  readRawFile: (p: string) => string;
  sha256Hex: (raw: string) => string;
}): LoadedBoundsAssetsV0 {
  const baseDir = String(opts.baseDir || '').trim();
  if (!baseDir) throw new Error('bounds baseDir is empty');
  if (!fs.existsSync(baseDir)) throw new Error(`bounds baseDir not found: ${baseDir}`);

  // Prefer "library" naming; keep legacy "inventory" fallback for compatibility.
  const pLib = path.join(baseDir, 'library', 'bounds_v0.json');
  const pInvLegacy = path.join(baseDir, 'inventory', 'bounds_v0.json');
  const pBp = path.join(baseDir, 'blueprints', 'bounds_v0.json');
  const pPrompt = path.join(baseDir, 'prompt_pack', 'bounds_v0.json');
  const pCtrl = path.join(baseDir, 'control_pack', 'bounds_v0.json');

  const readJson = (p: string) => {
    if (!fs.existsSync(p)) throw new Error(`bounds file not found: ${p}`);
    const raw = opts.readRawFile(p);
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`bounds file is not valid JSON: ${p}`);
    }
    const version = Number(json?.version || 0);
    if (version !== 0) throw new Error(`bounds version must be 0: ${p}`);
    const hash = opts.sha256Hex(raw);
    return { json, info: { path: p, hash, version } as FileInfo };
  };

  const invPath = fs.existsSync(pLib) ? pLib : pInvLegacy;
  const inv = readJson(invPath);
  const bp = readJson(pBp);
  const prompt = readJson(pPrompt);
  const ctrl = readJson(pCtrl);

  // Simple aggregate hash so run logs can treat bounds as one immutable config input.
  const aggRaw = [inv.info.hash, bp.info.hash, prompt.info.hash, ctrl.info.hash].join('\n');
  const aggHash = opts.sha256Hex(aggRaw);

  const bounds: EvalBoundsV0 = {
    version: 0,
    inventory: inv.json,
    blueprints: bp.json,
    prompt_pack: prompt.json,
    control_pack: ctrl.json,
  } as any;

  return {
    bounds,
    files: {
      inventory: inv.info,
      blueprints: bp.info,
      prompt_pack: prompt.info,
      control_pack: ctrl.info,
    },
    hash: aggHash,
  };
}
