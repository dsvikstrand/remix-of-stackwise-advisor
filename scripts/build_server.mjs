#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const rootDir = process.cwd();
const entryPoint = path.join(rootDir, 'server', 'index.ts');
const outFile = path.join(rootDir, 'dist', 'server', 'index.mjs');

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} is missing: ${path.relative(rootDir, filePath)}`);
  }
}

async function main() {
  assertFileExists(entryPoint, 'Server entrypoint');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  await build({
    entryPoints: [entryPoint],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node20'],
    packages: 'external',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'info',
  });

  const stat = fs.statSync(outFile);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`Server build produced an empty artifact: ${path.relative(rootDir, outFile)}`);
  }

  console.log(`Built ${path.relative(rootDir, outFile)} (${stat.size} bytes)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
