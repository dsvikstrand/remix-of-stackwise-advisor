#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsRoot = path.join(root, 'docs');
const errors = [];

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

function isLocalLink(link) {
  if (!link) return false;
  if (link.startsWith('http://') || link.startsWith('https://') || link.startsWith('mailto:') || link.startsWith('#')) {
    return false;
  }
  // Absolute route-like refs are not filesystem docs links.
  if (link.startsWith('/') && !link.startsWith('/docs/')) {
    return false;
  }
  return true;
}

function stripFragment(link) {
  return link.split('#')[0];
}

function resolveLink(fileAbs, link) {
  const clean = stripFragment(link).trim();
  if (!clean) return null;
  if (clean.startsWith('/')) return path.join(root, clean.slice(1));
  return path.resolve(path.dirname(fileAbs), clean);
}

function checkPathExists(sourceFile, target, rawRef) {
  if (!target) return;
  if (!fs.existsSync(target)) {
    errors.push({
      source: path.relative(root, sourceFile),
      ref: rawRef,
      resolved: path.relative(root, target),
    });
  }
}

const docFiles = walk(docsRoot).filter((f) => /\.(md|mmd)$/i.test(f));

for (const file of docFiles) {
  const text = fs.readFileSync(file, 'utf8');

  // Markdown links: [label](target)
  const mdLinkRe = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const m of text.matchAll(mdLinkRe)) {
    const ref = (m[1] || '').trim();
    if (!isLocalLink(ref)) continue;
    checkPathExists(file, resolveLink(file, ref), ref);
  }

  // Backtick docs refs: `docs/...`
  const docTickRe = /`(docs\/[^`]+)`/g;
  for (const m of text.matchAll(docTickRe)) {
    const ref = (m[1] || '').trim();
    if (!ref) continue;
    checkPathExists(file, path.join(root, ref), ref);
  }

  // Backtick local refs: `./x.md` or `../x.md`
  const localTickRe = /`(\.\.?\/[^`]+)`/g;
  for (const m of text.matchAll(localTickRe)) {
    const ref = (m[1] || '').trim();
    if (!ref) continue;
    checkPathExists(file, resolveLink(file, ref), ref);
  }
}

if (errors.length) {
  console.error('Docs link check FAILED');
  for (const e of errors) {
    console.error(`- ${e.source}: '${e.ref}' -> '${e.resolved}' (missing)`);
  }
  process.exit(1);
}

console.log('Docs link check PASSED');
