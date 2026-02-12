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

const output = {
  changed_files: changedFiles,
  affected_docs: Array.from(affectedDocs).sort(),
  missing_updates: missingUpdates,
  suggested_sections: Array.from(suggestedSections).sort(),
  matched_rules: matchedRules,
  legacy_alias_warnings: legacyAliasWarnings,
  status: missingUpdates.length ? 'needs_update' : 'pass',
};

if (asJson) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log('Docs Refresh Check');
  console.log(`- status: ${output.status}`);
  console.log(`- changed_files: ${output.changed_files.length}`);
  console.log(`- affected_docs: ${output.affected_docs.length}`);
  console.log(`- missing_updates: ${output.missing_updates.length}`);
  if (output.missing_updates.length) {
    console.log('\nMissing updates:');
    output.missing_updates.forEach((d) => console.log(`- ${d}`));
  }
  if (output.suggested_sections.length) {
    console.log('\nSuggested sections:');
    output.suggested_sections.forEach((s) => console.log(`- ${s}`));
  }
}

process.exit(output.status === 'pass' ? 0 : 2);
