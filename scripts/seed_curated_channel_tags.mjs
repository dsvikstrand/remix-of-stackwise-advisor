import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function extractTagSlugsFromCatalog(catalogPath) {
  const text = fs.readFileSync(catalogPath, 'utf8');
  const slugs = new Set();

  const re = /tagSlug:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const slug = match[1].trim();
    if (slug) slugs.add(slug);
  }

  return Array.from(slugs);
}

async function main() {
  loadDotEnv(path.resolve(process.cwd(), '.env'));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) in environment/.env');
  }
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in environment/.env');
  }

  const catalogPath = path.resolve(process.cwd(), 'src/lib/channelsCatalog.ts');
  const tagSlugs = extractTagSlugsFromCatalog(catalogPath);
  if (tagSlugs.length === 0) {
    throw new Error('No tagSlug entries found in src/lib/channelsCatalog.ts');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: existing, error: existingError } = await supabase
    .from('tags')
    .select('slug')
    .in('slug', tagSlugs);
  if (existingError) throw existingError;

  const existingSet = new Set((existing || []).map((row) => row.slug));
  const missing = tagSlugs.filter((slug) => !existingSet.has(slug));

  if (missing.length === 0) {
    console.log(`[seed:channels:tags] ok - all ${tagSlugs.length} tag slugs already exist`);
    return;
  }

  const { error: insertError } = await supabase.from('tags').insert(
    missing.map((slug) => ({
      slug,
      created_by: null,
    })),
  );
  if (insertError) throw insertError;

  console.log(`[seed:channels:tags] created ${missing.length}/${tagSlugs.length} tags`);
  console.log(`[seed:channels:tags] created_slugs=${missing.join(',')}`);
}

main().catch((err) => {
  console.error('[seed:channels:tags] failed:', err);
  process.exitCode = 1;
});

