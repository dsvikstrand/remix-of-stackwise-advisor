#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = argv.slice(2);
  const read = (flag, fallback = '') => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() : fallback;
  };

  return {
    outDir: read('--out-dir', 'dist'),
    releaseSha: read('--release-sha', String(process.env.GITHUB_SHA || '').trim()),
    backendUrl: read('--backend-url', String(process.env.VITE_AGENTIC_BACKEND_URL || '').trim()),
  };
}

function ensureArg(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }
}

function main() {
  const { outDir, releaseSha, backendUrl } = parseArgs(process.argv);

  ensureArg(outDir, '--out-dir');
  ensureArg(releaseSha, '--release-sha');
  ensureArg(backendUrl, '--backend-url');

  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, 'release.json');
  const payload = {
    release_sha: releaseSha,
    built_at: new Date().toISOString(),
    backend_url: backendUrl,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
}

main();
