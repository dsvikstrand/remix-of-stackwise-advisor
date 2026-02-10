#!/usr/bin/env node
/**
 * Stage 0 LAS runner: read seed spec -> call agentic backend -> write JSON artifacts only.
 *
 * No Supabase writes should be performed in Stage 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadPersonaV0, type PersonaV0 } from './lib/persona_v0';
import { composePromptPackV0, type PromptPackV0 } from './lib/prompt_pack_v0';
import { composeControlPackV0, renderControlPackToPromptPackV0, type ControlPackV0 } from './lib/control_pack_v0';

type AspProfile = {
  id: string;
  display_name?: string;
  bio?: string;
  interests?: string[];
  tone?: string;
  must_include?: string[];
  must_avoid?: string[];
};

type SeedSpec = {
  run_id: string;
  asp?: AspProfile;
  run_type?: 'seed' | 'library_only' | 'blueprint_only';
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

type ReviewPayload = {
  title: string;
  inventoryTitle: string;
  selectedItems: Record<string, Array<string | { name: string; context?: string }>>;
  mixNotes?: string;
  reviewPrompt?: string;
  reviewSections?: string[];
  includeScore?: boolean;
};

type BannerPayload = {
  title: string;
  inventoryTitle: string;
  tags: string[];
  dryRun?: boolean;
};

type DasNodeId =
  | 'AUTH_READ'
  | 'CONTROL_PACK'
  | 'PROMPT_PACK'
  | 'LIB_GEN'
  | 'BP_GEN'
  | 'VAL'
  | 'AI_REVIEW'
  | 'AI_BANNER'
  | 'APPLY';

type DasGateSeverity = 'info' | 'warn' | 'hard_fail';

type DasPolicy = {
  enabled?: boolean;
  kCandidates?: number;
  maxAttempts?: number;
  eval?: string[];
  onHardFail?: 'stop_run' | 'continue';
  params?: Record<string, unknown>;
};

type DasConfig = {
  version: number;
  notes?: string[];
  defaults?: DasPolicy;
  nodes?: Record<string, DasPolicy>;
  testOnly?: {
    enabled?: boolean;
    failOnce?: {
      nodes?: string[];
      failOnAttempt?: number;
    };
  };
};

type ResolvedDasPolicy = Required<Pick<DasPolicy, 'enabled' | 'kCandidates' | 'maxAttempts' | 'eval' | 'onHardFail'>> & {
  params: Record<string, unknown>;
};

type DasGateResult = {
  gate_id: string;
  ok: boolean;
  severity: DasGateSeverity;
  score: number;
  reason: string;
  data?: Record<string, unknown>;
};

type DasCandidateResult = {
  attempt: number;
  candidate: number;
  ok: boolean;
  score: number;
  gates: DasGateResult[];
  file?: string;
  skipped?: boolean;
  error?: string;
};

type DasNodeDecision = {
  nodeId: DasNodeId;
  policy: ResolvedDasPolicy;
  attempts: Array<{
    attempt: number;
    candidates: DasCandidateResult[];
    selectedCandidate?: number;
    status: 'selected' | 'retry' | 'hard_fail' | 'exhausted' | 'disabled';
  }>;
  selected?: { attempt: number; candidate: number; score: number; file: string };
};

type DasDecisionLog = {
  version: 1;
  runId: string;
  createdAt: string;
  config: {
    enabled: boolean;
    configPath?: string;
    configHash?: string;
  };
  nodes: Record<string, DasNodeDecision>;
};

type DasSelection = {
  version: 1;
  runId: string;
  createdAt: string;
  selected: Record<string, { attempt: number; candidate: number; score: number; file: string }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SeedAuthStore = {
  access_token?: string;
  refresh_token?: string;
  updated_at?: string;
};

type SeedCreds = {
  email: string;
  password: string;
};

function decodeBase64Url(input: string) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  return Buffer.from(base64 + pad, 'base64').toString('utf8');
}

function getJwtExp(accessToken: string): number | null {
  const parts = accessToken.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = decodeBase64Url(parts[1] || '');
    const payload = JSON.parse(payloadJson) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function isJwtExpired(accessToken: string, skewSeconds = 60): boolean {
  const exp = getJwtExp(accessToken);
  if (!exp) return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return exp <= nowSec + skewSeconds;
}

function getJwtSub(accessToken: string): string {
  const parts = accessToken.split('.');
  if (parts.length < 2) return '';
  try {
    const payloadJson = decodeBase64Url(parts[1] || '');
    const payload = JSON.parse(payloadJson) as { sub?: string };
    return typeof payload.sub === 'string' ? payload.sub : '';
  } catch {
    return '';
  }
}

function normalizeSlug(tag: string) {
  return String(tag || '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqStrings(list: string[]) {
  return Array.from(new Set(list.map((s) => String(s || '').trim()).filter(Boolean)));
}

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
    applyStage1?: boolean;
    dasEnabled?: boolean;
    dasConfigPath?: string;
    dasConfigHash?: string;
    limitBlueprints?: number;
    composeControls?: boolean;
    controlPackHash?: string;
    composePrompts?: boolean;
    promptPackHash?: string;
    aspId?: string;
    personaHash?: string;
    runContextHash?: string;
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

function sha256Hex(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildRunContextHash(
  spec: SeedSpec,
  personaMeta?: { id: string; persona_hash: string; prompt_hash: string } | null
) {
  const payload = {
    asp: spec.asp
      ? {
          id: String(spec.asp.id || '').trim(),
          interests: (spec.asp.interests || []).map((s) => String(s || '').trim()).filter(Boolean),
          tone: String(spec.asp.tone || '').trim(),
          must_include: (spec.asp.must_include || []).map((s) => String(s || '').trim()).filter(Boolean),
          must_avoid: (spec.asp.must_avoid || []).map((s) => String(s || '').trim()).filter(Boolean),
        }
      : null,
    persona: personaMeta
      ? {
          id: String(personaMeta.id || '').trim(),
          persona_hash: String(personaMeta.persona_hash || '').trim(),
          prompt_hash: String(personaMeta.prompt_hash || '').trim(),
        }
      : null,
    library: {
      topic: String(spec.library?.topic || '').trim(),
      title: String(spec.library?.title || '').trim(),
      tags: (spec.library?.tags || []).map((s) => String(s || '').trim()).filter(Boolean),
      notes: String(spec.library?.notes || '').trim(),
    },
    blueprints: (spec.blueprints || []).map((bp) => ({
      title: String(bp?.title || '').trim(),
      tags: (bp?.tags || []).map((s) => String(s || '').trim()).filter(Boolean),
      notes: String(bp?.notes || '').trim(),
    })),
  };
  return sha256Hex(JSON.stringify(payload));
}

function die(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean | number> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--spec') out.spec = argv[++i] ?? '';
    else if (a === '--out') out.out = argv[++i] ?? '';
    else if (a === '--agentic-base-url') out.agenticBaseUrl = argv[++i] ?? '';
    else if (a === '--run-id') out.runId = argv[++i] ?? '';
    else if (a === '--run-type') out.runType = argv[++i] ?? '';
    else if (a === '--asp') out.asp = argv[++i] ?? '';
    else if (a === '--library-json') out.libraryJson = argv[++i] ?? '';
    else if (a === '--auth-store') out.authStore = argv[++i] ?? '';
    else if (a === '--auth-env') out.authEnv = argv[++i] ?? '';
    else if (a === '--persona-registry') out.personaRegistry = argv[++i] ?? '';
    else if (a === '--no-backend') out.noBackend = true;
    else if (a === '--auth-only') out.authOnly = true;
    else if (a === '--do-review') out.doReview = true;
    else if (a === '--review-focus') out.reviewFocus = argv[++i] ?? '';
    else if (a === '--do-banner') out.doBanner = true;
    else if (a === '--compose-controls') out.composeControls = true;
    else if (a === '--compose-prompts') out.composePrompts = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--das') out.das = true;
    else if (a === '--das-config') out.dasConfig = argv[++i] ?? '';
    else if (a === '--yes') out.yes = argv[++i] ?? '';
    else if (a === '--limit-blueprints') out.limitBlueprints = Number(argv[++i] ?? 0);
    else if (a.startsWith('--')) die(`Unknown flag: ${a}`);
  }
  return out;
}

type PersonaRegistryV0 = {
  version: 0;
  description?: string;
  personas: Array<{
    id: string;
    auth_creds_slot?: number;
    auth_env_path?: string;
    auth_store_path?: string;
    controls_defaults?: {
      library?: {
        domain?: string;
        domain_custom?: string;
        audience?: string;
        style?: string;
        strictness?: string;
        length_hint?: string;
      };
      blueprints?: {
        focus?: string;
        focus_custom?: string;
        length?: string;
        strictness?: string;
        variety?: string;
        caution?: string;
      };
    };
  }>;
};

function loadPersonaRegistryV0(registryPath: string): PersonaRegistryV0 | null {
  const p = String(registryPath || '').trim();
  if (!p) return null;
  if (!fs.existsSync(p)) return null;
  try {
    const data = readJsonFile<PersonaRegistryV0>(p);
    if (!data || (data as any).version !== 0 || !Array.isArray((data as any).personas)) return null;
    return data;
  } catch {
    return null;
  }
}

function resolvePersonaAuthDefaults(params: {
  aspId: string;
  personaRegistryPath: string;
}): { authEnvPath: string; authStorePath: string; source: 'registry' | 'default' } {
  const aspId = String(params.aspId || '').trim();
  const defaultAuthEnv = aspId ? path.join('seed', 'auth', `${aspId}.env.local`) : '';
  const defaultAuthStore = aspId ? path.join('seed', 'auth', `${aspId}.local`) : path.join('seed', 'seed_auth.local');

  const reg = loadPersonaRegistryV0(params.personaRegistryPath);
  if (aspId && reg) {
    const entry = reg.personas.find((p) => String(p.id || '').trim() === aspId);
    if (entry) {
      const envPath = String(entry.auth_env_path || '').trim() || defaultAuthEnv;
      const storePath = String(entry.auth_store_path || '').trim() || defaultAuthStore;
      return { authEnvPath: envPath, authStorePath: storePath, source: 'registry' };
    }
  }

  return { authEnvPath: defaultAuthEnv, authStorePath: defaultAuthStore, source: 'default' };
}

function resolvePersonaRegistryEntry(params: {
  aspId: string;
  personaRegistryPath: string;
}): PersonaRegistryV0['personas'][number] | null {
  const aspId = String(params.aspId || '').trim();
  if (!aspId) return null;
  const reg = loadPersonaRegistryV0(params.personaRegistryPath);
  if (!reg) return null;
  const entry = reg.personas.find((p) => String(p.id || '').trim() === aspId);
  return entry || null;
}

function applyControlDefaultsFromRegistry(pack: ControlPackV0, entry: PersonaRegistryV0['personas'][number] | null) {
  const defaults = entry?.controls_defaults;
  if (!defaults) return;

  // Library controls
  const lib = defaults.library || {};
  (pack as any).library = (pack as any).library || {};
  (pack as any).library.controls = (pack as any).library.controls || {};
  const libControls = (pack as any).library.controls;

  const setIf = (k: string, v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) (libControls as any)[k] = s;
  };

  setIf('domain', lib.domain);
  if (String(lib.domain || '').trim()) {
    if (String(lib.domain || '').trim() === 'custom') {
      setIf('domain_custom', lib.domain_custom);
    } else {
      delete (libControls as any).domain_custom;
    }
  }
  setIf('audience', lib.audience);
  setIf('style', lib.style);
  setIf('strictness', lib.strictness);
  setIf('length_hint', lib.length_hint);

  // Blueprint controls applied to all blueprints (v0).
  const bp = defaults.blueprints || {};
  const bps = Array.isArray((pack as any).blueprints) ? (pack as any).blueprints : [];
  for (const b of bps) {
    (b as any).controls = (b as any).controls || {};
    const c = (b as any).controls;
    const setBpIf = (k: string, v: unknown) => {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s) c[k] = s;
    };
    // focus is optional; if omitted we keep the template-derived focus.
    if (String(bp.focus || '').trim()) {
      setBpIf('focus', bp.focus);
      if (String(bp.focus || '').trim() === 'custom') setBpIf('focus_custom', bp.focus_custom);
      if (String(bp.focus || '').trim() !== 'custom') delete c.focus_custom;
    }
    setBpIf('length', bp.length);
    setBpIf('strictness', bp.strictness);
    setBpIf('variety', bp.variety);
    setBpIf('caution', bp.caution);
  }
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function readRawFile(filePath: string) {
  return fs.readFileSync(filePath, 'utf-8');
}

function joinPromptParts(parts: string[]) {
  return parts.map((s) => String(s || '').trim()).filter(Boolean).join('\n\n');
}

function normalizePolicy(p: DasPolicy | undefined): Required<Pick<DasPolicy, 'enabled' | 'kCandidates' | 'maxAttempts' | 'eval' | 'onHardFail'>> {
  return {
    enabled: p?.enabled !== undefined ? !!p.enabled : true,
    kCandidates: Math.max(1, Number(p?.kCandidates || 1) || 1),
    maxAttempts: Math.max(1, Number(p?.maxAttempts || 1) || 1),
    eval: Array.isArray(p?.eval) ? p!.eval!.map((x) => String(x || '').trim()).filter(Boolean) : [],
    onHardFail: p?.onHardFail === 'continue' ? 'continue' : 'stop_run',
  };
}

function readDasConfig(filePath: string): DasConfig {
  const raw = readRawFile(filePath);
  const parsed = JSON.parse(raw) as DasConfig;
  if (!parsed || typeof parsed !== 'object') throw new Error('DAS config must be a JSON object');
  if (Number((parsed as any).version || 0) !== 1) throw new Error('DAS config version must be 1');
  return parsed;
}

function getDasPolicy(cfg: DasConfig, nodeId: DasNodeId) {
  const defaults = (cfg.defaults || {}) as DasPolicy;
  const node = ((cfg.nodes || {})[nodeId] || {}) as DasPolicy;

  const enabled =
    node.enabled !== undefined ? !!node.enabled : defaults.enabled !== undefined ? !!defaults.enabled : true;

  const kCandidatesRaw = node.kCandidates !== undefined ? node.kCandidates : defaults.kCandidates;
  const maxAttemptsRaw = node.maxAttempts !== undefined ? node.maxAttempts : defaults.maxAttempts;
  const kCandidates = Math.max(1, Number(kCandidatesRaw || 1) || 1);
  const maxAttempts = Math.max(1, Number(maxAttemptsRaw || 1) || 1);

  const evalListRaw = Array.isArray(node.eval) ? node.eval : Array.isArray(defaults.eval) ? defaults.eval : [];
  const evalList = evalListRaw.map((x) => String(x || '').trim()).filter(Boolean);

  const onHardFailRaw = node.onHardFail !== undefined ? node.onHardFail : defaults.onHardFail;
  const onHardFail = onHardFailRaw === 'continue' ? 'continue' : 'stop_run';

  const isPlainObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  const defaultsParams = isPlainObject(defaults.params) ? defaults.params : {};
  const nodeParams = isPlainObject(node.params) ? node.params : {};
  const params: Record<string, unknown> = { ...defaultsParams, ...nodeParams };

  return {
    enabled,
    kCandidates,
    maxAttempts,
    eval: evalList,
    onHardFail,
    params,
  };
}

function gate(
  gateId: string,
  ok: boolean,
  severity: DasGateSeverity,
  score: number,
  reason: string,
  data?: Record<string, unknown>
): DasGateResult {
  return { gate_id: gateId, ok, severity, score, reason, ...(data ? { data } : {}) };
}

function evalStructuralInventory(inv: InventorySchema): DasGateResult {
  const cats = Array.isArray(inv?.categories) ? inv.categories : [];
  if (cats.length === 0) return gate('structural', false, 'warn', 0, 'no_categories', { categoryCount: 0 });
  const empty = cats.filter((c) => !(c.items || []).length).length;
  if (empty > 0)
    return gate('structural', false, 'warn', 0, 'empty_categories', { categoryCount: cats.length, emptyCategoryCount: empty });
  return gate('structural', true, 'info', 1, 'ok', { categoryCount: cats.length });
}

function evalBoundsInventory(inv: InventorySchema): DasGateResult {
  const cats = Array.isArray(inv?.categories) ? inv.categories : [];
  const limits = {
    maxCategories: 30,
    maxCategoryNameLen: 80,
    maxItemsPerCategory: 80,
    maxItemNameLen: 80,
  };
  if (cats.length > limits.maxCategories) {
    return gate('bounds', false, 'warn', 0, 'too_many_categories', {
      categoryCount: cats.length,
      maxCategories: limits.maxCategories,
    });
  }
  for (const c of cats) {
    const name = String(c?.name || '');
    if (name.length > limits.maxCategoryNameLen) {
      return gate('bounds', false, 'warn', 0, 'category_name_too_long', {
        categoryNameLen: name.length,
        maxCategoryNameLen: limits.maxCategoryNameLen,
      });
    }
    const items = Array.isArray(c?.items) ? c.items : [];
    if (items.length > limits.maxItemsPerCategory) {
      return gate('bounds', false, 'warn', 0, 'too_many_items_in_category', {
        itemCount: items.length,
        maxItemsPerCategory: limits.maxItemsPerCategory,
      });
    }
    for (const it of items) {
      const itNameLen = String(it || '').length;
      if (itNameLen > limits.maxItemNameLen) {
        return gate('bounds', false, 'warn', 0, 'item_name_too_long', {
          itemNameLen: itNameLen,
          maxItemNameLen: limits.maxItemNameLen,
        });
      }
    }
  }
  return gate('bounds', true, 'info', 1, 'ok', limits);
}

function evalStructuralBlueprints(blueprints: GeneratedBlueprint[]): DasGateResult {
  if (!Array.isArray(blueprints) || blueprints.length === 0)
    return gate('structural', false, 'warn', 0, 'no_blueprints', { blueprintCount: 0 });
  for (const bp of blueprints) {
    if (!String(bp?.title || '').trim())
      return gate('structural', false, 'warn', 0, 'missing_blueprint_title');
    if (!Array.isArray(bp?.steps) || bp.steps.length === 0)
      return gate('structural', false, 'warn', 0, 'blueprint_has_no_steps', { title: String(bp?.title || '') });
    for (const st of bp.steps || []) {
      if (!Array.isArray(st?.items) || st.items.length === 0)
        return gate('structural', false, 'warn', 0, 'step_has_no_items', { stepTitle: String(st?.title || '') });
    }
  }
  return gate('structural', true, 'info', 1, 'ok', { blueprintCount: blueprints.length });
}

function evalBoundsBlueprints(blueprints: GeneratedBlueprint[]): DasGateResult {
  const limits = {
    maxSteps: 20,
    maxStepTitleLen: 120,
    maxStepDescriptionLen: 800,
    maxItemsPerStep: 40,
  };
  for (const bp of blueprints || []) {
    if ((bp.steps || []).length > limits.maxSteps) {
      return gate('bounds', false, 'warn', 0, 'too_many_steps', { stepCount: (bp.steps || []).length, maxSteps: limits.maxSteps });
    }
    for (const st of bp.steps || []) {
      const titleLen = String(st?.title || '').length;
      if (titleLen > limits.maxStepTitleLen) {
        return gate('bounds', false, 'warn', 0, 'step_title_too_long', { titleLen, maxStepTitleLen: limits.maxStepTitleLen });
      }
      const descLen = String(st?.description || '').length;
      if (descLen > limits.maxStepDescriptionLen) {
        return gate('bounds', false, 'warn', 0, 'step_description_too_long', {
          descLen,
          maxStepDescriptionLen: limits.maxStepDescriptionLen,
        });
      }
      if ((st.items || []).length > limits.maxItemsPerStep) {
        return gate('bounds', false, 'warn', 0, 'too_many_items_in_step', {
          itemCount: (st.items || []).length,
          maxItemsPerStep: limits.maxItemsPerStep,
        });
      }
    }
  }
  return gate('bounds', true, 'info', 1, 'ok', limits);
}

function evalStructuralPromptPack(pack: PromptPackV0): DasGateResult {
  const goal = String(pack?.goal || '').trim();
  if (!goal) return gate('structural', false, 'warn', 0, 'missing_goal');

  const lib = pack?.library as any;
  if (!lib || !String(lib.topic || '').trim()) return gate('structural', false, 'warn', 0, 'missing_library_topic');
  if (!String(lib.title || '').trim()) return gate('structural', false, 'warn', 0, 'missing_library_title');

  const bps = Array.isArray(pack?.blueprints) ? pack.blueprints : [];
  if (bps.length === 0) return gate('structural', false, 'warn', 0, 'no_blueprints', { blueprintCount: 0 });
  for (const bp of bps) {
    if (!String(bp?.title || '').trim()) return gate('structural', false, 'warn', 0, 'missing_blueprint_title');
  }
  return gate('structural', true, 'info', 1, 'ok', { blueprintCount: bps.length });
}

function evalBoundsPromptPack(pack: PromptPackV0): DasGateResult {
  const limits = {
    maxGoalLen: 200,
    maxTitleLen: 80,
    maxDescriptionLen: 240,
    maxNotesLen: 1200,
    maxTags: 12,
    maxTagLen: 40,
    maxBlueprints: 8,
  };

  const goal = String(pack?.goal || '');
  if (goal.length > limits.maxGoalLen) return gate('bounds', false, 'warn', 0, 'goal_too_long', limits);

  const lib = pack?.library;
  const libTitleLen = String(lib?.title || '').length;
  if (libTitleLen > limits.maxTitleLen) return gate('bounds', false, 'warn', 0, 'library_title_too_long', limits);
  const libDescLen = String(lib?.description || '').length;
  if (libDescLen > limits.maxDescriptionLen) return gate('bounds', false, 'warn', 0, 'library_description_too_long', limits);
  const libNotesLen = String(lib?.notes || '').length;
  if (libNotesLen > limits.maxNotesLen) return gate('bounds', false, 'warn', 0, 'library_notes_too_long', limits);

  const bps = Array.isArray(pack?.blueprints) ? pack.blueprints : [];
  if (bps.length > limits.maxBlueprints) return gate('bounds', false, 'warn', 0, 'too_many_blueprints', limits);
  for (const bp of bps) {
    const tLen = String(bp?.title || '').length;
    if (tLen > limits.maxTitleLen) return gate('bounds', false, 'warn', 0, 'blueprint_title_too_long', limits);
    const dLen = String(bp?.description || '').length;
    if (dLen > limits.maxDescriptionLen) return gate('bounds', false, 'warn', 0, 'blueprint_description_too_long', limits);
    const nLen = String(bp?.notes || '').length;
    if (nLen > limits.maxNotesLen) return gate('bounds', false, 'warn', 0, 'blueprint_notes_too_long', limits);
    const tags = (bp?.tags || []).map((x) => String(x || '')).filter(Boolean);
    if (tags.length > limits.maxTags) return gate('bounds', false, 'warn', 0, 'too_many_tags', limits);
    for (const tag of tags) {
      if (String(tag).length > limits.maxTagLen) return gate('bounds', false, 'warn', 0, 'tag_too_long', limits);
    }
  }

  return gate('bounds', true, 'info', 1, 'ok', limits);
}

function evalPersonaAlignmentPromptPack(persona: PersonaV0 | null, pack: PromptPackV0, params?: Record<string, unknown>): DasGateResult {
  if (!persona) return gate('persona_alignment_v0', true, 'info', 0, 'no_persona', { skipped: true });

  const minTagOverlapRatioRaw = (params || ({} as any)).minTagOverlapRatio;
  const minTagOverlapRatio =
    minTagOverlapRatioRaw === undefined || minTagOverlapRatioRaw === null ? 0.25 : Math.max(0, Number(minTagOverlapRatioRaw) || 0);
  // In v0 we treat persona "avoid tags" as a hard fail signal, but we do NOT treat
  // persona.must_avoid phrases as violations at the prompt-pack stage (they are instructions).
  const hardFailOnMustAvoid = (params || ({} as any)).hardFailOnMustAvoid !== false;

  const personaTags = uniqStrings([
    ...((persona.interests?.topics || []) as string[]),
    ...((persona.interests?.tags_prefer || []) as string[]),
  ])
    .map(normalizeSlug)
    .filter(Boolean);
  const personaTagSet = new Set(personaTags);

  const avoidTags = uniqStrings([...(persona.interests?.tags_avoid || [])]).map(normalizeSlug).filter(Boolean);
  const mustInclude = uniqStrings([...(persona.constraints?.must_include || [])]).map((s) => String(s).toLowerCase());
  const mustAvoid = uniqStrings([...(persona.constraints?.must_avoid || [])]).map((s) => String(s).toLowerCase());

  const packTags = uniqStrings([
    ...((pack.library?.tags || []) as string[]),
    ...(pack.blueprints || []).flatMap((bp) => (bp?.tags || []) as string[]),
  ])
    .map(normalizeSlug)
    .filter(Boolean);
  const packTagSet = new Set(packTags);

  let overlapCount = 0;
  for (const t of packTagSet) if (personaTagSet.has(t)) overlapCount += 1;
  const overlapRatio = overlapCount / Math.max(1, packTagSet.size);

  const blob = [
    pack.goal,
    pack.library?.topic,
    pack.library?.title,
    pack.library?.description,
    pack.library?.notes,
    ...(pack.blueprints || []).flatMap((bp) => [bp?.title, bp?.description, bp?.notes]),
    ...packTags,
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const mustIncludeHits = mustInclude.filter((t) => t && blob.includes(t));
  const avoidTagHits = avoidTags.filter((t) => t && packTagSet.has(t));
  const mustAvoidInstructionHits = mustAvoid.filter((t) => t && blob.includes(t));

  const data = {
    persona_id: persona.id,
    minTagOverlapRatio,
    hardFailOnMustAvoid,
    pack_tag_count: packTagSet.size,
    persona_tag_count: personaTagSet.size,
    overlap_count: overlapCount,
    overlap_ratio: overlapRatio,
    must_include_total: mustInclude.length,
    must_include_hits: mustIncludeHits.length,
    avoid_tags_total: avoidTags.length,
    avoid_tags_hits: avoidTagHits.length,
    must_avoid_instructions_total: mustAvoid.length,
    must_avoid_instructions_hits: mustAvoidInstructionHits.length,
    hit_terms: {
      must_include: mustIncludeHits.slice(0, 8),
      avoid_tags: avoidTagHits.slice(0, 8),
      must_avoid_instructions: mustAvoidInstructionHits.slice(0, 8),
    },
  };

  if (hardFailOnMustAvoid && avoidTagHits.length > 0) {
    return gate('persona_alignment_v0', false, 'hard_fail', 0, 'avoid_tag_hit', data);
  }

  if (overlapRatio < minTagOverlapRatio) {
    return gate('persona_alignment_v0', false, 'hard_fail', overlapRatio, 'low_tag_overlap', data);
  }

  if (mustInclude.length && mustIncludeHits.length < mustInclude.length) {
    return gate('persona_alignment_v0', true, 'warn', overlapRatio, 'ok_missing_must_include', data);
  }

  return gate('persona_alignment_v0', true, 'info', overlapRatio, 'ok', data);
}

function writeJsonFile(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function writeTextFile(filePath: string, text: string) {
  fs.writeFileSync(filePath, text.endsWith('\n') ? text : text + '\n', 'utf-8');
}

function readAuthStore(filePath: string): SeedAuthStore {
  if (!filePath || !fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as SeedAuthStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAuthStore(filePath: string, store: SeedAuthStore) {
  if (!filePath) return;
  // Auth stores may live under seed/auth/*.local; ensure the directory exists.
  ensureDir(path.dirname(filePath));
  const out: SeedAuthStore = {
    access_token: store.access_token || '',
    refresh_token: store.refresh_token || '',
    updated_at: nowIso(),
  };
  writeJsonFile(filePath, out);
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  const raw = fs.readFileSync(filePath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function loadSeedCredsFromEnvFile(filePath: string) {
  const vars = readEnvFile(filePath);
  // Per-persona auth env files must override any existing process env values,
  // otherwise sequential runs (skincare then strength) will accidentally share creds.
  if (vars.SEED_USER_EMAIL) process.env.SEED_USER_EMAIL = vars.SEED_USER_EMAIL;
  if (vars.SEED_USER_PASSWORD) process.env.SEED_USER_PASSWORD = vars.SEED_USER_PASSWORD;
}

function getSeedCredsFromEnv(): SeedCreds | null {
  const email = String(process.env.SEED_USER_EMAIL || '').trim();
  const password = String(process.env.SEED_USER_PASSWORD || '').trim();
  if (!email || !password) return null;
  return { email, password };
}

function isRefreshTokenAlreadyUsedError(err: unknown) {
  const msg = String((err as any)?.message || err || '');
  return msg.includes('refresh_token_already_used') || msg.includes('Already Used');
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

function evalStructuralControlPack(pack: ControlPackV0): DasGateResult {
  if (Number(pack?.version) !== 0) return gate('structural', false, 'warn', 0, 'bad_version');
  const goal = String(pack?.goal || '').trim();
  if (!goal) return gate('structural', false, 'warn', 0, 'missing_goal');
  const lib = pack?.library as any;
  if (!lib || !lib.controls) return gate('structural', false, 'warn', 0, 'missing_library_controls');
  const bps = Array.isArray(pack?.blueprints) ? pack.blueprints : [];
  if (!bps.length) return gate('structural', false, 'warn', 0, 'no_blueprints', { blueprintCount: 0 });
  for (const bp of bps) {
    if (!bp || !bp.controls || !String(bp.controls.focus || '').trim()) return gate('structural', false, 'warn', 0, 'missing_blueprint_focus');
  }
  return gate('structural', true, 'info', 1, 'ok', { blueprintCount: bps.length });
}

function evalBoundsControlPack(pack: ControlPackV0): DasGateResult {
  const limits = {
    maxGoalLen: 200,
    maxNameLen: 80,
    maxNotesLen: 1200,
    maxTags: 12,
    maxTagLen: 40,
    maxBlueprints: 8,
  };
  const goal = String(pack?.goal || '');
  if (goal.length > limits.maxGoalLen) return gate('bounds', false, 'warn', 0, 'goal_too_long', limits);
  const libNameLen = String(pack?.library?.name || '').length;
  if (libNameLen > limits.maxNameLen) return gate('bounds', false, 'warn', 0, 'library_name_too_long', limits);
  const libNotesLen = String(pack?.library?.notes || '').length;
  if (libNotesLen > limits.maxNotesLen) return gate('bounds', false, 'warn', 0, 'library_notes_too_long', limits);
  const libTags = ((pack?.library?.tags || []) as any[]).map((x) => String(x || '')).filter(Boolean);
  if (libTags.length > limits.maxTags) return gate('bounds', false, 'warn', 0, 'too_many_library_tags', limits);
  for (const tag of libTags) if (String(tag).length > limits.maxTagLen) return gate('bounds', false, 'warn', 0, 'library_tag_too_long', limits);

  const bps = Array.isArray(pack?.blueprints) ? pack.blueprints : [];
  if (bps.length > limits.maxBlueprints) return gate('bounds', false, 'warn', 0, 'too_many_blueprints', limits);
  for (const bp of bps) {
    const nameLen = String(bp?.name || '').length;
    if (nameLen > limits.maxNameLen) return gate('bounds', false, 'warn', 0, 'blueprint_name_too_long', limits);
    const notesLen = String(bp?.notes || '').length;
    if (notesLen > limits.maxNotesLen) return gate('bounds', false, 'warn', 0, 'blueprint_notes_too_long', limits);
    const tags = ((bp?.tags || []) as any[]).map((x) => String(x || '')).filter(Boolean);
    if (tags.length > limits.maxTags) return gate('bounds', false, 'warn', 0, 'too_many_blueprint_tags', limits);
    for (const tag of tags) if (String(tag).length > limits.maxTagLen) return gate('bounds', false, 'warn', 0, 'blueprint_tag_too_long', limits);
  }
  return gate('bounds', true, 'info', 1, 'ok', limits);
}

function evalPersonaAlignmentControlPack(
  persona: PersonaV0 | null,
  pack: ControlPackV0,
  params?: Record<string, unknown>
): DasGateResult {
  if (!persona) return gate('persona_alignment_v0', true, 'info', 0, 'no_persona', { skipped: true });

  const expectedDomain = String(persona?.safety?.domain || '').trim();
  const domain = String((pack as any)?.library?.controls?.domain || '').trim();
  const domainCustom = String((pack as any)?.library?.controls?.domain_custom || '').trim();
  const allowCustomDomain = (params || ({} as any)).allowCustomDomain === true;

  const data = {
    persona_id: persona.id,
    expected_domain: expectedDomain || null,
    domain: domain || null,
    domain_custom: domainCustom || null,
    allowCustomDomain,
  };

  // v0: domain mismatch is a hard fail. This is deterministic and cheap, and
  // gives us a stable retry demo before we add richer quality evaluation.
  if (expectedDomain) {
    if (domain === expectedDomain) return gate('persona_alignment_v0', true, 'info', 1, 'ok', data);
    if (domain === 'custom' && allowCustomDomain) return gate('persona_alignment_v0', true, 'warn', 0.5, 'ok_custom_domain', data);
    return gate('persona_alignment_v0', false, 'hard_fail', 0, 'domain_mismatch', data);
  }

  // Missing expected domain should not block v0 runs.
  return gate('persona_alignment_v0', true, 'warn', 0.25, 'missing_expected_domain', data);
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

async function postSseText(
  url: string,
  token: string,
  body: unknown
): Promise<{ ok: true; text: string } | { ok: false; status: number; text: string }> {
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

  const raw = await res.text().catch(() => '');
  let out = '';
  type SseFrame = {
    choices?: Array<{
      delta?: { content?: string };
    }>;
  };
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.replace(/^data:\s*/, '');
    if (!payload) continue;
    if (payload === '[DONE]') break;
    try {
      const frame = JSON.parse(payload) as SseFrame;
      const delta = frame.choices?.[0]?.delta?.content;
      if (typeof delta === 'string') out += delta;
    } catch {
      // ignore malformed frames
    }
  }
  return { ok: true, text: out };
}

function validateSeedSpec(spec: SeedSpec): string[] {
  const errors: string[] = [];
  if (!spec || typeof spec !== 'object') return ['Spec must be a JSON object'];
  if (!spec.run_id || !spec.run_id.trim()) errors.push('run_id is required');
  if (spec.asp && !String(spec.asp.id || '').trim()) errors.push('asp.id is required when asp is provided');
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

function buildReviewPayload(spec: SeedSpec, bp: GeneratedBlueprint): ReviewPayload {
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
}

function buildBannerPayload(spec: SeedSpec, bp: GeneratedBlueprint, idx: number): BannerPayload {
  const variantTags = spec.blueprints[idx]?.tags || [];
  const combined = [...(spec.library.tags || []), ...variantTags]
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  const uniq = Array.from(new Set(combined));
  return {
    title: bp.title,
    inventoryTitle: spec.library.title,
    tags: uniq,
    dryRun: true,
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
        '  npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json',
        '',
        'Flags:',
        '  --spec <path>              Seed spec JSON path (default: seed/seed_spec_v0.json)',
        '  --out <dir>                Output base dir (default: seed/outputs)',
        '  --agentic-base-url <url>   Agentic backend base URL (default: env VITE_AGENTIC_BACKEND_URL or https://bapi.vdsai.cloud)',
        '  --run-id <id>              Override run_id folder name',
        '  --run-type <type>          Run type: seed | library_only | blueprint_only (default: seed; can also be set in spec.run_type)',
        '  --asp <id>                 Override persona id (sets asp.id) without editing the spec JSON',
        '  --library-json <path>      Input library.json (required for run-type blueprint_only)',
        '  --auth-store <path>        Optional local JSON store for rotating tokens (recommended: seed/seed_auth.local)',
        '  --auth-env <path>          Optional env file that sets SEED_USER_EMAIL/SEED_USER_PASSWORD (recommended: seed/auth/<asp_id>.env.local)',
        '  --persona-registry <path>  Optional persona registry JSON (default: seed/persona_registry_v0.json)',
        '  --no-backend               Do not call backend (future use)',
        '  --auth-only                Only authenticate and write auth metadata (no agentic backend calls)',
        '  --do-review                Execute /api/analyze-blueprint (Stage 0.5)',
        '  --review-focus <text>      Optional reviewPrompt for /api/analyze-blueprint',
        '  --do-banner                Execute /api/generate-banner in dryRun mode (Stage 0.5; no Storage upload)',
        '  --compose-controls         Compose promptless controls (click/press config) and render to prompt pack',
        '  --compose-prompts          Compose user-like prompts from persona + goal (writes requests/prompt_pack.json)',
        '  --apply                    Stage 1 apply mode (writes to Supabase)',
        '  --das                      Enable DAS v1 (dynamic gates, retries, select-best; uses das config)',
        '  --das-config <path>        DAS config JSON path (default: seed/das_config_v1.json)',
        '  --yes <token>              Stage 1 guard token (must be APPLY_STAGE1)',
        '  --limit-blueprints <n>     Limit generated/apply blueprints to N (useful for testing Stage 1)',
      ].join('\n') + '\n'
    );
    return;
  }

  const specPath = String(args.spec || 'seed/seed_spec_v0.json');
  const outBase = String(args.out || 'seed/outputs');
  let authStorePath = String(args.authStore || '').trim();
  const authEnvPathArg = String((args as any).authEnv || '').trim();
  const personaRegistryPath = String((args as any).personaRegistry || 'seed/persona_registry_v0.json').trim();
  const agenticBaseUrl =
    String(args.agenticBaseUrl || process.env.VITE_AGENTIC_BACKEND_URL || 'https://bapi.vdsai.cloud').replace(/\/$/, '');
  const backendCalls = !args.noBackend;
  const doReview = !!args.doReview;
  const doBanner = !!args.doBanner;
  const composeControls = !!args.composeControls;
  const composePrompts = !!args.composePrompts;
  const reviewFocus = String(args.reviewFocus || '').trim();
  const dasEnabled = Boolean(args.das || args.dasConfig);
  const dasConfigPath = String(args.dasConfig || 'seed/das_config_v1.json');
  const authOnly = Boolean((args as any).authOnly);

  if (!fs.existsSync(specPath)) die(`Spec not found: ${specPath}`);

  const spec = readJsonFile<SeedSpec>(specPath);
  const specErrors = validateSeedSpec(spec);
  if (specErrors.length) die(`Invalid spec:\n- ${specErrors.join('\n- ')}`);

  // specRun is the "effective" spec for this run. It may be overridden by prompt composition.
  let specRun: SeedSpec = spec;

  // Effective persona id can be overridden via --asp without editing the spec JSON.
  const aspId = String((args as any).asp || spec.asp?.id || '').trim();
  if (aspId && (!specRun.asp || String(specRun.asp.id || '').trim() !== aspId)) {
    specRun = { ...specRun, asp: { ...(specRun.asp || ({} as any)), id: aspId } };
  }

  const resolvedAuthDefaults = resolvePersonaAuthDefaults({ aspId, personaRegistryPath });
  const personaRegistryEntry = resolvePersonaRegistryEntry({ aspId, personaRegistryPath });

  const runTypeRaw = String((args as any).runType || specRun.run_type || 'seed').trim();
  const runType = (runTypeRaw === 'library_only' || runTypeRaw === 'blueprint_only' || runTypeRaw === 'seed'
    ? runTypeRaw
    : 'seed') as 'seed' | 'library_only' | 'blueprint_only';
  if (!authStorePath) {
    authStorePath = resolvedAuthDefaults.authStorePath;
  }
  // Load per-persona credentials for password-grant fallback (headless persona accounts).
  // Priority: --auth-env, else seed/auth/<asp_id>.env.local.
  const authEnvPath = authEnvPathArg
    ? authEnvPathArg
    : resolvedAuthDefaults.authEnvPath;
  if (authEnvPath && fs.existsSync(authEnvPath)) {
    loadSeedCredsFromEnvFile(authEnvPath);
  }
  let persona: PersonaV0 | null = null;
  let personaHash = '';
  let personaPromptBlock = '';
  let personaPromptHash = '';
  let personaPathRel = '';
  if (aspId) {
    const loaded = loadPersonaV0(aspId);
    persona = loaded.persona;
    personaHash = loaded.personaHash;
    personaPromptBlock = loaded.promptBlock;
    personaPromptHash = loaded.promptHash;
    personaPathRel = path.relative(process.cwd(), loaded.personaPath).replace(/\\/g, '/');
  }

  const runId = sanitizeRunId(String(args.runId || spec.run_id || 'run')) || crypto.randomUUID();
  const runDir = path.join(outBase, runId);
  ensureDir(runDir);

  // Output layout v2 keeps logs separated from content artifacts.
  const outputLayoutVersion = 2;
  const logsDir = path.join(runDir, 'logs');
  const artifactsDir = path.join(runDir, 'artifacts');
  const requestsDir = path.join(runDir, 'requests');
  const aiDir = path.join(runDir, 'ai');
  ensureDir(logsDir);
  ensureDir(artifactsDir);
  ensureDir(requestsDir);
  ensureDir(aiDir);

  const outPath = {
    root: (...parts: string[]) => path.join(runDir, ...parts),
    logs: (...parts: string[]) => path.join(logsDir, ...parts),
    artifacts: (...parts: string[]) => path.join(artifactsDir, ...parts),
    requests: (...parts: string[]) => path.join(requestsDir, ...parts),
    ai: (...parts: string[]) => path.join(aiDir, ...parts),
  } as const;
  const relPath = (abs: string) => path.relative(runDir, abs).replace(/\\/g, '/');

  const runContextHash = buildRunContextHash(
    spec,
    persona ? { id: aspId, persona_hash: personaHash, prompt_hash: personaPromptHash } : null
  );
  let dasConfig: DasConfig | null = null;
  let dasConfigHash = '';
  if (dasEnabled) {
    if (!fs.existsSync(dasConfigPath)) die(`DAS config not found: ${dasConfigPath}`);
    const raw = readRawFile(dasConfigPath);
    dasConfigHash = sha256Hex(raw);
    try {
      dasConfig = JSON.parse(raw) as DasConfig;
    } catch {
      die(`DAS config is not valid JSON: ${dasConfigPath}`);
    }
    if (Number((dasConfig as any).version || 0) !== 1) die('DAS config version must be 1');
  }
  const createdAt = nowIso();

  writeJsonFile(outPath.root('manifest.json'), {
    version: 1,
    layoutVersion: outputLayoutVersion,
    runId,
    createdAt,
    dirs: {
      logs: 'logs',
      artifacts: 'artifacts',
      requests: 'requests',
      ai: 'ai',
      candidates: 'candidates',
    },
    paths: {
      runMeta: 'logs/run_meta.json',
      runLog: 'logs/run_log.json',
      personaLog: 'logs/persona_log.json',
      controlPackLog: 'logs/control_pack_log.json',
      promptPackLog: 'logs/prompt_pack_log.json',
      decisionLog: 'logs/decision_log.json',
      selection: 'logs/selection.json',
      applyLog: 'logs/apply_log.json',
      rollbackSql: 'logs/rollback.sql',
      library: 'artifacts/library.json',
      blueprints: 'artifacts/blueprints.json',
      validation: 'artifacts/validation.json',
      publishPayload: 'artifacts/publish_payload.json',
      controlPack: 'requests/control_pack.json',
      promptPack: 'requests/prompt_pack.json',
      reviewRequests: 'requests/review_requests.json',
      bannerRequests: 'requests/banner_requests.json',
      reviews: 'ai/reviews.json',
      banners: 'ai/banners.json',
    },
  });

  const runMeta: any = {
    runId,
    createdAt,
    layoutVersion: outputLayoutVersion,
    specPath,
    runType,
    asp: specRun.asp || null,
    persona: persona
      ? {
          id: aspId,
          schema_version: 0,
          persona_path: personaPathRel,
          persona_hash: personaHash,
          prompt_hash: personaPromptHash,
        }
      : null,
    composer: composeControls
      ? {
          enabled: true,
          mode: 'controls_v0',
          run_type: runType,
          control_pack_path: 'requests/control_pack.json',
          prompt_pack_path: 'requests/prompt_pack.json',
        }
      : composePrompts
        ? {
            enabled: true,
            mode: 'template',
            run_type: runType,
            prompt_pack_path: 'requests/prompt_pack.json',
          }
        : { enabled: false },
    runContextHash,
    das: dasEnabled
      ? {
          enabled: true,
          configPath: dasConfigPath,
          configHash: dasConfigHash,
        }
      : { enabled: false },
    auth: {
      storePath: path.relative(process.cwd(), authStorePath).replace(/\\/g, '/'),
      envPath: authEnvPath && fs.existsSync(authEnvPath) ? path.relative(process.cwd(), authEnvPath).replace(/\\/g, '/') : null,
      personaRegistryPath:
        personaRegistryPath && fs.existsSync(personaRegistryPath)
          ? path.relative(process.cwd(), personaRegistryPath).replace(/\\/g, '/')
          : null,
      resolvedFrom: {
        store: String(args.authStore || '').trim() ? 'cli' : resolvedAuthDefaults.source,
        env: authEnvPathArg ? 'cli' : resolvedAuthDefaults.source,
      },
      passwordGrantAvailable: Boolean(getSeedCredsFromEnv()),
    },
  };
  writeJsonFile(outPath.logs('run_meta.json'), runMeta);

  if (persona) {
    writeJsonFile(outPath.logs('persona_log.json'), {
      version: 1,
      createdAt: nowIso(),
      persona_id: aspId,
      persona_path: personaPathRel,
      persona_hash: personaHash,
      prompt_hash: personaPromptHash,
      prompt_block: personaPromptBlock,
    });
  }

  const yes = String(args.yes || '').trim();
  const applyStage1 = Boolean(args.apply);
  const limitBlueprints = Number(args.limitBlueprints || 0) || 0;

  const runLog: RunLog = {
    runId,
    startedAt: nowIso(),
    config: {
      specPath,
      outDir: runDir,
      outputLayoutVersion,
      agenticBaseUrl,
      backendCalls,
      composeControls,
      composePrompts,
      applyStage1,
      limitBlueprints,
      ...(dasEnabled ? { dasEnabled: true, dasConfigPath, dasConfigHash } : {}),
      ...(aspId ? { aspId } : {}),
      ...(personaHash ? { personaHash } : {}),
      runContextHash,
    },
    steps: [],
  };

  if (composeControls && composePrompts) {
    die('Invalid flags: use either --compose-controls or --compose-prompts (controls already render to prompt pack).');
  }

  const dasDecision: DasDecisionLog | null = dasEnabled
    ? {
        version: 1,
        runId,
        createdAt: nowIso(),
        config: { enabled: true, configPath: dasConfigPath, configHash: dasConfigHash },
        nodes: {},
      }
    : null;

  const dasSelection: DasSelection | null = dasEnabled
    ? {
        version: 1,
        runId,
        createdAt: nowIso(),
        selected: {},
      }
    : null;

  const writeDasLogs = () => {
    if (!dasDecision || !dasSelection) return;
    writeJsonFile(outPath.logs('decision_log.json'), dasDecision);
    writeJsonFile(outPath.logs('selection.json'), dasSelection);
  };

  // Create empty artifacts early so failures still leave a debuggable trail.
  if (dasEnabled) writeDasLogs();

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
      writeJsonFile(outPath.logs('run_log.json'), { ...runLog, finishedAt: nowIso() });
    }
  };

  // Control composition: optional, promptless controls derived from (persona + goal),
  // then rendered into a PromptPack so downstream nodes remain unchanged.
  let controlPack: ControlPackV0 | null = null;
  let controlPackHash = '';
  if (composeControls) {
    await step('compose_controls', async () => {
      const nodeId: DasNodeId = 'CONTROL_PACK';
      const goal = String(specRun.library.topic || '').trim();
      const blueprintCountRaw =
        limitBlueprints > 0 ? Math.min(limitBlueprints, specRun.blueprints.length) : specRun.blueprints.length;
      const blueprintCount = Math.max(1, blueprintCountRaw);

      const writePack = (pack: ControlPackV0, meta: Record<string, unknown>) => {
        const raw = JSON.stringify(pack, null, 2) + '\n';
        controlPackHash = sha256Hex(raw);
        runLog.config.controlPackHash = controlPackHash;
        writeJsonFile(outPath.requests('control_pack.json'), pack);
        writeJsonFile(outPath.logs('control_pack_log.json'), {
          version: 1,
          createdAt: nowIso(),
          nodeId,
          control_pack_hash: controlPackHash,
          control_pack_path: relPath(outPath.requests('control_pack.json')),
          ...meta,
        });
        writeJsonFile(outPath.logs('run_meta.json'), runMeta);
      };

      const renderAndApply = (pack: ControlPackV0) => {
        const rendered = renderControlPackToPromptPackV0(pack, persona);
        const renderedRaw = JSON.stringify(rendered, null, 2) + '\n';
        const renderedHash = sha256Hex(renderedRaw);
        runLog.config.promptPackHash = renderedHash;
        writeJsonFile(outPath.requests('prompt_pack.json'), rendered);
        writeJsonFile(outPath.logs('prompt_pack_log.json'), {
          version: 1,
          createdAt: nowIso(),
          nodeId: 'PROMPT_PACK',
          prompt_pack_hash: renderedHash,
          prompt_pack_path: relPath(outPath.requests('prompt_pack.json')),
          rendered_from: 'control_pack_v0',
          control_pack_hash: controlPackHash,
        });
        // Override effective spec so downstream uses rendered inputs.
        specRun = { ...specRun, library: rendered.library as any, blueprints: rendered.blueprints as any };
      };

      if (!dasEnabled || !dasConfig || !dasDecision || !dasSelection) {
        const pack = composeControlPackV0({
          runType,
          goal,
          persona,
          blueprintCount,
        });
        applyControlDefaultsFromRegistry(pack, personaRegistryEntry);
        const gates: DasGateResult[] = [evalStructuralControlPack(pack), evalBoundsControlPack(pack)];
        if (!gates.every((g) => g.ok)) {
          throw new Error(`CONTROL_PACK gates failed: ${gates.filter((g) => !g.ok).map((g) => g.reason).join(', ')}`);
        }
        controlPack = pack;
        writePack(pack, { dasEnabled: false, selected: { attempt: 1, candidate: 1 }, gates });
        renderAndApply(pack);
        return { ok: true };
      }

      const policy = getDasPolicy(dasConfig, nodeId);
      const decision: DasNodeDecision = { nodeId, policy, attempts: [] };
      dasDecision.nodes[nodeId] = decision;
      ensureDir(path.join(runDir, 'candidates', nodeId));

      const failOnceEnabled =
        !!dasConfig.testOnly?.enabled &&
        !!dasConfig.testOnly?.failOnce &&
        Array.isArray(dasConfig.testOnly.failOnce.nodes) &&
        dasConfig.testOnly.failOnce.nodes.includes(nodeId) &&
        Number(dasConfig.testOnly.failOnce.failOnAttempt || 0) > 0;
      const failOnAttempt = Number(dasConfig.testOnly?.failOnce?.failOnAttempt || 0) || 0;

      if (!policy.enabled) {
        decision.attempts.push({ attempt: 1, candidates: [], status: 'disabled' });
        writeDasLogs();
        const pack = composeControlPackV0({
          runType,
          goal,
          persona,
          blueprintCount,
        });
        controlPack = pack;
        writePack(pack, { dasEnabled: true, policy, selected: { attempt: 1, candidate: 1 }, gates: [] });
        renderAndApply(pack);
        return { ok: true };
      }

      const attemptCount = policy.maxAttempts;
      const k = policy.kCandidates;
      let selected: { pack: ControlPackV0; file: string; attempt: number; candidate: number; score: number } | null = null;

      const applyControlPackOverrides = (pack: ControlPackV0) => {
        // Optional per-node overrides for smoke tests and deterministic runs.
        // These are intentionally simple: they mutate the composed pack before gates run.
        const params = (policy.params || {}) as Record<string, unknown>;

        const forceDomain = String(params.force_domain || '').trim();
        const forceDomainCustom = String(params.force_domain_custom || '').trim();
        if (forceDomain) {
          (pack.library as any).controls = (pack.library as any).controls || {};
          (pack.library as any).controls.domain = forceDomain as any;
          if (forceDomain === 'custom') {
            if (forceDomainCustom) (pack.library as any).controls.domain_custom = forceDomainCustom;
          } else {
            delete (pack.library as any).controls.domain_custom;
          }
        }

        const forceFocus = String(params.force_focus || '').trim();
        const forceFocusCustom = String(params.force_focus_custom || '').trim();
        if (forceFocus) {
          for (const bp of pack.blueprints || []) {
            (bp as any).controls = (bp as any).controls || {};
            (bp as any).controls.focus = forceFocus;
            if (forceFocus === 'custom') {
              if (forceFocusCustom) (bp as any).controls.focus_custom = forceFocusCustom;
            } else {
              delete (bp as any).controls.focus_custom;
            }
          }
        }
      };

      for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
        const attemptRec: DasNodeDecision['attempts'][number] = { attempt, candidates: [], status: 'retry' };
        decision.attempts.push(attemptRec);

        if (failOnceEnabled && attempt === failOnAttempt) {
          const file = path.join(runDir, 'candidates', nodeId, `attempt-${String(attempt).padStart(2, '0')}-skipped.json`);
          writeJsonFile(file, { nodeId, attempt, skipped: true, reason: 'testOnly_failOnce', createdAt: nowIso() });
          attemptRec.candidates.push({
            attempt,
            candidate: 0,
            ok: false,
            score: 0,
            skipped: true,
            file: path.relative(runDir, file),
            gates: [gate('testOnly_failOnce', false, 'warn', 0, 'forced_retry', { attempt })],
          });
          attemptRec.status = attempt === attemptCount ? 'exhausted' : 'retry';
          writeDasLogs();
          continue;
        }

        const candidateValues: Array<{ pack: ControlPackV0; file: string; score: number; candidate: number }> = [];
        for (let cand = 1; cand <= k; cand += 1) {
          const templateOffset = (attempt - 1) * k + (cand - 1);
          let pack: ControlPackV0 | null = null;
          try {
            pack = composeControlPackV0({
              runType,
              goal,
              persona,
              blueprintCount,
              templateOffset,
            });
            applyControlDefaultsFromRegistry(pack, personaRegistryEntry);
            applyControlPackOverrides(pack);
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            attemptRec.candidates.push({
              attempt,
              candidate: cand,
              ok: false,
              score: 0,
              error: err.message.slice(0, 500),
              gates: [gate('exception', false, 'warn', 0, 'compose_threw')],
            });
            continue;
          }

          const outFile = path.join(
            runDir,
            'candidates',
            nodeId,
            `attempt-${String(attempt).padStart(2, '0')}-cand-${String(cand).padStart(2, '0')}.json`
          );
          writeJsonFile(outFile, {
            nodeId,
            attempt,
            candidate: cand,
            createdAt: nowIso(),
            goal,
            blueprintCount,
            persona_id: persona ? persona.id : null,
            output: pack,
          });

          const gates: DasGateResult[] = [];
          const evalList = policy.eval;
          if (evalList.includes('structural')) gates.push(evalStructuralControlPack(pack));
          if (evalList.includes('bounds')) gates.push(evalBoundsControlPack(pack));
          if (evalList.includes('persona_alignment_v0')) {
            const p = ((policy.params || {}) as any).persona_alignment_v0;
            gates.push(evalPersonaAlignmentControlPack(persona, pack, (p && typeof p === 'object' ? (p as any) : {}) as any));
          }
          for (const gName of evalList) {
            if (gName === 'structural' || gName === 'bounds' || gName === 'persona_alignment_v0' || gName === 'testOnly_failOnce') continue;
            gates.push(gate(gName, false, 'hard_fail', 0, 'not_implemented'));
          }

          const ok = gates.every((g) => g.ok);
          const score = gates.reduce((acc, g) => acc + (Number(g.score) || 0), 0);
          attemptRec.candidates.push({
            attempt,
            candidate: cand,
            ok,
            score,
            file: path.relative(runDir, outFile),
            gates,
          });
          if (ok) candidateValues.push({ pack, file: path.relative(runDir, outFile), score, candidate: cand });
        }

        if (candidateValues.length) {
          candidateValues.sort((a, b) => b.score - a.score);
          const best = candidateValues[0]!;
          selected = { pack: best.pack, file: best.file, attempt, candidate: best.candidate, score: best.score };
          attemptRec.selectedCandidate = best.candidate;
          attemptRec.status = 'selected';
          decision.selected = { attempt, candidate: best.candidate, score: best.score, file: best.file };
          dasSelection.selected[nodeId] = { attempt, candidate: best.candidate, score: best.score, file: best.file };
          writeDasLogs();
          break;
        }

        attemptRec.status = attempt === attemptCount ? 'exhausted' : 'retry';
        writeDasLogs();
      }

      if (!selected) throw new Error(`DAS failed: no passing control_pack candidate after ${attemptCount} attempt(s)`);
      controlPack = selected.pack;
      writePack(selected.pack, { dasEnabled: true, policy, selected: decision.selected || null });
      renderAndApply(selected.pack);
      return { ok: true };
    });
  }

  // Prompt composition: optional, template-based "user-like inputs" derived from (persona + goal).
  // When enabled, specRun is overridden so downstream nodes consume the composed prompts.
  let promptPack: PromptPackV0 | null = null;
  let promptPackHash = '';
  if (composePrompts) {
    await step('compose_prompts', async () => {
      const nodeId: DasNodeId = 'PROMPT_PACK';
      const goal = String(specRun.library.topic || '').trim();
      const blueprintCountRaw =
        limitBlueprints > 0 ? Math.min(limitBlueprints, specRun.blueprints.length) : specRun.blueprints.length;
      const blueprintCount = Math.max(1, blueprintCountRaw);

      const writePack = (pack: PromptPackV0, meta: Record<string, unknown>) => {
        const raw = JSON.stringify(pack, null, 2) + '\n';
        promptPackHash = sha256Hex(raw);
        runLog.config.promptPackHash = promptPackHash;
        writeJsonFile(outPath.requests('prompt_pack.json'), pack);
        writeJsonFile(outPath.logs('prompt_pack_log.json'), {
          version: 1,
          createdAt: nowIso(),
          nodeId,
          prompt_pack_hash: promptPackHash,
          prompt_pack_path: relPath(outPath.requests('prompt_pack.json')),
          ...meta,
        });
        // Record the hash in run_meta for reproducibility.
        if (runMeta.composer && runMeta.composer.enabled) {
          runMeta.composer.prompt_pack_hash = promptPackHash;
        }
        writeJsonFile(outPath.logs('run_meta.json'), runMeta);
      };

      if (!dasEnabled || !dasConfig || !dasDecision || !dasSelection) {
        const pack = composePromptPackV0({
          runType,
          goal,
          persona,
          blueprintCount,
        });
        const gates: DasGateResult[] = [evalStructuralPromptPack(pack), evalBoundsPromptPack(pack)];
        if (!gates.every((g) => g.ok)) {
          throw new Error(`PROMPT_PACK gates failed: ${gates.filter((g) => !g.ok).map((g) => g.reason).join(', ')}`);
        }
        promptPack = pack;
        specRun = { ...specRun, library: pack.library as any, blueprints: pack.blueprints as any };
        writePack(pack, { dasEnabled: false, selected: { attempt: 1, candidate: 1 }, gates });
        return { ok: true };
      }

      const policy = getDasPolicy(dasConfig, nodeId);
      const decision: DasNodeDecision = { nodeId, policy, attempts: [] };
      dasDecision.nodes[nodeId] = decision;
      ensureDir(path.join(runDir, 'candidates', nodeId));

      const failOnceEnabled =
        !!dasConfig.testOnly?.enabled &&
        !!dasConfig.testOnly?.failOnce &&
        Array.isArray(dasConfig.testOnly.failOnce.nodes) &&
        dasConfig.testOnly.failOnce.nodes.includes(nodeId) &&
        Number(dasConfig.testOnly.failOnce.failOnAttempt || 0) > 0;
      const failOnAttempt = Number(dasConfig.testOnly?.failOnce?.failOnAttempt || 0) || 0;

      if (!policy.enabled) {
        decision.attempts.push({ attempt: 1, candidates: [], status: 'disabled' });
        writeDasLogs();
        const pack = composePromptPackV0({
          runType,
          goal,
          persona,
          blueprintCount,
        });
        promptPack = pack;
        specRun = { ...specRun, library: pack.library as any, blueprints: pack.blueprints as any };
        writePack(pack, { dasEnabled: true, policy, selected: { attempt: 1, candidate: 1 }, gates: [] });
        return { ok: true };
      }

      const attemptCount = policy.maxAttempts;
      const k = policy.kCandidates;
      let selected: { pack: PromptPackV0; file: string; attempt: number; candidate: number; score: number } | null = null;

      for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
        const attemptRec: DasNodeDecision['attempts'][number] = { attempt, candidates: [], status: 'retry' };
        decision.attempts.push(attemptRec);

        if (failOnceEnabled && attempt === failOnAttempt) {
          const file = path.join(runDir, 'candidates', nodeId, `attempt-${String(attempt).padStart(2, '0')}-skipped.json`);
          writeJsonFile(file, { nodeId, attempt, skipped: true, reason: 'testOnly_failOnce', createdAt: nowIso() });
          attemptRec.candidates.push({
            attempt,
            candidate: 0,
            ok: false,
            score: 0,
            skipped: true,
            file: path.relative(runDir, file),
            gates: [gate('testOnly_failOnce', false, 'warn', 0, 'forced_retry', { attempt })],
          });
          attemptRec.status = attempt === attemptCount ? 'exhausted' : 'retry';
          writeDasLogs();
          continue;
        }

        const candidateValues: Array<{ pack: PromptPackV0; file: string; score: number; candidate: number }> = [];
        for (let cand = 1; cand <= k; cand += 1) {
          const templateOffset = (attempt - 1) * k + (cand - 1);
          let pack: PromptPackV0 | null = null;
          try {
            pack = composePromptPackV0({
              runType,
              goal,
              persona,
              blueprintCount,
              templateOffset,
            });
          } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            attemptRec.candidates.push({
              attempt,
              candidate: cand,
              ok: false,
              score: 0,
              error: err.message.slice(0, 500),
              gates: [gate('exception', false, 'warn', 0, 'compose_threw')],
            });
            continue;
          }

          const outFile = path.join(
            runDir,
            'candidates',
            nodeId,
            `attempt-${String(attempt).padStart(2, '0')}-cand-${String(cand).padStart(2, '0')}.json`
          );
          writeJsonFile(outFile, {
            nodeId,
            attempt,
            candidate: cand,
            createdAt: nowIso(),
            goal,
            blueprintCount,
            persona_id: persona ? persona.id : null,
            output: pack,
          });

          const gates: DasGateResult[] = [];
          const evalList = policy.eval;
          if (evalList.includes('structural')) gates.push(evalStructuralPromptPack(pack));
          if (evalList.includes('bounds')) gates.push(evalBoundsPromptPack(pack));
          if (evalList.includes('persona_alignment_v0')) {
            const p = ((policy.params || {}) as any).persona_alignment_v0;
            gates.push(evalPersonaAlignmentPromptPack(persona, pack, (p && typeof p === 'object' ? (p as any) : {}) as any));
          }

          for (const gName of evalList) {
            if (gName === 'structural' || gName === 'bounds' || gName === 'persona_alignment_v0' || gName === 'testOnly_failOnce')
              continue;
            gates.push(gate(gName, false, 'hard_fail', 0, 'not_implemented'));
          }

          const ok = gates.every((g) => g.ok);
          const score = gates.reduce((acc, g) => acc + (Number(g.score) || 0), 0);
          attemptRec.candidates.push({
            attempt,
            candidate: cand,
            ok,
            score,
            file: path.relative(runDir, outFile),
            gates,
          });
          if (ok) candidateValues.push({ pack, file: path.relative(runDir, outFile), score, candidate: cand });
        }

        if (candidateValues.length) {
          candidateValues.sort((a, b) => b.score - a.score);
          const best = candidateValues[0]!;
          selected = { pack: best.pack, file: best.file, attempt, candidate: best.candidate, score: best.score };
          attemptRec.selectedCandidate = best.candidate;
          attemptRec.status = 'selected';
          decision.selected = { attempt, candidate: best.candidate, score: best.score, file: best.file };
          dasSelection.selected[nodeId] = { attempt, candidate: best.candidate, score: best.score, file: best.file };
          writeDasLogs();
          break;
        }

        attemptRec.status = attempt === attemptCount ? 'exhausted' : 'retry';
        writeDasLogs();
      }

      if (!selected) {
        throw new Error(`DAS failed: no passing prompt_pack candidate after ${attemptCount} attempt(s)`);
      }

      promptPack = selected.pack;
      specRun = { ...specRun, library: selected.pack.library as any, blueprints: selected.pack.blueprints as any };
      writePack(selected.pack, { dasEnabled: true, policy, selected: decision.selected || null });
      return { ok: true };
    });
  }

  // Compose-only mode: validate CONTROL_PACK/PROMPT_PACK generation without backend calls.
  // This is useful when bootstrapping auth or debugging control pack overrides.
  if (!backendCalls && !authOnly) {
    writeJsonFile(outPath.logs('run_log.json'), { ...runLog, finishedAt: nowIso() });
    process.stdout.write(`Stage 0 complete (compose-only). Output: ${runDir}\n`);
    return;
  }

  // Auth: prefer explicit access token; optionally refresh via refresh token and persist rotation in authStorePath.
  const supabaseUrlForAuth =
    String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseAnonKeyForAuth = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');

  const store = readAuthStore(authStorePath);
  let accessToken = (process.env.SEED_USER_ACCESS_TOKEN?.trim() || store.access_token || '').trim();
  let refreshToken = (process.env.SEED_USER_REFRESH_TOKEN?.trim() || store.refresh_token || '').trim();

  const passwordGrantSession = async () => {
    const creds = getSeedCredsFromEnv();
    if (!creds) throw new Error('Missing SEED_USER_EMAIL/SEED_USER_PASSWORD for password grant.');
    if (!supabaseUrlForAuth || !supabaseAnonKeyForAuth) {
      throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_PUBLISHABLE_KEY for password grant.');
    }
    const url = `${supabaseUrlForAuth}/auth/v1/token?grant_type=password`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKeyForAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`Supabase password grant failed (${res.status}): ${text.slice(0, 800)}`);
    const data = JSON.parse(text) as { access_token?: string; refresh_token?: string };
    const nextAccess = String(data.access_token || '').trim();
    const nextRefresh = String(data.refresh_token || '').trim();
    if (!nextAccess) throw new Error('Supabase password grant succeeded but returned empty access_token');
    accessToken = nextAccess;
    if (nextRefresh) refreshToken = nextRefresh;
    writeAuthStore(authStorePath, { access_token: accessToken, refresh_token: refreshToken });
  };

  const refreshSession = async () => {
    if (!refreshToken) throw new Error('Missing refresh token (set SEED_USER_REFRESH_TOKEN or auth store refresh_token).');
    if (!supabaseUrlForAuth || !supabaseAnonKeyForAuth) {
      throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_PUBLISHABLE_KEY for refresh.');
    }

    const url = `${supabaseUrlForAuth}/auth/v1/token?grant_type=refresh_token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKeyForAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`Supabase refresh failed (${res.status}): ${text.slice(0, 800)}`);
    const data = JSON.parse(text) as { access_token?: string; refresh_token?: string };
    const nextAccess = String(data.access_token || '').trim();
    const nextRefresh = String(data.refresh_token || '').trim();
    if (!nextAccess) throw new Error('Supabase refresh succeeded but returned empty access_token');
    accessToken = nextAccess;
    if (nextRefresh) refreshToken = nextRefresh;
    writeAuthStore(authStorePath, { access_token: accessToken, refresh_token: refreshToken });
  };

  const ensureValidAccessToken = async () => {
    if (accessToken && !isJwtExpired(accessToken)) return;
    // Prefer refresh token rotation when available.
    if (refreshToken) {
      try {
        await refreshSession();
        return;
      } catch (err) {
        // If another process rotated the token already, re-read the store and retry once.
        if (isRefreshTokenAlreadyUsedError(err)) {
          const latest = readAuthStore(authStorePath);
          const latestRt = String(latest.refresh_token || '').trim();
          if (latestRt && latestRt !== refreshToken) {
            refreshToken = latestRt;
            await refreshSession();
            return;
          }
        }
        // Fall back to password grant when configured (headless persona accounts).
        if (getSeedCredsFromEnv()) {
          await passwordGrantSession();
          return;
        }
        throw err;
      }
    }
    // No refresh token: try password grant if configured.
    if (getSeedCredsFromEnv()) {
      await passwordGrantSession();
      return;
    }
    if (!accessToken) throw new Error('Missing SEED_USER_ACCESS_TOKEN. Set it in your shell before running Stage 0.');
    throw new Error('SEED_USER_ACCESS_TOKEN is expired and no refresh token or password grant is available.');
  };

  if (backendCalls || authOnly) {
    await step('auth', async () => {
      await ensureValidAccessToken();
      return { ok: true };
    });
  }

  const seedUserId = accessToken ? getJwtSub(accessToken) : '';
  runMeta.auth.user_id = seedUserId || null;
  runMeta.auth.derived_from = seedUserId ? 'jwt_sub' : null;
  writeJsonFile(outPath.logs('run_meta.json'), runMeta);

  if (authOnly) {
    writeJsonFile(outPath.logs('run_log.json'), { ...runLog, finishedAt: nowIso() });
    process.stdout.write(`Stage 0 complete (auth-only). Output: ${runDir}\n`);
    return;
  }
  if (applyStage1 && !seedUserId) {
    die('Could not derive seed user id from SEED_USER_ACCESS_TOKEN (JWT sub missing).');
  }

  const inventory = await step('generate_library', async () => {
    if (!backendCalls) throw new Error('Backend calls disabled. Use --compose-controls/--compose-prompts for compose-only runs.');
    if (runType === 'blueprint_only') {
      const libPath = String((args as any).libraryJson || '').trim();
      if (!libPath) throw new Error('run_type blueprint_only requires --library-json <path>');
      if (!fs.existsSync(libPath)) throw new Error(`library json not found: ${libPath}`);
      const raw = readJsonFile<any>(libPath);
      const inv = (raw && raw.generated && raw.generated.categories) ? (raw.generated as InventorySchema) : (raw as InventorySchema);
      writeJsonFile(outPath.artifacts('library.json'), {
        source: 'library_json',
        libraryJsonPath: libPath,
        ...(persona ? { meta: { persona_id: aspId, persona_hash: personaHash } } : {}),
        generated: inv,
      });
      return inv;
    }
    const url = `${agenticBaseUrl}/api/generate-inventory`;
    const customInstructions = joinPromptParts([specRun.library.notes || '', personaPromptBlock]);
    const body = {
      keywords: specRun.library.topic,
      title: specRun.library.title,
      customInstructions,
    };

    // DAS v1: retries + select-best are only enabled when --das/--das-config is used.
    if (!dasEnabled || !dasConfig || !dasDecision || !dasSelection) {
      await ensureValidAccessToken();
      let res = await postJson<InventorySchema>(url, accessToken, body);
      if (!res.ok && res.status === 401 && refreshToken) {
        await refreshSession();
        res = await postJson<InventorySchema>(url, accessToken, body);
      }
      if (!res.ok) {
        throw new Error(`generate-inventory failed (${res.status}): ${res.text.slice(0, 500)}`);
      }
      writeJsonFile(outPath.artifacts('library.json'), {
        ...specRun.library,
        ...(persona ? { meta: { persona_id: aspId, persona_hash: personaHash } } : {}),
        generated: res.data,
      });
      return res.data;
    }

    const nodeId: DasNodeId = 'LIB_GEN';
    const policy = getDasPolicy(dasConfig, nodeId);
    const decision: DasNodeDecision = { nodeId, policy, attempts: [] };
    dasDecision.nodes[nodeId] = decision;
    ensureDir(path.join(runDir, 'candidates', nodeId));

    const failOnceEnabled =
      !!dasConfig.testOnly?.enabled &&
      !!dasConfig.testOnly?.failOnce &&
      Array.isArray(dasConfig.testOnly.failOnce.nodes) &&
      dasConfig.testOnly.failOnce.nodes.includes(nodeId) &&
      Number(dasConfig.testOnly.failOnce.failOnAttempt || 0) > 0;
    const failOnAttempt = Number(dasConfig.testOnly?.failOnce?.failOnAttempt || 0) || 0;

    if (!policy.enabled) {
      decision.attempts.push({ attempt: 1, candidates: [], status: 'disabled' });
      writeDasLogs();
      await ensureValidAccessToken();
      const res = await postJson<InventorySchema>(url, accessToken, body);
      if (!res.ok) throw new Error(`generate-inventory failed (${res.status}): ${res.text.slice(0, 500)}`);
      writeJsonFile(outPath.artifacts('library.json'), {
        ...specRun.library,
        ...(persona ? { meta: { persona_id: aspId, persona_hash: personaHash } } : {}),
        generated: res.data,
      });
      return res.data;
    }

    const attemptCount = policy.maxAttempts;
    const k = policy.kCandidates;
    let selected: { inv: InventorySchema; file: string; attempt: number; candidate: number; score: number } | null =
      null;

    for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
      const attemptRec: DasNodeDecision['attempts'][number] = { attempt, candidates: [], status: 'retry' };
      decision.attempts.push(attemptRec);

      if (failOnceEnabled && attempt === failOnAttempt) {
        const file = path.join(runDir, 'candidates', nodeId, `attempt-${String(attempt).padStart(2, '0')}-skipped.json`);
        writeJsonFile(file, {
          nodeId,
          attempt,
          skipped: true,
          reason: 'testOnly_failOnce',
          createdAt: nowIso(),
        });
        attemptRec.candidates.push({
          attempt,
          candidate: 0,
          ok: false,
          score: 0,
          skipped: true,
          file: path.relative(runDir, file),
          gates: [gate('testOnly_failOnce', false, 'warn', 0, 'forced_retry', { attempt })],
        });
        attemptRec.status = attempt === attemptCount ? 'exhausted' : 'retry';
        writeDasLogs();
        continue;
      }

      const candidateValues: Array<{ inv: InventorySchema; file: string; score: number; candidate: number }> = [];
      for (let cand = 1; cand <= k; cand += 1) {
        await ensureValidAccessToken();
        let res = await postJson<InventorySchema>(url, accessToken, body);
        if (!res.ok && res.status === 401 && refreshToken) {
          await refreshSession();
          res = await postJson<InventorySchema>(url, accessToken, body);
        }
        if (!res.ok) {
          attemptRec.candidates.push({
            attempt,
            candidate: cand,
            ok: false,
            score: 0,
            error: res.text.slice(0, 500),
            gates: [gate('http', false, 'warn', 0, 'http_error', { status: res.status })],
          });
          continue;
        }

        const outFile = path.join(
          runDir,
          'candidates',
          nodeId,
          `attempt-${String(attempt).padStart(2, '0')}-cand-${String(cand).padStart(2, '0')}.json`
        );
        writeJsonFile(outFile, {
          nodeId,
          attempt,
          candidate: cand,
          createdAt: nowIso(),
          request: body,
          output: res.data,
        });

        const gates: DasGateResult[] = [];
        const evalList = policy.eval;
        if (evalList.includes('structural')) gates.push(evalStructuralInventory(res.data));
        if (evalList.includes('bounds')) gates.push(evalBoundsInventory(res.data));

        // Unknown gates are a hard fail (config mismatch). Add stubs explicitly if needed.
        for (const gName of evalList) {
          if (gName === 'structural' || gName === 'bounds' || gName === 'testOnly_failOnce') continue;
          gates.push(gate(gName, false, 'hard_fail', 0, 'not_implemented'));
        }

        const ok = gates.every((g) => g.ok);
        const score = gates.reduce((acc, g) => acc + (Number(g.score) || 0), 0);
        attemptRec.candidates.push({
          attempt,
          candidate: cand,
          ok,
          score,
          file: path.relative(runDir, outFile),
          gates,
        });
        if (ok) candidateValues.push({ inv: res.data, file: path.relative(runDir, outFile), score, candidate: cand });
      }

      if (candidateValues.length) {
        candidateValues.sort((a, b) => b.score - a.score);
        const best = candidateValues[0]!;
        selected = { inv: best.inv, file: best.file, attempt, candidate: best.candidate, score: best.score };
        attemptRec.selectedCandidate = best.candidate;
        attemptRec.status = 'selected';
        decision.selected = { attempt, candidate: best.candidate, score: best.score, file: best.file };
        dasSelection.selected[nodeId] = { attempt, candidate: best.candidate, score: best.score, file: best.file };
        writeDasLogs();
        break;
      }

      attemptRec.status = attempt === attemptCount ? 'exhausted' : 'retry';
      writeDasLogs();
    }

    if (!selected) {
      throw new Error(`DAS failed: no passing library candidate after ${attemptCount} attempt(s)`);
    }

    writeJsonFile(outPath.artifacts('library.json'), {
      ...specRun.library,
      ...(persona ? { meta: { persona_id: aspId, persona_hash: personaHash } } : {}),
      generated: selected.inv,
    });
    return selected.inv;
  });

  const generatedBlueprints = await step('generate_blueprints', async () => {
    if (!backendCalls) throw new Error('Backend calls disabled (no-backend not implemented in Stage 0)');
    if (runType === 'library_only') {
      writeJsonFile(outPath.artifacts('blueprints.json'), {
        libraryTitle: specRun.library.title,
        ...(persona ? { meta: { persona_id: aspId, persona_hash: personaHash } } : {}),
        blueprints: [],
        skipped: true,
        reason: 'run_type_library_only',
      });
      return [] as GeneratedBlueprint[];
    }
    const url = `${agenticBaseUrl}/api/generate-blueprint`;
    const categories = (inventory.categories || []).map((c) => ({ name: c.name, items: c.items }));

    const blueprintSpecs = limitBlueprints > 0 ? specRun.blueprints.slice(0, limitBlueprints) : specRun.blueprints;

    const generateOnce = async (): Promise<{
      results: Array<{ spec: SeedSpec['blueprints'][number]; generated: GeneratedBlueprint }>;
      list: GeneratedBlueprint[];
      requests: unknown[];
    }> => {
      const results: Array<{
        spec: SeedSpec['blueprints'][number];
        generated: GeneratedBlueprint;
      }> = [];
      const requests: unknown[] = [];

      for (const bp of blueprintSpecs) {
        const notes = joinPromptParts([bp.notes || '', personaPromptBlock]);
        const body = {
          title: bp.title,
          description: bp.description || '',
          notes,
          inventoryTitle: specRun.library.title,
          categories,
        };
        requests.push(body);
        let res = await postJson<GeneratedBlueprint>(url, accessToken, body);
        if (!res.ok && res.status === 401 && refreshToken) {
          await refreshSession();
          res = await postJson<GeneratedBlueprint>(url, accessToken, body);
        }
        if (!res.ok) {
          throw new Error(`generate-blueprint failed (${res.status}): ${res.text.slice(0, 500)}`);
        }
        results.push({ spec: bp, generated: res.data });
      }
      return { results, list: results.map((r) => r.generated), requests };
    };

    // DAS v1: retries + select-best only when enabled.
    if (!dasEnabled || !dasConfig || !dasDecision || !dasSelection) {
      await ensureValidAccessToken();
      const { results, list } = await generateOnce();
      writeJsonFile(outPath.artifacts('blueprints.json'), {
        libraryTitle: specRun.library.title,
        ...(persona ? { meta: { persona_id: aspId, persona_hash: personaHash } } : {}),
        blueprints: results,
      });
      return list;
    }

    const nodeId: DasNodeId = 'BP_GEN';
    const policy = getDasPolicy(dasConfig, nodeId);
    const decision: DasNodeDecision = { nodeId, policy, attempts: [] };
    dasDecision.nodes[nodeId] = decision;
    ensureDir(path.join(runDir, 'candidates', nodeId));

    const failOnceEnabled =
      !!dasConfig.testOnly?.enabled &&
      !!dasConfig.testOnly?.failOnce &&
      Array.isArray(dasConfig.testOnly.failOnce.nodes) &&
      dasConfig.testOnly.failOnce.nodes.includes(nodeId) &&
      Number(dasConfig.testOnly.failOnce.failOnAttempt || 0) > 0;
    const failOnAttempt = Number(dasConfig.testOnly?.failOnce?.failOnAttempt || 0) || 0;

    if (!policy.enabled) {
      decision.attempts.push({ attempt: 1, candidates: [], status: 'disabled' });
      writeDasLogs();
      await ensureValidAccessToken();
      const { results, list } = await generateOnce();
      writeJsonFile(outPath.artifacts('blueprints.json'), {
        libraryTitle: specRun.library.title,
        ...(persona ? { meta: { persona_id: aspId, persona_hash: personaHash } } : {}),
        blueprints: results,
      });
      return list;
    }

    const attemptCount = policy.maxAttempts;
    const k = policy.kCandidates;
    let selected: { list: GeneratedBlueprint[]; file: string; attempt: number; candidate: number; score: number } | null =
      null;

    for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
      const attemptRec: DasNodeDecision['attempts'][number] = { attempt, candidates: [], status: 'retry' };
      decision.attempts.push(attemptRec);

      if (failOnceEnabled && attempt === failOnAttempt) {
        const file = path.join(runDir, 'candidates', nodeId, `attempt-${String(attempt).padStart(2, '0')}-skipped.json`);
        writeJsonFile(file, {
          nodeId,
          attempt,
          skipped: true,
          reason: 'testOnly_failOnce',
          createdAt: nowIso(),
        });
        attemptRec.candidates.push({
          attempt,
          candidate: 0,
          ok: false,
          score: 0,
          skipped: true,
          file: path.relative(runDir, file),
          gates: [gate('testOnly_failOnce', false, 'warn', 0, 'forced_retry', { attempt })],
        });
        attemptRec.status = attempt === attemptCount ? 'exhausted' : 'retry';
        writeDasLogs();
        continue;
      }

      const candidateValues: Array<{ list: GeneratedBlueprint[]; file: string; score: number; candidate: number }> = [];
      for (let cand = 1; cand <= k; cand += 1) {
        await ensureValidAccessToken();
        let list: GeneratedBlueprint[] = [];
        let requests: unknown[] = [];
        let err: Error | null = null;
        try {
          const out = await generateOnce();
          list = out.list;
          requests = out.requests;
        } catch (e) {
          err = e instanceof Error ? e : new Error(String(e));
        }

        if (err) {
          attemptRec.candidates.push({
            attempt,
            candidate: cand,
            ok: false,
            score: 0,
            error: err.message.slice(0, 500),
            gates: [gate('exception', false, 'warn', 0, 'generate_blueprint_threw')],
          });
          continue;
        }

        const outFile = path.join(
          runDir,
          'candidates',
          nodeId,
          `attempt-${String(attempt).padStart(2, '0')}-cand-${String(cand).padStart(2, '0')}.json`
        );
        writeJsonFile(outFile, {
          nodeId,
          attempt,
          candidate: cand,
          createdAt: nowIso(),
          blueprintCount: blueprintSpecs.length,
          requests,
          output: list,
        });

        const gates: DasGateResult[] = [];
        const evalList = policy.eval;
        if (evalList.includes('structural')) gates.push(evalStructuralBlueprints(list));
        if (evalList.includes('bounds')) gates.push(evalBoundsBlueprints(list));
        if (evalList.includes('crossref')) {
          const v = validateBlueprints(inventory, list);
          gates.push(
            gate(
              'crossref',
              v.ok,
              v.ok ? 'info' : 'warn',
              v.ok ? 1 : 0,
              v.ok ? 'ok' : 'invalid_refs',
              {
                errorCount: v.errors.length,
                warningCount: v.warnings.length,
                sampleError: v.errors[0] ? String(v.errors[0]).slice(0, 200) : '',
              }
            )
          );
        }
        for (const gName of evalList) {
          if (gName === 'structural' || gName === 'bounds' || gName === 'crossref' || gName === 'testOnly_failOnce') continue;
          gates.push(gate(gName, false, 'hard_fail', 0, 'not_implemented'));
        }

        const ok = gates.every((g) => g.ok);
        const score = gates.reduce((acc, g) => acc + (Number(g.score) || 0), 0);
        attemptRec.candidates.push({
          attempt,
          candidate: cand,
          ok,
          score,
          file: path.relative(runDir, outFile),
          gates,
        });
        if (ok) candidateValues.push({ list, file: path.relative(runDir, outFile), score, candidate: cand });
      }

      if (candidateValues.length) {
        candidateValues.sort((a, b) => b.score - a.score);
        const best = candidateValues[0]!;
        selected = { list: best.list, file: best.file, attempt, candidate: best.candidate, score: best.score };
        attemptRec.selectedCandidate = best.candidate;
        attemptRec.status = 'selected';
        decision.selected = { attempt, candidate: best.candidate, score: best.score, file: best.file };
        dasSelection.selected[nodeId] = { attempt, candidate: best.candidate, score: best.score, file: best.file };
        writeDasLogs();
        break;
      }

      attemptRec.status = attempt === attemptCount ? 'exhausted' : 'retry';
      writeDasLogs();
    }

    if (!selected) {
      throw new Error(`DAS failed: no passing blueprint candidate after ${attemptCount} attempt(s)`);
    }

    // Persist the selected set as the canonical artifact.
    writeJsonFile(outPath.artifacts('blueprints.json'), {
      libraryTitle: specRun.library.title,
      ...(persona ? { meta: { persona_id: aspId, persona_hash: personaHash } } : {}),
      blueprints: blueprintSpecs.map((bp, i) => ({ spec: bp, generated: selected!.list[i]! })),
    });
    return selected.list;
  });

  const reviewPayloads = await step('generate_review_requests', async () => {
    // Stage 0: do not call review endpoint (cost + credits). Produce payloads only.
    const payloads = generatedBlueprints.map((bp) => buildReviewPayload(specRun, bp));
    writeJsonFile(outPath.requests('review_requests.json'), payloads);
    return payloads;
  });

  const bannerPayloads = await step('generate_banner_requests', async () => {
    // Stage 0: do not call banner endpoint (would upload to Storage). Produce payloads only.
    const payloads = generatedBlueprints.map((bp, idx) => buildBannerPayload(specRun, bp, idx));
    writeJsonFile(outPath.requests('banner_requests.json'), payloads);
    return payloads;
  });

  if (doReview) {
    await step('execute_review', async () => {
      if (!backendCalls) throw new Error('Backend calls disabled');
      await ensureValidAccessToken();
      const url = `${agenticBaseUrl}/api/analyze-blueprint`;
      const results: Array<{ title: string; review: string }> = [];

      for (const payload of reviewPayloads) {
        const body = {
          ...payload,
          reviewPrompt: reviewFocus || payload.reviewPrompt || '',
        };
        let res = await postSseText(url, accessToken, body);
        if (!res.ok && res.status === 401 && refreshToken) {
          await refreshSession();
          res = await postSseText(url, accessToken, body);
        }
        if (!res.ok) {
          throw new Error(`analyze-blueprint failed (${res.status}): ${res.text.slice(0, 500)}`);
        }
        results.push({ title: payload.title, review: res.text });
      }

      writeJsonFile(outPath.ai('reviews.json'), results);
      return { count: results.length };
    });
  }

  if (doBanner) {
    await step('execute_banner', async () => {
      if (!backendCalls) throw new Error('Backend calls disabled');
      await ensureValidAccessToken();
      const url = `${agenticBaseUrl}/api/generate-banner`;
      const maxAttempts = 3;
      const results: Array<
        | { title: string; ok: true; attempts: number; contentType: string; imageBase64: string }
        | { title: string; ok: false; attempts: number; status?: number; error: string }
      > = [];

      for (const payload of bannerPayloads) {
        let attempts = 0;
        let lastErr: { status?: number; text: string } | null = null;

        while (attempts < maxAttempts) {
          attempts += 1;
          let res = await postJson<{ contentType: string; imageBase64: string }>(url, accessToken, payload);
          if (!res.ok && res.status === 401 && refreshToken) {
            await refreshSession();
            res = await postJson<{ contentType: string; imageBase64: string }>(url, accessToken, payload);
          }
          if (res.ok) {
            results.push({
              title: payload.title,
              ok: true,
              attempts,
              contentType: res.data.contentType,
              imageBase64: res.data.imageBase64,
            });
            lastErr = null;
            break;
          }

          lastErr = { status: res.status, text: res.text };

          const shouldRetry = res.status === 429 || res.status >= 500;
          if (!shouldRetry || attempts >= maxAttempts) break;
          await sleep(800 * attempts);
        }

        if (lastErr) {
          results.push({
            title: payload.title,
            ok: false,
            attempts,
            status: lastErr.status,
            error: lastErr.text.slice(0, 1000),
          });
        }
      }

      writeJsonFile(outPath.ai('banners.json'), results);
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      return { okCount, failCount, count: results.length };
    });
  }

  const validation = await step('validate', async () => {
    const result = validateBlueprints(inventory, generatedBlueprints);
    const validationFile = outPath.artifacts('validation.json');
    const validationRel = relPath(validationFile);
    writeJsonFile(validationFile, result);

    if (dasEnabled && dasConfig && dasDecision && dasSelection) {
      const nodeId: DasNodeId = 'VAL';
      const policy = getDasPolicy(dasConfig, nodeId);
      const decision: DasNodeDecision = {
        nodeId,
        policy,
        attempts: [
          {
            attempt: 1,
            status: result.ok ? 'selected' : 'hard_fail',
            candidates: [
              {
                attempt: 1,
                candidate: 1,
                ok: result.ok,
                score: result.ok ? 1 : 0,
                gates: [
                  gate('crossref', result.ok, result.ok ? 'info' : 'hard_fail', result.ok ? 1 : 0, result.ok ? 'ok' : 'invalid_refs', {
                    errorCount: result.errors.length,
                    warningCount: result.warnings.length,
                  }),
                ],
                file: validationRel,
              },
            ],
            selectedCandidate: result.ok ? 1 : undefined,
          },
        ],
        ...(result.ok ? { selected: { attempt: 1, candidate: 1, score: 1, file: validationRel } } : {}),
      };
      dasDecision.nodes[nodeId] = decision;
      if (result.ok) dasSelection.selected[nodeId] = { attempt: 1, candidate: 1, score: 1, file: validationRel };
      writeDasLogs();
    }

    return result;
  });

  if (applyStage1) {
    if (runType === 'library_only') {
      throw new Error('Refusing Stage 1 apply: run_type=library_only produces no blueprints to publish.');
    }
    if (!generatedBlueprints || generatedBlueprints.length === 0) {
      throw new Error('Refusing Stage 1 apply: no generated blueprints. Run with seed/blueprint_only first.');
    }
    if (!validation.ok) {
      throw new Error('Refusing Stage 1 apply: validation.ok is false. Fix generation/selection first.');
    }

    if (dasEnabled && dasConfig) {
      const applyPolicy = getDasPolicy(dasConfig, 'APPLY');
      if (!applyPolicy.enabled) {
        throw new Error('Refusing Stage 1 apply: disabled by DAS config (nodes.APPLY.enabled=false).');
      }
    }

    await step('apply_stage1_guard', async () => {
      if (yes !== 'APPLY_STAGE1') {
        throw new Error('Stage 1 apply is gated. Re-run with: --apply --yes APPLY_STAGE1');
      }
      return { ok: true };
    });

    await step('apply_stage1_auth', async () => {
      await ensureValidAccessToken();
      return { ok: true };
    });

    const supabaseUrl =
      String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_PUBLISHABLE_KEY for Stage 1.');
    }

    const restBase = `${supabaseUrl}/rest/v1`;
    const restHeaders = () =>
      ({
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }) as const;

    const restInsert = async <T>(table: string, row: unknown, select: string) => {
      const url = `${restBase}/${table}?select=${encodeURIComponent(select)}`;
      const res = await fetch(url, { method: 'POST', headers: restHeaders() as any, body: JSON.stringify(row) });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`Supabase insert ${table} failed (${res.status}): ${text.slice(0, 800)}`);
      const data = JSON.parse(text) as T[];
      if (!Array.isArray(data) || data.length === 0) throw new Error(`Supabase insert ${table} returned no rows`);
      return data[0]!;
    };

    const isMissingColumnErrorText = (err: unknown, column: string) => {
      const msg = String((err as any)?.message || '').toLowerCase();
      return msg.includes('does not exist') && msg.includes(column.toLowerCase());
    };

    const dropKey = (obj: unknown, key: string) => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
      const out = { ...(obj as any) };
      delete (out as any)[key];
      return out;
    };

    // Lovable Cloud DB schema may lag behind code. For optional columns, retry without them.
    const restInsertCompat = async <T>(table: string, row: unknown, select: string) => {
      try {
        return await restInsert<T>(table, row, select);
      } catch (e) {
        if (isMissingColumnErrorText(e, 'generation_controls')) {
          return await restInsert<T>(table, dropKey(row, 'generation_controls'), select);
        }
        throw e;
      }
    };

    const restUpdate = async <T>(table: string, filter: string, patch: unknown, select: string) => {
      const url = `${restBase}/${table}?${filter}&select=${encodeURIComponent(select)}`;
      const res = await fetch(url, { method: 'PATCH', headers: restHeaders() as any, body: JSON.stringify(patch) });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`Supabase update ${table} failed (${res.status}): ${text.slice(0, 800)}`);
      const data = JSON.parse(text) as T[];
      return Array.isArray(data) ? data : [];
    };

    const restGet = async <T>(table: string, query: string) => {
      const url = `${restBase}/${table}?${query}`;
      const res = await fetch(url, { method: 'GET', headers: restHeaders() as any });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(`Supabase get ${table} failed (${res.status}): ${text.slice(0, 800)}`);
      return JSON.parse(text) as T[];
    };

    const ensureTags = async (slugs: string[]) => {
      const normalized = uniqStrings(slugs.map(normalizeSlug)).filter(Boolean);
      if (normalized.length === 0) return [] as Array<{ id: string; slug: string }>;

      const existing = await restGet<{ id: string; slug: string }>(
        'tags',
        `select=id,slug&slug=in.(${normalized.map(encodeURIComponent).join(',')})`
      );
      const existingSlugs = new Set((existing || []).map((t) => t.slug));
      const missing = normalized.filter((s) => !existingSlugs.has(s));

      let created: Array<{ id: string; slug: string }> = [];
      for (const slug of missing) {
        const row = await restInsert<{ id: string; slug: string }>('tags', { slug, created_by: seedUserId }, 'id,slug');
        created.push(row);
      }
      return [...(existing || []), ...created];
    };

    const applyLog: Record<string, unknown> = {
      runId,
      supabaseUrl,
      startedAt: nowIso(),
      inventoryId: null,
      blueprintIds: [] as string[],
      bannerUploads: [] as Array<{ blueprintTitle: string; ok: boolean; bannerUrl?: string; error?: string }>,
    };

    // Optional: persist promptless intent (controls) for later eval/debug.
    const controlPackPath = outPath.requests('control_pack.json');
    const promptPackPath = outPath.requests('prompt_pack.json');
    const controlPack = fs.existsSync(controlPackPath) ? readJsonFile<any>(controlPackPath) : null;
    const promptPack = fs.existsSync(promptPackPath) ? readJsonFile<any>(promptPackPath) : null;
    const controlPackHashLocal = controlPack ? sha256Hex(JSON.stringify(controlPack)) : null;

    const invTags = ensureTags(specRun.library.tags || []);
    const inventoryRow = await step('apply_T1_insert_inventory', async () => {
      const categories = (inventory.categories || []).map((c) => c.name).filter(Boolean);
      const promptCategories = categories.join(', ');
      const row = await restInsertCompat<{ id: string }>(
        'inventories',
        {
          title: specRun.library.title,
          prompt_inventory: specRun.library.topic,
          prompt_categories: promptCategories,
          generated_schema: inventory,
          review_sections: ['Overview', 'Strengths', 'Gaps', 'Suggestions'],
          include_score: true,
          creator_user_id: seedUserId,
          is_public: false,
          ...(controlPack
            ? {
                generation_controls: {
                  version: 0,
                  source: 'das',
                  control_pack_hash: controlPackHashLocal,
                  control_pack: controlPack,
                  prompt_pack: promptPack,
                },
              }
            : {}),
        },
        'id'
      );
      applyLog.inventoryId = row.id;
      return row;
    });

    await step('apply_T1_tag_inventory', async () => {
      const tags = await invTags;
      if (tags.length === 0) return { count: 0 };
      const rows = tags.map((t) => ({ inventory_id: (inventoryRow as any).id, tag_id: t.id }));
      // Insert join rows one-by-one to keep failure mode obvious.
      for (const r of rows) {
        await restInsert('inventory_tags', r, 'inventory_id,tag_id');
      }
      return { count: rows.length };
    });

    const blueprintIds: string[] = [];
    const blueprintIdByTitle = new Map<string, string>();

    await step('apply_T2_insert_blueprints', async () => {
      let idx = 0;
      for (const bp of generatedBlueprints) {
        const variant = specRun.blueprints[idx] || {};
        const bpIndex = idx;
        idx += 1;

        const selectedItems: Record<string, Array<string | { name: string; context?: string }>> = {};
        for (const st of bp.steps || []) {
          for (const it of st.items || []) {
            const cat = String(it.category || '').trim();
            const name = String(it.name || '').trim();
            if (!cat || !name) continue;
            const list = selectedItems[cat] || [];
            list.push(it.context ? { name, context: it.context } : name);
            selectedItems[cat] = list;
          }
        }

        const mixNotes = String(variant.notes || specRun.library.notes || '').trim() || null;
        const row = await restInsertCompat<{ id: string }>(
          'blueprints',
          {
            inventory_id: (inventoryRow as any).id,
            creator_user_id: seedUserId,
            title: bp.title,
            selected_items: selectedItems,
            steps: bp.steps,
            mix_notes: mixNotes,
            review_prompt: reviewFocus || null,
            llm_review: null,
            banner_url: null,
            is_public: false,
            source_blueprint_id: null,
            ...(controlPack
              ? {
                  generation_controls: {
                    version: 0,
                    source: 'das',
                    control_pack_hash: controlPackHashLocal,
                    blueprint_index: bpIndex,
                    blueprint_controls: (controlPack?.blueprints || [])[bpIndex] || null,
                  },
                }
              : {}),
          },
          'id'
        );
        blueprintIds.push(row.id);
        blueprintIdByTitle.set(bp.title, row.id);
      }
      applyLog.blueprintIds = blueprintIds;
      return { count: blueprintIds.length };
    });

    await step('apply_T2_tag_blueprints', async () => {
      let idx = 0;
      for (const bp of generatedBlueprints) {
        const variant = specRun.blueprints[idx] || {};
        idx += 1;
        const title = bp.title;
        const bpId = blueprintIdByTitle.get(title);
        if (!bpId) continue;
        const tags = await ensureTags([...(specRun.library.tags || []), ...((variant as any).tags || [])]);
        for (const t of tags) {
          await restInsert('blueprint_tags', { blueprint_id: bpId, tag_id: t.id }, 'blueprint_id,tag_id');
        }
      }
      return { ok: true };
    });

    await step('apply_T4_persist_reviews', async () => {
      const reviewsPath = outPath.ai('reviews.json');
      if (!fs.existsSync(reviewsPath)) return { skipped: true };
      const reviews = readJsonFile<Array<{ title: string; review: string }>>(reviewsPath);
      for (const r of reviews) {
        const bpId = blueprintIdByTitle.get(r.title);
        if (!bpId) continue;
        await restUpdate('blueprints', `id=eq.${bpId}`, { llm_review: r.review }, 'id');
      }
      return { count: reviews.length };
    });

    await step('apply_T3_upload_banners', async () => {
      const bannersPath = outPath.ai('banners.json');
      if (!fs.existsSync(bannersPath)) return { skipped: true };
      const banners = readJsonFile<
        Array<{ title: string; ok: true; contentType: string; imageBase64: string } | { title: string; ok: false; error: string }>
      >(bannersPath);

      const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/upload-banner`;
      for (const b of banners) {
        await ensureValidAccessToken();
        const bpId = blueprintIdByTitle.get(b.title);
        if (!bpId) continue;

        if (!('ok' in b) || !b.ok) {
          (applyLog.bannerUploads as any).push({ blueprintTitle: b.title, ok: false, error: (b as any).error || 'no banner' });
          continue;
        }

        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contentType: b.contentType,
            imageBase64: b.imageBase64,
          }),
        });

        const text = await res.text().catch(() => '');
        if (!res.ok) {
          (applyLog.bannerUploads as any).push({ blueprintTitle: b.title, ok: false, error: text.slice(0, 800) });
          continue;
        }
        const data = JSON.parse(text) as { bannerUrl?: string };
        const bannerUrl = String(data.bannerUrl || '');
        if (!bannerUrl) {
          (applyLog.bannerUploads as any).push({ blueprintTitle: b.title, ok: false, error: 'missing bannerUrl' });
          continue;
        }
        await restUpdate('blueprints', `id=eq.${bpId}`, { banner_url: bannerUrl }, 'id');
        (applyLog.bannerUploads as any).push({ blueprintTitle: b.title, ok: true, bannerUrl });
      }

      return { count: (applyLog.bannerUploads as any).length };
    });

    await step('apply_T5_publish', async () => {
      // Publish blueprints first, then the inventory.
      for (const id of blueprintIds) {
        await restUpdate('blueprints', `id=eq.${id}`, { is_public: true }, 'id');
      }
      await restUpdate('inventories', `id=eq.${(inventoryRow as any).id}`, { is_public: true }, 'id');
      return { blueprintCount: blueprintIds.length };
    });

    applyLog.finishedAt = nowIso();
    writeJsonFile(outPath.logs('apply_log.json'), applyLog);

    // Best-effort rollback artifacts (user runs manually in SQL console if needed).
    const rollbackSql = [
      '-- Rollback for seed run',
      `-- run_id: ${runId}`,
      '',
      'BEGIN;',
      `DELETE FROM public.blueprint_tags WHERE blueprint_id IN (${blueprintIds.map((id) => `'${id}'`).join(',')});`,
      `DELETE FROM public.blueprints WHERE id IN (${blueprintIds.map((id) => `'${id}'`).join(',')});`,
      `DELETE FROM public.inventory_tags WHERE inventory_id = '${(inventoryRow as any).id}';`,
      `DELETE FROM public.inventories WHERE id = '${(inventoryRow as any).id}';`,
      'COMMIT;',
      '',
    ].join('\n');
    writeTextFile(outPath.logs('rollback.sql'), rollbackSql);
  }

  await step('publish_payload', async () => {
    const payload = {
      run_id: runId,
      library: specRun.library,
      inventory: inventory,
      blueprints: generatedBlueprints,
      notes: 'Stage 0 only: no DB writes. Stage 1 will translate this payload into Supabase inserts.',
    };
    writeJsonFile(outPath.artifacts('publish_payload.json'), payload);
    return { ok: validation.ok };
  });

  runLog.finishedAt = nowIso();
  writeJsonFile(outPath.logs('run_log.json'), runLog);
  process.stdout.write(`Stage 0 complete. Output: ${runDir}\n`);
}

main().catch((e) => {
  const err = e instanceof Error ? e : new Error(String(e));
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
