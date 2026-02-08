import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type PersonaV0 = {
  version: 0;
  id: string;
  display_name: string;
  bio: string;
  interests?: {
    topics?: string[];
    tags_prefer?: string[];
    tags_avoid?: string[];
    audience_level?: 'beginner' | 'intermediate' | 'advanced';
  };
  style?: {
    tone?: 'friendly' | 'practical' | 'coach' | 'clinical';
    verbosity?: 'short' | 'medium' | 'long';
    formatting?: string[];
  };
  constraints?: {
    must_include?: string[];
    must_avoid?: string[];
    time_budget_minutes?: number | null;
    equipment_level?: 'none' | 'minimal' | 'standard' | null;
  };
  safety?: {
    domain?: 'general' | 'health' | 'fitness' | 'nutrition' | 'skincare';
    medical_caution_level?: 'low' | 'medium' | 'high';
    forbidden_claims?: string[];
    pii_handling?: 'avoid' | 'allow_non_sensitive_only';
  };
  agent_policy?: Record<string, unknown>;
  disclosure?: Record<string, unknown>;
};

export type LoadedPersonaV0 = {
  persona: PersonaV0;
  id: string;
  personaPath: string;
  personaHash: string;
  promptBlock: string;
  promptHash: string;
};

function sha256Hex(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function normalizeLf(text: string) {
  return text.replace(/\r\n/g, '\n');
}

export function isSafeId(id: string) {
  return /^[a-z0-9_-]+$/i.test(id);
}

function uniqStrings(list: string[]) {
  return Array.from(new Set(list.map((s) => String(s || '').trim()).filter(Boolean)));
}

export function validatePersonaV0(persona: unknown, expectedId: string): string[] {
  const errors: string[] = [];
  const p = persona as any;
  if (!p || typeof p !== 'object') return ['persona must be a JSON object'];
  if (Number(p.version) !== 0) errors.push('persona.version must be 0');
  if (!String(p.id || '').trim()) errors.push('persona.id is required');
  if (String(p.id || '').trim() !== expectedId) errors.push(`persona.id must match expected id: ${expectedId}`);
  if (!String(p.display_name || '').trim()) errors.push('persona.display_name is required');
  if (!String(p.bio || '').trim()) errors.push('persona.bio is required');
  return errors;
}

export function getPersonaV0Path(personaId: string, baseDir = process.cwd()) {
  const id = String(personaId || '').trim();
  if (!id) throw new Error('Missing persona id');
  if (!isSafeId(id)) throw new Error(`Unsafe persona id: ${id}`);
  return path.join(baseDir, 'personas', 'v0', `${id}.json`);
}

export function personaToPromptBlock(p: PersonaV0): string {
  const topics = uniqStrings((p.interests?.topics || []).map(String));
  const preferTags = uniqStrings((p.interests?.tags_prefer || []).map(String));
  const avoidTags = uniqStrings((p.interests?.tags_avoid || []).map(String));
  const mustInclude = uniqStrings((p.constraints?.must_include || []).map(String));
  const mustAvoid = uniqStrings((p.constraints?.must_avoid || []).map(String));
  const forbidden = uniqStrings((p.safety?.forbidden_claims || []).map(String));

  const lines: string[] = [];
  lines.push('Persona profile (apply to generation):');
  lines.push(`- id: ${p.id}`);
  lines.push(`- display_name: ${p.display_name}`);
  lines.push(`- bio: ${String(p.bio || '').trim()}`);
  if (p.interests?.audience_level) lines.push(`- audience_level: ${p.interests.audience_level}`);
  if (topics.length) lines.push(`- topics: ${topics.join(', ')}`);
  if (preferTags.length) lines.push(`- prefer_tags: ${preferTags.join(', ')}`);
  if (avoidTags.length) lines.push(`- avoid_tags: ${avoidTags.join(', ')}`);
  if (p.style?.tone) lines.push(`- tone: ${p.style.tone}`);
  if (p.style?.verbosity) lines.push(`- verbosity: ${p.style.verbosity}`);
  if (mustInclude.length) lines.push(`- must_include: ${mustInclude.join('; ')}`);
  if (mustAvoid.length) lines.push(`- must_avoid: ${mustAvoid.join('; ')}`);
  if (p.constraints?.time_budget_minutes !== undefined && p.constraints.time_budget_minutes !== null) {
    lines.push(`- time_budget_minutes: ${Number(p.constraints.time_budget_minutes)}`);
  }
  if (p.constraints?.equipment_level) lines.push(`- equipment_level: ${p.constraints.equipment_level}`);
  if (p.safety?.domain) lines.push(`- safety_domain: ${p.safety.domain}`);
  if (p.safety?.medical_caution_level) lines.push(`- medical_caution_level: ${p.safety.medical_caution_level}`);
  if (forbidden.length) lines.push(`- forbidden_claims: ${forbidden.join(', ')}`);
  lines.push('- avoid medical advice and guaranteed claims');
  return lines.join('\n');
}

export function loadPersonaV0(personaId: string, opts?: { baseDir?: string }): LoadedPersonaV0 {
  const id = String(personaId || '').trim();
  const baseDir = opts?.baseDir || process.cwd();
  const personaPath = getPersonaV0Path(id, baseDir);
  if (!fs.existsSync(personaPath)) throw new Error(`Persona file not found: ${personaPath}`);

  const raw = fs.readFileSync(personaPath, 'utf-8');
  const normalized = normalizeLf(raw);
  const personaHash = sha256Hex(normalized);
  const parsed = JSON.parse(raw) as PersonaV0;

  const errs = validatePersonaV0(parsed, id);
  if (errs.length) throw new Error(`Invalid persona (${id}):\n- ${errs.join('\n- ')}`);

  const promptBlock = personaToPromptBlock(parsed);
  const promptHash = sha256Hex(normalizeLf(promptBlock));
  return { persona: parsed, id, personaPath, personaHash, promptBlock, promptHash };
}

