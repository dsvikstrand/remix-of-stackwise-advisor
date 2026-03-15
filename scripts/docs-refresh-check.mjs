#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const cwd = process.cwd();
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

const asJson = args.includes('--json');
const baseRef = getArg('--base');
const pathsArg = getArg('--paths');

function run(cmd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function readJson(relPath) {
  const abs = path.join(cwd, relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function pathExists(relPath) {
  return fs.existsSync(path.join(cwd, relPath));
}

function listMarkdownFiles(relDir) {
  const abs = path.join(cwd, relDir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => normalizePath(path.join(relDir, entry.name)))
    .sort();
}

function wildcardToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchesAny(file, patterns) {
  return patterns.some((p) => wildcardToRegExp(normalizePath(p)).test(file));
}

function getChangedFiles() {
  const changed = new Set();

  run('git diff --name-only').forEach((f) => changed.add(normalizePath(f)));
  run('git diff --name-only --cached').forEach((f) => changed.add(normalizePath(f)));
  run('git ls-files --others --exclude-standard').forEach((f) => changed.add(normalizePath(f)));

  if (baseRef) {
    run(`git diff --name-only ${baseRef}...HEAD`).forEach((f) => changed.add(normalizePath(f)));
  }

  return Array.from(changed).sort();
}

const configPath = 'docs/_freshness_map.json';
const cfg = readJson(configPath);
const changedFiles = pathsArg
  ? pathsArg
      .split(',')
      .map((p) => normalizePath(p.trim()))
      .filter(Boolean)
      .sort()
  : getChangedFiles();

const affectedDocs = new Set();
const suggestedSections = new Set();
const matchedRules = [];
const docAliases = cfg.doc_aliases ?? {};
const allowLegacyOnly = new Set((cfg.allow_legacy_only ?? []).map(normalizePath));

for (const rule of cfg.rules ?? []) {
  const matchedFiles = changedFiles.filter((f) => matchesAny(f, rule.paths ?? []));
  if (!matchedFiles.length) continue;
  matchedRules.push({ id: rule.id, matched_files: matchedFiles });
  for (const d of rule.required_docs ?? []) affectedDocs.add(normalizePath(d));
  for (const s of rule.suggested_sections ?? []) suggestedSections.add(s);
}

const changedDocsRaw = new Set(changedFiles.filter((f) => f.startsWith('docs/')));
const changedCanonicalDocs = new Set();
const legacyAliasWarnings = [];

for (const d of changedDocsRaw) {
  const canonical = docAliases[d];
  if (canonical) {
    if (!changedDocsRaw.has(canonical) && !allowLegacyOnly.has(d)) {
      legacyAliasWarnings.push({
        legacy_path: d,
        canonical_path: canonical,
        reason: 'legacy_changed_without_canonical_update',
      });
    }
    changedCanonicalDocs.add(canonical);
  } else {
    changedCanonicalDocs.add(d);
  }
}

const missingSet = new Set(Array.from(affectedDocs).filter((d) => !changedCanonicalDocs.has(d)));
for (const warn of legacyAliasWarnings) {
  missingSet.add(warn.canonical_path);
}
const missingUpdates = Array.from(missingSet).sort();
const activePlanRootFiles = listMarkdownFiles('docs/exec-plans/active');
const planStructureErrors = [];
const proofTailPath = 'docs/exec-plans/active/tail/mvp-launch-proof-tail.md';
const currentTruthDocGuardPaths = [
  '.env.example',
  'README.md',
  'docs/README.md',
  'docs/architecture.md',
  'docs/app/core-direction-lock.md',
  'docs/app/product-spec.md',
  'docs/ops/yt2bp_runbook.md',
  'docs/product-specs/index.md',
  'docs/product-specs/yt2bp_v0_contract.md',
];
const retiredRuntimeMarkers = [
  {
    id: 'legacy_source_page_generate_alias',
    needle: '/api/source-pages/:platform/:externalId/videos/generate',
    message: 'Retired source-page /videos/generate alias must not appear in current-truth docs or env surfaces.',
  },
  {
    id: 'legacy_yt2bp_tier_one_step_env',
    needle: 'YT2BP_TIER_ONE_STEP_',
    message: 'Retired YT2BP tier-one-step envs must not appear in current-truth docs or env surfaces.',
  },
  {
    id: 'legacy_generation_tier_dual_generate_env',
    needle: 'GENERATION_TIER_DUAL_GENERATE_',
    message: 'Retired dual-generate envs must not appear in current-truth docs or env surfaces.',
  },
  {
    id: 'legacy_yt_to_text_provider',
    needle: 'yt_to_text',
    message: 'Retired yt_to_text runtime/provider naming must not appear in current-truth docs or env surfaces.',
  },
];
const retiredRuntimeMarkerErrors = [];

for (const relPath of currentTruthDocGuardPaths) {
  const absPath = path.join(cwd, relPath);
  if (!fs.existsSync(absPath)) continue;
  const contents = fs.readFileSync(absPath, 'utf8');
  for (const marker of retiredRuntimeMarkers) {
    if (!contents.includes(marker.needle)) continue;
    retiredRuntimeMarkerErrors.push({
      rule: marker.id,
      file: relPath,
      needle: marker.needle,
      message: marker.message,
    });
  }
}

if (activePlanRootFiles.length > 1) {
  planStructureErrors.push({
    rule: 'active_exec_plan_root_max_one',
    message: 'docs/exec-plans/active/ root may contain at most one active implementation plan (.md file).',
    files: activePlanRootFiles,
  });
}

if (!pathExists(proofTailPath)) {
  planStructureErrors.push({
    rule: 'proof_tail_missing',
    message: `Expected proof-tail file at ${proofTailPath}.`,
    files: [],
  });
}

const hasErrors = (
  missingUpdates.length > 0
  || planStructureErrors.length > 0
  || retiredRuntimeMarkerErrors.length > 0
);

const output = {
  changed_files: changedFiles,
  affected_docs: Array.from(affectedDocs).sort(),
  missing_updates: missingUpdates,
  active_plan_root_files: activePlanRootFiles,
  active_plan_root_count: activePlanRootFiles.length,
  plan_structure_errors: planStructureErrors,
  retired_runtime_marker_errors: retiredRuntimeMarkerErrors,
  suggested_sections: Array.from(suggestedSections).sort(),
  matched_rules: matchedRules,
  legacy_alias_warnings: legacyAliasWarnings,
  status: hasErrors ? 'needs_update' : 'pass',
};

if (asJson) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log('Docs Refresh Check');
  console.log(`- status: ${output.status}`);
  console.log(`- changed_files: ${output.changed_files.length}`);
  console.log(`- affected_docs: ${output.affected_docs.length}`);
  console.log(`- missing_updates: ${output.missing_updates.length}`);
  console.log(`- active_plan_root_count: ${output.active_plan_root_count}`);
  if (output.missing_updates.length) {
    console.log('\nMissing updates:');
    output.missing_updates.forEach((d) => console.log(`- ${d}`));
  }
  if (output.plan_structure_errors.length) {
    console.log('\nPlan structure errors:');
    output.plan_structure_errors.forEach((err) => {
      console.log(`- ${err.rule}: ${err.message}`);
      err.files.forEach((file) => console.log(`  - ${file}`));
    });
  }
  if (output.retired_runtime_marker_errors.length) {
    console.log('\nRetired runtime marker errors:');
    output.retired_runtime_marker_errors.forEach((err) => {
      console.log(`- ${err.rule}: ${err.message}`);
      console.log(`  - file: ${err.file}`);
      console.log(`  - marker: ${err.needle}`);
    });
  }
  if (output.suggested_sections.length) {
    console.log('\nSuggested sections:');
    output.suggested_sections.forEach((s) => console.log(`- ${s}`));
  }
}

process.exit(output.status === 'pass' ? 0 : 2);
