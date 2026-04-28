#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');

function fail(message) {
  throw new Error(message);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${label} is not valid JSON: ${message}`);
  }
}

function requireFile(relativePath, label) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) fail(`${label} is missing: ${relativePath}`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) fail(`${label} is not a file: ${relativePath}`);
  if (stat.size <= 0) fail(`${label} is empty: ${relativePath}`);
  return { filePath, size: stat.size };
}

function requireDirectory(relativePath, label) {
  const dirPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(dirPath)) fail(`${label} is missing: ${relativePath}`);
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) fail(`${label} is not a directory: ${relativePath}`);
  return dirPath;
}

function verifyFrontend() {
  requireDirectory('dist', 'Release dist directory');
  const index = requireFile('dist/index.html', 'Frontend entrypoint');
  const html = fs.readFileSync(index.filePath, 'utf8');
  if (!/<script[^>]+src="\/assets\//.test(html) && !/<script[^>]+src="\.\/assets\//.test(html)) {
    fail('Frontend entrypoint does not reference a built assets script.');
  }

  const assetsDir = requireDirectory('dist/assets', 'Frontend assets directory');
  const assetFiles = fs.readdirSync(assetsDir).filter((name) => fs.statSync(path.join(assetsDir, name)).isFile());
  if (!assetFiles.some((name) => name.endsWith('.js'))) fail('Frontend assets directory has no JavaScript bundle.');
  if (!assetFiles.some((name) => name.endsWith('.css'))) fail('Frontend assets directory has no CSS bundle.');
}

function verifyServer() {
  const artifact = requireFile('dist/server/index.mjs', 'Server runtime artifact');
  const check = spawnSync(process.execPath, ['--check', artifact.filePath], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (check.status !== 0) {
    const output = [check.stdout, check.stderr].filter(Boolean).join('\n').trim();
    fail(`Server runtime artifact failed syntax validation: ${output}`);
  }
}

function verifyMetadata() {
  const { filePath } = requireFile('dist/release.json', 'Release metadata');
  const metadata = readJson(filePath, 'Release metadata');
  if (!metadata || typeof metadata !== 'object') fail('Release metadata must be an object.');
  if (typeof metadata.release_sha !== 'string' || !metadata.release_sha.trim()) {
    fail('Release metadata is missing release_sha.');
  }
  if (typeof metadata.built_at !== 'string' || Number.isNaN(Date.parse(metadata.built_at))) {
    fail('Release metadata has invalid built_at.');
  }
  if (typeof metadata.backend_url !== 'string' || !metadata.backend_url.trim()) {
    fail('Release metadata is missing backend_url.');
  }
}

function verifyNodeRuntime() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isInteger(major) || major < 20) {
    fail(`Node 20+ is required to verify release artifacts; detected ${process.versions.node}.`);
  }
}

function main() {
  if (!fs.existsSync(distDir)) fail('dist directory is missing. Run npm run build:release first.');
  verifyNodeRuntime();
  verifyFrontend();
  verifyServer();
  verifyMetadata();
  console.log('Release artifact verification passed.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
