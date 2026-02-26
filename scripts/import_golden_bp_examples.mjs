#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();

function loadEnvFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}

loadEnvFileIfPresent(path.join(ROOT, '.env'));
loadEnvFileIfPresent(path.join(ROOT, '.env.production'));

function parseArgs(argv) {
  const out = {
    apply: false,
    clearExisting: false,
    userId: '',
    examplesDir: path.join(ROOT, 'docs/golden_blueprint/examples'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      out.apply = true;
      continue;
    }
    if (arg === '--clear-existing') {
      out.clearExisting = true;
      continue;
    }
    if (arg === '--user-id') {
      out.userId = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--user-id=')) {
      out.userId = String(arg.slice('--user-id='.length) || '').trim();
      continue;
    }
    if (arg === '--examples-dir') {
      const next = String(argv[i + 1] || '').trim();
      if (next) out.examplesDir = path.isAbsolute(next) ? next : path.join(ROOT, next);
      i += 1;
      continue;
    }
    if (arg.startsWith('--examples-dir=')) {
      const val = String(arg.slice('--examples-dir='.length) || '').trim();
      if (val) out.examplesDir = path.isAbsolute(val) ? val : path.join(ROOT, val);
      continue;
    }
  }
  return out;
}

function usage() {
  console.log(
    [
      'Usage:',
      '  node scripts/import_golden_bp_examples.mjs --user-id <uuid> [--apply] [--clear-existing]',
      '',
      'Flags:',
      '  --user-id         Target user who should receive the imported feed items (required).',
      '  --apply           Execute writes. Without this flag, script runs as dry-run.',
      '  --clear-existing  Remove prior imports for this user before re-importing.',
      '  --examples-dir    Optional examples dir (default: docs/golden_blueprint/examples).',
      '',
      'Example:',
      '  node scripts/import_golden_bp_examples.mjs --user-id <uuid> --apply --clear-existing',
    ].join('\n'),
  );
}

function stripMd(line) {
  return String(line || '')
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+]\s+|\d+\.\s+|\d+\)\s+)/, '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .trim();
}

function parseTitle(markdown, fallbackTitle) {
  const lines = markdown.split(/\r?\n/);
  const h1 = lines.find((line) => /^\s*#\s+/.test(line));
  const parsed = stripMd(h1 || '');
  return parsed || fallbackTitle;
}

function parseShortReview(markdown) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim());
  const paraLines = [];
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line) continue;
    if (/^\s*#/.test(line)) continue;
    if (/^\s*(?:[-*+]\s+|\d+\.\s+|\d+\)\s+)/.test(line)) continue;
    paraLines.push(stripMd(line));
    if (paraLines.join(' ').length > 320) break;
  }
  const text = paraLines.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 280 ? `${text.slice(0, 277).trim()}...` : text;
}

function parseStepsFromMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const steps = [];
  let current = null;
  let inFence = false;

  const flush = () => {
    if (!current) return;
    const description = current.paragraphs.join(' ').replace(/\s+/g, ' ').trim();
    const step = {
      id: `step-${steps.length + 1}`,
      title: current.title || `Step ${steps.length + 1}`,
      description: description || null,
      items: current.items.map((value) => ({ name: value })),
    };
    steps.push(step);
    current = null;
  };

  for (const raw of lines) {
    const line = String(raw || '');
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (/^\s*##\s+/.test(line)) {
      flush();
      current = { title: stripMd(line), paragraphs: [], items: [] };
      continue;
    }
    if (!current) continue;

    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\s*#\s+/.test(trimmed)) continue;
    if (/^\s*###\s+/.test(trimmed)) {
      current.paragraphs.push(stripMd(trimmed));
      continue;
    }
    if (/^\s*(?:[-*+]\s+|\d+\.\s+|\d+\)\s+)/.test(trimmed)) {
      const item = stripMd(trimmed);
      if (item) current.items.push(item);
      continue;
    }

    const cleaned = stripMd(trimmed);
    if (cleaned) current.paragraphs.push(cleaned);
  }
  flush();

  if (steps.length > 0) return steps;

  const fallbackParagraphs = markdown
    .split(/\r?\n/)
    .map((line) => stripMd(line))
    .filter((line) => line && !line.startsWith('#'))
    .join('\n')
    .split(/\n{2,}/)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 4);

  if (fallbackParagraphs.length === 0) return [];

  return fallbackParagraphs.map((paragraph, index) => ({
    id: `step-${index + 1}`,
    title: index === 0 ? 'Overview' : `Key Point ${index + 1}`,
    description: paragraph,
    items: [],
  }));
}

const EXAMPLE_MANIFEST = [
  {
    key: 'golden_bp_ai_paper_slop',
    exampleFile: 'example_bp_ai_paper_slop.md',
    videoId: 's95ISC-KeIM',
    videoTitle: 'Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?',
    channelExternalId: 'gbp-ai-paper-slop',
    channelTitle: 'AI Paper Slop',
    channelUrl: 'https://www.youtube.com/@AIPaperSlop',
    tags: ['developer-workflows', 'ai-agents'],
  },
  {
    key: 'golden_bp_thomas_de_lauer',
    exampleFile: 'example_bp_thomas_de_lauer.md',
    videoId: 'IherD4otL2I',
    videoTitle: '4g of This Amino Build More Muscle than Any Other Compound',
    channelExternalId: 'gbp-thomas-delauer',
    channelTitle: 'Thomas DeLauer',
    channelUrl: 'https://www.youtube.com/@ThomasDeLauerOfficial',
    tags: ['nutrition-meal-planning', 'longevity-biohacking'],
  },
  {
    key: 'golden_bp_italian_sausage_chowder',
    exampleFile: 'example_bp_italian_sausage_chowder.md',
    videoId: 'Fjng4WHkJ6E',
    videoTitle: 'ITALIAN SAUSAGE CHOWDER',
    channelExternalId: 'gbp-the-bleu-channel',
    channelTitle: 'The Bleu Channel',
    channelUrl: 'https://www.youtube.com/@TheBleuChannel',
    tags: ['nutrition-meal-planning', 'food-cooking'],
  },
];

function mustEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function ensureSourcePage(db, row, apply) {
  const { data: existing, error: existingError } = await db
    .from('source_pages')
    .select('id')
    .eq('platform', 'youtube')
    .eq('external_id', row.channelExternalId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  if (!apply) return `dry-source-page-${row.channelExternalId}`;

  const { data: created, error: createError } = await db
    .from('source_pages')
    .insert({
      platform: 'youtube',
      external_id: row.channelExternalId,
      title: row.channelTitle,
      external_url: row.channelUrl,
      avatar_url: `https://i.ytimg.com/vi/${row.videoId}/hqdefault.jpg`,
      metadata: {
        source: 'golden_bp_examples_v1',
      },
      is_active: true,
    })
    .select('id')
    .single();
  if (createError) throw createError;
  return created.id;
}

async function ensureSourceItem(db, row, sourcePageId, apply) {
  const canonicalKey = `youtube:video:${row.videoId}`;
  const { data: existing, error: existingError } = await db
    .from('source_items')
    .select('id')
    .eq('canonical_key', canonicalKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    if (!apply) return existing.id;
    const { error: updateError } = await db
      .from('source_items')
      .update({
        source_page_id: sourcePageId.startsWith('dry-') ? null : sourcePageId,
        source_channel_id: row.channelExternalId,
        source_channel_title: row.channelTitle,
        title: row.videoTitle,
        source_url: `https://www.youtube.com/watch?v=${row.videoId}`,
        thumbnail_url: `https://i.ytimg.com/vi/${row.videoId}/hqdefault.jpg`,
        metadata: {
          source: 'golden_bp_examples_v1',
          golden_bp_key: row.key,
        },
      })
      .eq('id', existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  if (!apply) return `dry-source-item-${row.videoId}`;

  const { data: created, error: createError } = await db
    .from('source_items')
    .insert({
      canonical_key: canonicalKey,
      source_native_id: row.videoId,
      source_type: 'youtube',
      source_url: `https://www.youtube.com/watch?v=${row.videoId}`,
      source_channel_id: row.channelExternalId,
      source_channel_title: row.channelTitle,
      source_page_id: sourcePageId.startsWith('dry-') ? null : sourcePageId,
      title: row.videoTitle,
      thumbnail_url: `https://i.ytimg.com/vi/${row.videoId}/hqdefault.jpg`,
      ingest_status: 'ready',
      metadata: {
        source: 'golden_bp_examples_v1',
        golden_bp_key: row.key,
      },
    })
    .select('id')
    .single();
  if (createError) throw createError;
  return created.id;
}

async function ensureBlueprint(db, input, apply) {
  const { userId, row, title, markdown, llmReview, steps } = input;
  const { data: existing, error: existingError } = await db
    .from('blueprints')
    .select('id')
    .eq('creator_user_id', userId)
    .eq('selected_items->>golden_bp_key', row.key)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    if (!apply) return existing.id;
    const { error: updateError } = await db
      .from('blueprints')
      .update({
        title,
        llm_review: llmReview,
        mix_notes: null,
        banner_url: `https://i.ytimg.com/vi/${row.videoId}/hqdefault.jpg`,
        steps,
        selected_items: {
          source: 'golden_bp_examples_v1',
          golden_bp_key: row.key,
          example_file: row.exampleFile,
          markdown,
        },
        is_public: false,
      })
      .eq('id', existing.id);
    if (updateError) throw updateError;
    return existing.id;
  }

  if (!apply) return `dry-blueprint-${row.key}`;

  const { data: created, error: createError } = await db
    .from('blueprints')
    .insert({
      title,
      creator_user_id: userId,
      is_public: false,
      banner_url: `https://i.ytimg.com/vi/${row.videoId}/hqdefault.jpg`,
      llm_review: llmReview,
      mix_notes: null,
      steps,
      selected_items: {
        source: 'golden_bp_examples_v1',
        golden_bp_key: row.key,
        example_file: row.exampleFile,
        markdown,
      },
    })
    .select('id')
    .single();
  if (createError) throw createError;
  return created.id;
}

async function ensureTags(db, blueprintId, tags, userId, apply) {
  if (!apply || !blueprintId || String(blueprintId).startsWith('dry-')) return;
  for (const slug of tags) {
    const normalized = String(slug || '').trim().toLowerCase();
    if (!normalized) continue;
    let tagId = null;
    const { data: existingTag } = await db
      .from('tags')
      .select('id')
      .eq('slug', normalized)
      .maybeSingle();
    if (existingTag?.id) {
      tagId = existingTag.id;
    } else {
      const { data: createdTag, error: createTagError } = await db
        .from('tags')
        .insert({ slug: normalized, created_by: userId })
        .select('id')
        .single();
      if (createTagError) throw createTagError;
      tagId = createdTag.id;
    }
    if (!tagId) continue;
    const { error: upsertError } = await db
      .from('blueprint_tags')
      .upsert({ blueprint_id: blueprintId, tag_id: tagId }, { onConflict: 'blueprint_id,tag_id' });
    if (upsertError) throw upsertError;
  }
}

async function upsertFeedRow(db, input, apply) {
  const { userId, sourceItemId, blueprintId } = input;
  if (!apply) return 'dry-feed-item';
  const { error } = await db
    .from('user_feed_items')
    .upsert({
      user_id: userId,
      source_item_id: sourceItemId,
      blueprint_id: blueprintId,
      state: 'my_feed_published',
      last_decision_code: null,
    }, { onConflict: 'user_id,source_item_id' });
  if (error) throw error;

  const { data: row, error: readError } = await db
    .from('user_feed_items')
    .select('id')
    .eq('user_id', userId)
    .eq('source_item_id', sourceItemId)
    .maybeSingle();
  if (readError) throw readError;
  return row?.id || null;
}

async function clearExistingImports(db, userId, apply) {
  const { data: existing, error } = await db
    .from('blueprints')
    .select('id, selected_items')
    .eq('creator_user_id', userId);
  if (error) throw error;

  const importedIds = (existing || [])
    .filter((row) => {
      const payload = row.selected_items;
      return payload && typeof payload === 'object'
        && !Array.isArray(payload)
        && String(payload.source || '').trim() === 'golden_bp_examples_v1';
    })
    .map((row) => row.id);

  if (!importedIds.length) return { removedBlueprints: 0, removedFeedItems: 0 };
  if (!apply) return { removedBlueprints: importedIds.length, removedFeedItems: importedIds.length };

  const { error: feedDeleteError } = await db
    .from('user_feed_items')
    .delete()
    .eq('user_id', userId)
    .in('blueprint_id', importedIds);
  if (feedDeleteError) throw feedDeleteError;

  const { error: tagsDeleteError } = await db
    .from('blueprint_tags')
    .delete()
    .in('blueprint_id', importedIds);
  if (tagsDeleteError) throw tagsDeleteError;

  const { error: blueprintDeleteError } = await db
    .from('blueprints')
    .delete()
    .in('id', importedIds);
  if (blueprintDeleteError) throw blueprintDeleteError;

  return { removedBlueprints: importedIds.length, removedFeedItems: importedIds.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.userId) {
    usage();
    process.exit(1);
  }

  const examplesDir = args.examplesDir;
  if (!fs.existsSync(examplesDir)) {
    throw new Error(`Examples directory not found: ${examplesDir}`);
  }

  const supabaseUrl = mustEnv('VITE_SUPABASE_URL');
  const serviceRoleKey = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('user_id')
    .eq('user_id', args.userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.user_id) throw new Error(`Profile not found for user_id=${args.userId}`);

  console.log(`[golden-bp-import] mode=${args.apply ? 'apply' : 'dry-run'} user_id=${args.userId}`);

  if (args.clearExisting) {
    const cleared = await clearExistingImports(db, args.userId, args.apply);
    console.log(`[golden-bp-import] clear-existing removed_blueprints=${cleared.removedBlueprints} removed_feed_items=${cleared.removedFeedItems}`);
  }

  const output = [];
  for (const row of EXAMPLE_MANIFEST) {
    const mdPath = path.join(examplesDir, row.exampleFile);
    if (!fs.existsSync(mdPath)) throw new Error(`Missing example markdown: ${mdPath}`);
    const markdown = fs.readFileSync(mdPath, 'utf8');
    const title = parseTitle(markdown, row.videoTitle);
    const llmReview = null;
    const steps = parseStepsFromMarkdown(markdown);

    const sourcePageId = await ensureSourcePage(db, row, args.apply);
    const sourceItemId = await ensureSourceItem(db, row, sourcePageId, args.apply);
    const blueprintId = await ensureBlueprint(db, {
      userId: args.userId,
      row,
      title,
      markdown,
      llmReview,
      steps,
    }, args.apply);

    await ensureTags(db, blueprintId, row.tags || [], args.userId, args.apply);
    const feedItemId = await upsertFeedRow(db, {
      userId: args.userId,
      sourceItemId,
      blueprintId,
    }, args.apply);

    output.push({
      key: row.key,
      title,
      sourceItemId,
      blueprintId,
      feedItemId,
      videoUrl: `https://www.youtube.com/watch?v=${row.videoId}`,
      appPath: String(blueprintId || '').startsWith('dry-') ? null : `/blueprint/${blueprintId}`,
    });
  }

  console.log('[golden-bp-import] completed entries=' + output.length);
  output.forEach((row, idx) => {
    console.log(
      `${idx + 1}. key=${row.key} blueprint_id=${row.blueprintId} feed_item_id=${row.feedItemId} source_item_id=${row.sourceItemId} app_path=${row.appPath || 'dry-run'}`,
    );
  });
}

main().catch((error) => {
  console.error('[golden-bp-import] failed:', error?.message || error);
  process.exit(1);
});
