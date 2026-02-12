#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
let failed = false;

function fail(msg) {
  failed = true;
  console.error(`[normalize-check] FAIL: ${msg}`);
}

function ok(msg) {
  console.log(`[normalize-check] OK: ${msg}`);
}

function readJson(rel) {
  const abs = path.join(repoRoot, rel);
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    fail(`${rel} invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

const rubricFiles = [
  'eval/domain_assets/v0/fitness/rubric_v0.json',
  'eval/domain_assets/v0/skincare/rubric_v0.json',
];

for (const rel of rubricFiles) {
  const j = readJson(rel);
  if (!j) continue;
  const hasLibrary = typeof j.library === 'object' && j.library !== null;
  const hasInventory = typeof j.inventory === 'object' && j.inventory !== null;
  if (!hasLibrary) fail(`${rel} missing canonical key 'library'`);
  if (!hasInventory) fail(`${rel} missing legacy compatibility key 'inventory'`);
  if (hasLibrary && hasInventory) {
    const a = JSON.stringify(j.library);
    const b = JSON.stringify(j.inventory);
    if (a !== b) fail(`${rel} library/inventory content drift detected`);
  }
}
if (!failed) ok('rubric canonical+legacy alias checks passed');

const builtinsRel = 'codex/skills/seed-blueprints/scripts/lib/eval/classes/builtins.ts';
const builtins = fs.readFileSync(path.join(repoRoot, builtinsRel), 'utf8');
if (!builtins.includes('rubric?.library || rubric?.inventory || {}')) {
  fail(`${builtinsRel} missing runtime alias resolution for library/inventory rubric keys`);
} else {
  ok('runtime alias resolution exists in builtins');
}

const policyDocs = [
  'docs/ass_das/seed_ass_spec.md',
  'docs/app/product-spec.md',
  'docs/schemas/ass_eval_config_schema.md',
  'docs/schemas/eval_scorecard_schema.md',
];
for (const rel of policyDocs) {
  if (!fs.existsSync(path.join(repoRoot, rel))) {
    fail(`missing policy doc ${rel}`);
  }
}
if (!failed) ok('core policy docs present');

if (failed) {
  console.error('[normalize-check] RESULT: FAILED');
  process.exit(1);
}
console.log('[normalize-check] RESULT: PASSED');
