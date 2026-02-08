#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { loadPersonaV0, isSafeId, validatePersonaV0 } from './lib/persona_v0';

function die(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function usage(): string {
  return [
    'persona_registry.ts',
    '',
    'Usage:',
    '  TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/persona_registry.ts --list',
    '  TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/persona_registry.ts --validate',
    '  TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/persona_registry.ts --show <persona_id>',
    '',
    'Flags:',
    '  --base-dir <path>   Repo base dir (default: cwd)',
    '  --list              List persona ids',
    '  --validate          Validate all personas under personas/v0',
    '  --show <id>         Print hashes + applied prompt block for a persona',
    '  --help              Show help',
  ].join('\n');
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--base-dir') out.baseDir = argv[++i] ?? '';
    else if (a === '--list') out.list = true;
    else if (a === '--validate') out.validate = true;
    else if (a === '--show') out.show = argv[++i] ?? '';
    else if (a.startsWith('--')) die(`Unknown flag: ${a}`);
  }
  return out;
}

function listPersonaIds(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((id) => isSafeId(id))
    .sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.list && !args.validate && !args.show)) {
    process.stdout.write(usage() + '\n');
    return;
  }

  const baseDir = String(args.baseDir || process.cwd());
  const personasDir = path.join(baseDir, 'personas', 'v0');
  const ids = listPersonaIds(personasDir);

  if (args.list) {
    for (const id of ids) {
      try {
        const p = loadPersonaV0(id, { baseDir }).persona;
        const topics = (p.interests?.topics || []).map(String).filter(Boolean).slice(0, 3);
        process.stdout.write(`${id}\t${p.display_name}${topics.length ? `\t(${topics.join(', ')})` : ''}\n`);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        process.stdout.write(`${id}\tERROR\t${err.message}\n`);
      }
    }
    return;
  }

  if (args.show) {
    const id = String(args.show || '').trim();
    if (!id) die('Missing --show <persona_id>');
    const loaded = loadPersonaV0(id, { baseDir });
    process.stdout.write(`persona_id: ${loaded.id}\n`);
    process.stdout.write(`persona_path: ${path.relative(baseDir, loaded.personaPath).replace(/\\\\/g, '/')}\n`);
    process.stdout.write(`persona_hash: ${loaded.personaHash}\n`);
    process.stdout.write(`prompt_hash: ${loaded.promptHash}\n`);
    process.stdout.write('\n');
    process.stdout.write(loaded.promptBlock + '\n');
    return;
  }

  if (args.validate) {
    if (!fs.existsSync(personasDir)) die(`Personas dir not found: ${personasDir}`);
    let bad = 0;
    for (const id of ids) {
      const personaPath = path.join(personasDir, `${id}.json`);
      try {
        const raw = fs.readFileSync(personaPath, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        const errs = validatePersonaV0(parsed, id);
        if (errs.length) {
          bad += 1;
          process.stdout.write(`${id}\tINVALID\t${errs.join('; ')}\n`);
          continue;
        }
        // Full load (hashes + prompt block)
        loadPersonaV0(id, { baseDir });
        process.stdout.write(`${id}\tOK\n`);
      } catch (e) {
        bad += 1;
        const err = e instanceof Error ? e : new Error(String(e));
        process.stdout.write(`${id}\tERROR\t${err.message}\n`);
      }
    }
    if (bad > 0) process.exit(2);
    return;
  }
}

main().catch((e) => {
  const err = e instanceof Error ? e : new Error(String(e));
  die(err.message);
});

