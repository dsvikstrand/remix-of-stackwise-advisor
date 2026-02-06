#!/usr/bin/env node
/**
 * Stage 0 LAS runner: read seed spec -> call agentic backend -> write JSON artifacts only.
 *
 * No Supabase writes should be performed in Stage 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type SeedSpec = {
  run_id: string;
  library: {
    topic: string;
    title: string;
    description: string;
    notes?: string;
    tags?: string[];
  };
  blueprints: Array<{
    title: string;
    description?: string;
    notes?: string;
    tags?: string[];
  }>;
};

type InventorySchema = {
  summary?: string;
  categories: Array<{
    name: string;
    items: string[];
  }>;
};

type GeneratedBlueprint = {
  title: string;
  steps: Array<{
    title: string;
    description: string;
    items: Array<{
      category: string;
      name: string;
      context?: string;
    }>;
  }>;
};

type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    blueprintCount: number;
    stepCountTotal: number;
    itemRefsTotal: number;
  };
};

type RunLog = {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  config: {
    specPath: string;
    outDir: string;
    agenticBaseUrl: string;
    backendCalls: boolean;
  };
  steps: Array<{
    name: string;
    startedAt: string;
    finishedAt?: string;
    ok: boolean;
    detail?: string;
    error?: { message: string; stack?: string };
  }>;
};

function nowIso() {
  return new Date().toISOString();
}

function die(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--spec') out.spec = argv[++i] ?? '';
    else if (a === '--out') out.out = argv[++i] ?? '';
    else if (a === '--agentic-base-url') out.agenticBaseUrl = argv[++i] ?? '';
    else if (a === '--run-id') out.runId = argv[++i] ?? '';
    else if (a === '--no-backend') out.noBackend = true;
    else if (a.startsWith('--')) die(`Unknown flag: ${a}`);
  }
  return out;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function writeJsonFile(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function sanitizeRunId(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

async function postJson<T>(
  url: string,
  token: string,
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; status: number; text: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, text };
  }

  const data = (await res.json()) as T;
  return { ok: true, data };
}

function validateSeedSpec(spec: SeedSpec): string[] {
  const errors: string[] = [];
  if (!spec || typeof spec !== 'object') return ['Spec must be a JSON object'];
  if (!spec.run_id || !spec.run_id.trim()) errors.push('run_id is required');
  if (!spec.library?.topic?.trim()) errors.push('library.topic is required');
  if (!spec.library?.title?.trim()) errors.push('library.title is required');
  if (!spec.blueprints || !Array.isArray(spec.blueprints) || spec.blueprints.length === 0) {
    errors.push('blueprints[] must be a non-empty array');
  } else {
    spec.blueprints.forEach((bp, i) => {
      if (!bp?.title?.trim()) errors.push(`blueprints[${i}].title is required`);
    });
  }
  return errors;
}

function buildLibraryIndex(inventory: InventorySchema) {
  const map = new Map<string, Set<string>>();
  for (const c of inventory.categories || []) {
    const name = (c.name || '').trim();
    if (!name) continue;
    const set = new Set((c.items || []).map((x) => (x || '').trim()).filter(Boolean));
    map.set(name, set);
  }
  return map;
}

function validateBlueprints(inventory: InventorySchema, blueprints: GeneratedBlueprint[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const index = buildLibraryIndex(inventory);
  let stepCountTotal = 0;
  let itemRefsTotal = 0;

  if (!inventory.categories || inventory.categories.length === 0) {
    errors.push('Inventory has no categories');
  }

  blueprints.forEach((bp, bpi) => {
    if (!bp.title?.trim()) errors.push(`blueprints[${bpi}] missing title`);
    if (!bp.steps || bp.steps.length === 0) errors.push(`blueprints[${bpi}] has no steps`);
    if ((bp.steps || []).length > 0 && bp.steps.length < 3) {
      warnings.push(`blueprints[${bpi}] has only ${bp.steps.length} steps (min recommended is 5)`);
    }

    (bp.steps || []).forEach((s, si) => {
      stepCountTotal += 1;
      if (!s.title?.trim()) warnings.push(`blueprints[${bpi}].steps[${si}] missing title`);
      if (!s.description?.trim()) warnings.push(`blueprints[${bpi}].steps[${si}] missing description`);
      if (!s.items || s.items.length === 0) errors.push(`blueprints[${bpi}].steps[${si}] has no items`);

      (s.items || []).forEach((it, ii) => {
        itemRefsTotal += 1;
        const cat = (it.category || '').trim();
        const name = (it.name || '').trim();
        if (!cat || !name) {
          errors.push(`blueprints[${bpi}].steps[${si}].items[${ii}] missing category or name`);
          return;
        }
        const allowed = index.get(cat);
        if (!allowed) {
          errors.push(`blueprints[${bpi}].steps[${si}].items[${ii}] category not in library: "${cat}"`);
          return;
        }
        if (!allowed.has(name)) {
          errors.push(
            `blueprints[${bpi}].steps[${si}].items[${ii}] item not in library: "${cat}" -> "${name}"`
          );
        }
      });
    });
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      blueprintCount: blueprints.length,
      stepCountTotal,
      itemRefsTotal,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      [
        'seed_stage0.ts',
        '',
        'Usage:',
        '  tsx codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json',
        '',
        'Flags:',
        '  --spec <path>              Seed spec JSON path (default: seed/seed_spec_v0.json)',
        '  --out <dir>                Output base dir (default: seed/outputs)',
        '  --agentic-base-url <url>   Agentic backend base URL (default: env VITE_AGENTIC_BACKEND_URL or https://bapi.vdsai.cloud)',
        '  --run-id <id>              Override run_id folder name',
        '  --no-backend               Do not call backend (future use)',
      ].join('\n') + '\n'
    );
    return;
  }

  const specPath = String(args.spec || 'seed/seed_spec_v0.json');
  const outBase = String(args.out || 'seed/outputs');
  const agenticBaseUrl =
    String(args.agenticBaseUrl || process.env.VITE_AGENTIC_BACKEND_URL || 'https://bapi.vdsai.cloud').replace(/\/$/, '');
  const backendCalls = !args.noBackend;

  if (!fs.existsSync(specPath)) die(`Spec not found: ${specPath}`);

  const spec = readJsonFile<SeedSpec>(specPath);
  const specErrors = validateSeedSpec(spec);
  if (specErrors.length) die(`Invalid spec:\n- ${specErrors.join('\n- ')}`);

  const runId = sanitizeRunId(String(args.runId || spec.run_id || 'run')) || crypto.randomUUID();
  const runDir = path.join(outBase, runId);
  ensureDir(runDir);

  const runLog: RunLog = {
    runId,
    startedAt: nowIso(),
    config: {
      specPath,
      outDir: runDir,
      agenticBaseUrl,
      backendCalls,
    },
    steps: [],
  };

  const step = async <T>(name: string, fn: () => Promise<T>) => {
    const entry = { name, startedAt: nowIso(), ok: false as boolean } as RunLog['steps'][number];
    runLog.steps.push(entry);
    try {
      const result = await fn();
      entry.ok = true;
      entry.finishedAt = nowIso();
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      entry.ok = false;
      entry.finishedAt = nowIso();
      entry.error = { message: err.message, stack: err.stack };
      throw err;
    } finally {
      writeJsonFile(path.join(runDir, 'run_log.json'), { ...runLog, finishedAt: nowIso() });
    }
  };

  // Stage 0 "behave as a user": call backend endpoints using a real user access token.
  const accessToken = process.env.SEED_USER_ACCESS_TOKEN?.trim() || '';
  if (backendCalls && !accessToken) {
    die('Missing SEED_USER_ACCESS_TOKEN. Set it in your shell before running Stage 0.');
  }

  const inventory = await step('generate_library', async () => {
    if (!backendCalls) throw new Error('Backend calls disabled (no-backend not implemented in Stage 0)');
    const url = `${agenticBaseUrl}/api/generate-inventory`;
    const body = {
      keywords: spec.library.topic,
      title: spec.library.title,
      customInstructions: spec.library.notes || '',
    };
    const res = await postJson<InventorySchema>(url, accessToken, body);
    if (!res.ok) {
      throw new Error(`generate-inventory failed (${res.status}): ${res.text.slice(0, 500)}`);
    }
    writeJsonFile(path.join(runDir, 'library.json'), {
      ...spec.library,
      generated: res.data,
    });
    return res.data;
  });

  const generatedBlueprints = await step('generate_blueprints', async () => {
    if (!backendCalls) throw new Error('Backend calls disabled (no-backend not implemented in Stage 0)');
    const url = `${agenticBaseUrl}/api/generate-blueprint`;
    const categories = (inventory.categories || []).map((c) => ({ name: c.name, items: c.items }));

    const results: Array<{
      spec: SeedSpec['blueprints'][number];
      generated: GeneratedBlueprint;
    }> = [];

    for (const bp of spec.blueprints) {
      const body = {
        title: bp.title,
        description: bp.description || '',
        notes: bp.notes || '',
        inventoryTitle: spec.library.title,
        categories,
      };
      const res = await postJson<GeneratedBlueprint>(url, accessToken, body);
      if (!res.ok) {
        throw new Error(`generate-blueprint failed (${res.status}): ${res.text.slice(0, 500)}`);
      }
      results.push({ spec: bp, generated: res.data });
    }

    writeJsonFile(path.join(runDir, 'blueprints.json'), {
      libraryTitle: spec.library.title,
      blueprints: results,
    });
    return results.map((r) => r.generated);
  });

  await step('generate_review_requests', async () => {
    // Stage 0: do not call review endpoint (cost + credits). Produce payloads only.
    const payloads = generatedBlueprints.map((bp) => {
      const selectedItems: Record<string, Array<string | { name: string; context?: string }>> = {};
      for (const step of bp.steps || []) {
        for (const it of step.items || []) {
          const cat = (it.category || '').trim();
          const name = (it.name || '').trim();
          if (!cat || !name) continue;
          const list = selectedItems[cat] || [];
          list.push(it.context ? { name, context: it.context } : name);
          selectedItems[cat] = list;
        }
      }

      return {
        title: bp.title,
        inventoryTitle: spec.library.title,
        selectedItems,
        mixNotes: spec.library.notes || '',
        reviewPrompt: '',
        reviewSections: [],
        includeScore: true,
      };
    });
    writeJsonFile(path.join(runDir, 'review_requests.json'), payloads);
    return { count: payloads.length };
  });

  await step('generate_banner_requests', async () => {
    // Stage 0: do not call banner endpoint (would upload to Storage). Produce payloads only.
    const payloads = generatedBlueprints.map((bp, idx) => {
      const variantTags = spec.blueprints[idx]?.tags || [];
      const combined = [...(spec.library.tags || []), ...variantTags]
        .map((t) => String(t || '').trim())
        .filter(Boolean);
      const uniq = Array.from(new Set(combined));
      return {
        title: bp.title,
        inventoryTitle: spec.library.title,
        tags: uniq,
      };
    });
    writeJsonFile(path.join(runDir, 'banner_requests.json'), payloads);
    return { count: payloads.length };
  });

  const validation = await step('validate', async () => {
    const result = validateBlueprints(inventory, generatedBlueprints);
    writeJsonFile(path.join(runDir, 'validation.json'), result);
    return result;
  });

  await step('publish_payload', async () => {
    const payload = {
      run_id: runId,
      library: spec.library,
      inventory: inventory,
      blueprints: generatedBlueprints,
      notes: 'Stage 0 only: no DB writes. Stage 1 will translate this payload into Supabase inserts.',
    };
    writeJsonFile(path.join(runDir, 'publish_payload.json'), payload);
    return { ok: validation.ok };
  });

  runLog.finishedAt = nowIso();
  writeJsonFile(path.join(runDir, 'run_log.json'), runLog);
  process.stdout.write(`Stage 0 complete. Output: ${runDir}\n`);
}

main().catch((e) => {
  const err = e instanceof Error ? e : new Error(String(e));
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
