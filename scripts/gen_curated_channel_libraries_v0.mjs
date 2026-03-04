import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'docs', 'generated', 'curated_libraries_v0');

// Keep this file standalone (no TS build needed).
const channelsCatalogPath = path.join(root, 'src', 'lib', 'channelsCatalog.ts');
const catalogSrc = fs.readFileSync(channelsCatalogPath, 'utf8');

// Minimal parser: extract objects from CHANNELS_CATALOG by looking for "slug:" blocks.
// We only need slug/name/description/isJoinEnabled/status.
const channelBlocks = catalogSrc.split(/\n\s*\{\n/).slice(1);
const channels = [];
for (const block of channelBlocks) {
  const slug = (block.match(/\bslug:\s*'([^']+)'/) || [])[1];
  const name = (block.match(/\bname:\s*'([^']+)'/) || [])[1];
  const description = (block.match(/\bdescription:\s*'([^']+)'/) || [])[1];
  const status = (block.match(/\bstatus:\s*'([^']+)'/) || [])[1];
  const isJoinEnabled = (block.match(/\bisJoinEnabled:\s*(true|false)/) || [])[1];
  if (!slug || !name) continue;
  channels.push({ slug, name, description: description || '', status: status || 'active', isJoinEnabled: isJoinEnabled === 'true' });
}

function pickTemplate(slug) {
  const t = {
    categories: [
      { name: 'Setup', items: ['Define your goal', 'Pick a baseline schedule', 'Choose a simple success metric', 'Remove one friction point', 'Set a weekly review time'] },
      { name: 'Starter Routine', items: ['Do the smallest useful version', 'Track results for 7 days', 'Adjust one variable', 'Repeat with consistency', 'Write a short note on what worked'] },
      { name: 'Common Pitfalls', items: ['Too many changes at once', 'No clear constraint', 'No feedback loop', 'Over-optimizing early', 'Skipping the review'] },
    ],
  };

  const map = {
    'fitness-training': {
      categories: [
        { name: 'Warm-up', items: ['5 min brisk walk', 'Dynamic hips/shoulders', '2 light ramp sets', 'Breathing reset (60s)', 'Joint check-in'] },
        { name: 'Core Lifts', items: ['Squat pattern', 'Hinge pattern', 'Push pattern', 'Pull pattern', 'Carry pattern'] },
        { name: 'Progress', items: ['Pick 3 main lifts', 'Add 1 rep per week', 'Deload every 4th week', 'Log sets/reps', 'Sleep + protein baseline'] },
      ],
    },
    'nutrition-meal-planning': {
      categories: [
        { name: 'Weekly Plan', items: ['Pick 2 core meals', 'Write a grocery list', 'Choose a protein anchor', 'Plan 1 snack option', 'Schedule 1 prep block'] },
        { name: 'Meal Prep', items: ['Batch cook protein', 'Prep 2 vegetables', 'Cook 1 carb base', 'Make 1 sauce', 'Portion 3 containers'] },
        { name: 'Consistency', items: ['Default breakfast', 'Water + salt baseline', 'Track 1 metric', 'Repeat staples', 'Avoid decision fatigue'] },
      ],
    },
    'sleep-recovery': {
      categories: [
        { name: 'Evening Wind-Down', items: ['Screens off 30 min', 'Dim lights', 'Hot shower', 'Light stretch', 'Read 10 min'] },
        { name: 'Sleep Environment', items: ['Cool room', 'Dark room', 'White noise', 'Phone out of reach', 'Same wake time'] },
        { name: 'Recovery', items: ['Walk after meals', 'Sunlight in AM', 'Caffeine cutoff', 'Short nap rules', 'Weekly reset day'] },
      ],
    },
    'skincare-personal-care': {
      categories: [
        { name: 'AM Routine', items: ['Gentle cleanse', 'Moisturizer', 'Sunscreen', 'Lip balm', 'Optional vitamin C'] },
        { name: 'PM Routine', items: ['Cleanse', 'Hydrate', 'Targeted active (2-3x/week)', 'Moisturizer', 'Barrier check'] },
        { name: 'Basics', items: ['Patch test', 'Introduce one change/week', 'Avoid over-exfoliation', 'Track irritation', 'Replace products slowly'] },
      ],
    },
    'productivity-systems': {
      categories: [
        { name: 'Daily', items: ['Top 3 tasks', 'Time block 60-90 min', 'Single inbox sweep', 'Shutdown ritual', 'Capture loose tasks'] },
        { name: 'Weekly', items: ['Review calendar', 'Plan next week', 'Clear inbox', 'Pick one project focus', 'Reflect 10 min'] },
        { name: 'Focus', items: ['Reduce notifications', 'Single-task rule', 'Pomodoro option', 'Energy-based scheduling', 'Define done'] },
      ],
    },
    'developer-workflows': {
      categories: [
        { name: 'Repo Setup', items: ['Install deps', 'Run tests', 'Lint/format', 'Env template', 'Local dev boot'] },
        { name: 'PR Hygiene', items: ['Small diffs', 'Clear title', 'Test notes', 'Screenshots (UI)', 'Rollback note'] },
        { name: 'Daily Loop', items: ['Pick one task', 'Write failing check', 'Implement', 'Run build', 'Ship'] },
      ],
    },
  };

  if (map[slug]) return map[slug];
  return t;
}

function toPromptCategories(categories) {
  return categories.map((c) => c.name).join(', ');
}

function buildInventory(channel) {
  const tpl = pickTemplate(channel.slug);
  const title = `Starter Library: ${channel.name}`;
  const summary = channel.description || `A starter library for ${channel.name}.`;
  return {
    channel_slug: channel.slug,
    title,
    prompt_inventory: summary,
    prompt_categories: toPromptCategories(tpl.categories),
    generated_schema: { summary, categories: tpl.categories },
    review_sections: ['Strengths', 'Gaps', 'Suggestions'],
    include_score: true,
    is_public: true,
    tags: [channel.slug],
  };
}

const curated = channels
  .filter((c) => c.slug !== 'general')
  .filter((c) => c.status === 'active')
  .filter((c) => c.isJoinEnabled);

const outputs = [];
fs.mkdirSync(outDir, { recursive: true });
for (const channel of curated) {
  const inventory = buildInventory(channel);
  outputs.push(inventory);
  const outPath = path.join(outDir, `${channel.slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2) + '\n', 'utf8');
}

fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ version: 1, generated_at: new Date().toISOString(), inventories: outputs }, null, 2) + '\n', 'utf8');

console.log(`wrote ${outputs.length} inventories to ${path.relative(root, outDir)}`);
