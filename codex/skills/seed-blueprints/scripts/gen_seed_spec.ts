#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { loadPersonaV0, type PersonaV0 } from './lib/persona_v0';

function die(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function usage(): string {
  return [
    'gen_seed_spec.ts',
    '',
    'Generate a seed spec JSON deterministically (no LLM).',
    '',
    'Usage:',
    '  TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/gen_seed_spec.ts \\',
    '    --goal "Simple home skincare routine for beginners" \\',
    '    --persona skincare_diet_female_v0 \\',
    '    --blueprints 2 \\',
    '    --out seed/seed_spec_generated.local',
    '',
    'Flags:',
    '  --goal <text>         Required. High-level intent for what to build.',
    '  --persona <id>        Optional. Persona id under personas/v0.',
    '  --blueprints <n>      Optional. Number of blueprint variants (default: 2).',
    '  --out <path>          Optional. Output JSON path (default: seed/seed_spec_generated.local).',
    '  --run-id <id>         Optional. Spec run_id (default: gen-<timestamp>).',
    '  --help                Show help',
  ].join('\n');
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | number | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--goal') out.goal = argv[++i] ?? '';
    else if (a === '--persona') out.persona = argv[++i] ?? '';
    else if (a === '--blueprints') out.blueprints = Number(argv[++i] ?? 0);
    else if (a === '--out') out.out = argv[++i] ?? '';
    else if (a === '--run-id') out.runId = argv[++i] ?? '';
    else if (a.startsWith('--')) die(`Unknown flag: ${a}`);
  }
  return out;
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes()
  )}${pad(d.getUTCSeconds())}`;
}

function normalizeSlug(input: string) {
  return String(input || '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniq(list: string[]) {
  return Array.from(new Set(list.map((s) => String(s || '').trim()).filter(Boolean)));
}

function toTitleCase(input: string) {
  const cleaned = String(input || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function inferDomain(p: PersonaV0 | null, goal: string) {
  const t = `${(p?.safety?.domain || '').toLowerCase()} ${(p?.interests?.topics || []).join(' ').toLowerCase()} ${String(
    goal || ''
  ).toLowerCase()}`;
  if (t.includes('skincare')) return 'skincare';
  if (t.includes('fitness') || t.includes('workout') || t.includes('strength')) return 'fitness';
  if (t.includes('productivity') || t.includes('planning') || t.includes('focus')) return 'productivity';
  return 'general';
}

function buildLibrary(goal: string, p: PersonaV0 | null) {
  const domain = inferDomain(p, goal);
  const baseTitle = toTitleCase(goal).slice(0, 60).trim() || 'Seed Library';
  const title = baseTitle.toLowerCase().endsWith('library') ? baseTitle : `${baseTitle} Library`;

  const prefer = (p?.interests?.tags_prefer || []).map(normalizeSlug);
  const topics = (p?.interests?.topics || []).map(normalizeSlug);
  const tags = uniq([...prefer, ...topics]).filter(Boolean).slice(0, 8);

  const mustInclude = (p?.constraints?.must_include || []).map(String).filter(Boolean);
  const mustAvoid = (p?.constraints?.must_avoid || []).map(String).filter(Boolean);

  const notesParts: string[] = [];
  notesParts.push(`Goal: ${goal}`);
  if (domain === 'skincare') notesParts.push('Keep it gentle and beginner friendly. Avoid medical claims.');
  if (domain === 'fitness') notesParts.push('Prioritize safe form cues and realistic progression. Avoid maxing out advice.');
  if (domain === 'productivity') notesParts.push('Keep it low-friction, repeatable, and clear. Avoid extreme schedules.');
  if (mustInclude.length) notesParts.push(`Must include: ${mustInclude.join('; ')}`);
  if (mustAvoid.length) notesParts.push(`Avoid: ${mustAvoid.join('; ')}`);

  return {
    topic: goal,
    title,
    description: `A practical library of items to support: ${goal}.`,
    notes: notesParts.join(' '),
    tags,
  };
}

function buildBlueprintTemplates(domain: string) {
  if (domain === 'skincare') {
    return [
      {
        title: '10-Min Skincare Starter',
        description: 'A simple AM and PM routine that fits a busy schedule.',
        notes: 'Prefer fragrance-free options. Keep steps short and safe.',
        tags: ['skincare', 'beginner', 'routine'],
      },
      {
        title: 'Gentle Hydration Focus',
        description: 'A gentle routine focused on barrier support and hydration.',
        notes: 'Avoid strong actives until basics feel stable.',
        tags: ['hydration', 'sensitive-skin'],
      },
      {
        title: 'Weekly Reset Add-ons',
        description: 'Optional weekly steps you can add when you have time.',
        notes: 'Keep it conservative and skip anything irritating.',
        tags: ['self-care', 'weekly'],
      },
    ];
  }
  if (domain === 'fitness') {
    return [
      {
        title: 'Strength Basics (Full Body)',
        description: 'A safe, structured full-body routine built around compound movements.',
        notes: 'Focus on form cues and simple progression week to week.',
        tags: ['strength-training', 'compound-lifts'],
      },
      {
        title: 'Hypertrophy Focus (Simple Split)',
        description: 'A simple split that emphasizes volume and recovery.',
        notes: 'Pick a few key lifts and track small improvements.',
        tags: ['hypertrophy', 'progressive-overload'],
      },
      {
        title: 'Mobility and Recovery Day',
        description: 'A recovery-focused routine to support consistency.',
        notes: 'Keep intensity low and prioritize range of motion.',
        tags: ['mobility', 'recovery'],
      },
    ];
  }
  if (domain === 'productivity') {
    return [
      {
        title: 'Morning Focus Block',
        description: 'A short routine to start the day with clarity and momentum.',
        notes: 'Use simple defaults. Keep it under 20 minutes.',
        tags: ['productivity', 'morning', 'focus'],
      },
      {
        title: 'Daily Planning (5-Min)',
        description: 'A quick planning routine to reduce decision fatigue.',
        notes: 'Pick 1-3 priorities and schedule them.',
        tags: ['planning', 'time-blocking'],
      },
      {
        title: 'Deep Work Sprint',
        description: 'A routine designed for a focused work session.',
        notes: 'Remove distractions and define a clear done condition.',
        tags: ['deep-work', 'focus'],
      },
    ];
  }

  return [
    {
      title: 'Quick Starter',
      description: 'A short routine to get started and build consistency.',
      notes: 'Keep it practical and repeatable.',
      tags: ['starter', 'routine'],
    },
    {
      title: 'Consistency Plan',
      description: 'A routine designed to be repeated reliably.',
      notes: 'Prefer simple defaults and low friction.',
      tags: ['consistency'],
    },
    {
      title: 'Weekend Reset',
      description: 'Optional steps you can do when you have extra time.',
      notes: 'Keep it conservative and safe.',
      tags: ['weekly'],
    },
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage() + '\n');
    return;
  }

  const goal = String(args.goal || '').trim();
  if (!goal) die('Missing required flag: --goal "<text>"');

  const personaId = String(args.persona || '').trim();
  const p = personaId ? loadPersonaV0(personaId).persona : null;

  const blueprintCount = Math.max(1, Number(args.blueprints || 0) || 2);
  const outPath = String(args.out || 'seed/seed_spec_generated.local');
  const runId = String(args.runId || `gen-${nowStamp()}`).trim();

  const library = buildLibrary(goal, p);
  const domain = inferDomain(p, goal);
  const templates = buildBlueprintTemplates(domain);
  const blueprints = Array.from({ length: blueprintCount }).map((_, i) => {
    const t = templates[i % templates.length]!;
    return {
      title: t.title,
      description: t.description,
      notes: t.notes,
      tags: uniq([...(library.tags || []), ...(t.tags || [])]).filter(Boolean).slice(0, 10),
    };
  });

  const spec = {
    run_id: runId,
    ...(personaId ? { asp: { id: personaId } } : {}),
    library,
    blueprints,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n', 'utf-8');
  process.stdout.write(`Wrote ${outPath}\n`);
}

main().catch((e) => {
  const err = e instanceof Error ? e : new Error(String(e));
  die(err.message);
});

