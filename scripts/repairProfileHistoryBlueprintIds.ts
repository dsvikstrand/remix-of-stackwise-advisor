import '../server/loadEnv';
import { createClient } from '@supabase/supabase-js';
import { repairProfileHistoryBlueprintIdsForUser, PROFILE_HISTORY_BLUEPRINT_STATES } from '../server/services/profileHistory';

function getRequiredEnv(name: string) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function readSupabaseUrl() {
  const value = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  if (!value) {
    throw new Error('Missing required env: VITE_SUPABASE_URL or SUPABASE_URL');
  }
  return value;
}

function parseArgs(argv: string[]) {
  const options: {
    userId: string | null;
    limit: number;
    dryRun: boolean;
  } = {
    userId: null,
    limit: 200,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '').trim();
    if (arg === '--user-id') {
      options.userId = String(argv[index + 1] || '').trim() || null;
      index += 1;
      continue;
    }
    if (arg === '--limit') {
      const numeric = Number(argv[index + 1] || '');
      if (Number.isFinite(numeric) && numeric > 0) {
        options.limit = Math.min(1000, Math.floor(numeric));
      }
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

async function listCandidateUserIds(db: ReturnType<typeof createClient>, limit: number) {
  const { data, error } = await db
    .from('user_feed_items')
    .select('user_id')
    .is('blueprint_id', null)
    .in('state', [...PROFILE_HISTORY_BLUEPRINT_STATES])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return Array.from(new Set(
    (data || [])
      .map((row) => String(row.user_id || '').trim())
      .filter(Boolean),
  ));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = createClient(
    readSupabaseUrl(),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  const targetUserIds = options.userId
    ? [options.userId]
    : await listCandidateUserIds(db, options.limit);

  const reports = [];
  for (const userId of targetUserIds) {
    const report = await repairProfileHistoryBlueprintIdsForUser({
      db,
      userId,
      limit: options.limit,
      dryRun: options.dryRun,
      normalizeTranscriptTruthStatus: (value: unknown) => String(value || '').trim().toLowerCase(),
    });
    reports.push(report);
  }

  console.log(JSON.stringify({
    dry_run: options.dryRun,
    limit: options.limit,
    target_user_count: targetUserIds.length,
    repaired_count: reports.reduce((sum, report) => sum + report.repairedCount, 0),
    unresolved_count: reports.reduce((sum, report) => sum + report.unresolvedCount, 0),
    reports,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
