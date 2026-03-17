import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { ensureDir, getEnvValue, readDotEnv, sanitizeFilePart, type ProbeCase } from './shared';

type TranscriptRow = {
  video_id: string;
  transcript_text: string;
  transcript_source: string;
  updated_at: string;
};

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const read = (flag: string, fallback: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() || fallback : fallback;
  };
  const readAll = (flag: string) => {
    const values: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === flag) {
        const next = String(args[i + 1] || '').trim();
        if (next) values.push(next);
      }
    }
    return values;
  };
  return {
    out: read('--out', path.resolve(process.cwd(), 'eval/yt2bp-model-probe/cases.local.json')),
    count: Math.max(1, Number.parseInt(read('--count', '9'), 10) || 9),
    limit: Math.max(20, Number.parseInt(read('--limit', '250'), 10) || 250),
    minChars: Math.max(100, Number.parseInt(read('--min-chars', '700'), 10) || 700),
    includeVideos: readAll('--include-video'),
  };
}

function classifyBucket(chars: number) {
  if (chars < 1800) return 'short';
  if (chars < 5000) return 'medium';
  if (chars < 10000) return 'long';
  return 'xlong';
}

function buildCaseId(index: number, videoId: string) {
  const ordinal = String(index + 1).padStart(2, '0');
  return `case_${ordinal}_${sanitizeFilePart(videoId)}`;
}

function toProbeCase(row: TranscriptRow, index: number): ProbeCase {
  const transcript = String(row.transcript_text || '').trim();
  return {
    case_id: buildCaseId(index, row.video_id),
    video_id: row.video_id,
    video_url: `https://www.youtube.com/watch?v=${row.video_id}`,
    video_title: `YouTube video (${row.video_id})`,
    transcript_source: String(row.transcript_source || '').trim() || 'unknown',
    transcript_chars: transcript.length,
    updated_at: String(row.updated_at || '').trim() || new Date().toISOString(),
    transcript,
  };
}

async function main() {
  const { out, count, limit, minChars, includeVideos } = parseArgs(process.argv);
  const dotEnv = readDotEnv();
  const supabaseUrl = getEnvValue(dotEnv, 'SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = getEnvValue(dotEnv, 'SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('youtube_transcript_cache')
    .select('video_id, transcript_text, transcript_source, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const allRows = ((data || []) as TranscriptRow[])
    .map((row) => ({
      ...row,
      transcript_text: String(row.transcript_text || '').trim(),
      transcript_source: String(row.transcript_source || '').trim(),
      updated_at: String(row.updated_at || '').trim(),
    }))
    .filter((row) => row.video_id && row.transcript_text.length > 0);

  const rows = allRows.filter((row) => row.transcript_text.length >= minChars);

  if (rows.length < count) {
    throw new Error(`Only found ${rows.length} transcripts with at least ${minChars} chars.`);
  }

  const selected: TranscriptRow[] = [];
  const seen = new Set<string>();

  let includeRows: TranscriptRow[] = [];
  if (includeVideos.length > 0) {
    const { data: explicitData, error: explicitError } = await supabase
      .from('youtube_transcript_cache')
      .select('video_id, transcript_text, transcript_source, updated_at')
      .in('video_id', includeVideos);
    if (explicitError) throw explicitError;
    includeRows = ((explicitData || []) as TranscriptRow[])
      .map((row) => ({
        ...row,
        transcript_text: String(row.transcript_text || '').trim(),
        transcript_source: String(row.transcript_source || '').trim(),
        updated_at: String(row.updated_at || '').trim(),
      }))
      .filter((row) => row.video_id && row.transcript_text.length > 0);
  }

  for (const videoId of includeVideos) {
    const hit = includeRows.find((row) => row.video_id === videoId) || allRows.find((row) => row.video_id === videoId);
    if (hit && !seen.has(hit.video_id)) {
      selected.push(hit);
      seen.add(hit.video_id);
    }
  }

  const buckets = new Map<string, TranscriptRow[]>();
  for (const row of rows) {
    if (seen.has(row.video_id)) continue;
    const key = classifyBucket(row.transcript_text.length);
    const bucket = buckets.get(key) || [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const bucketOrder = ['short', 'medium', 'long', 'xlong'];
  while (selected.length < count) {
    let madeProgress = false;
    for (const bucketKey of bucketOrder) {
      if (selected.length >= count) break;
      const bucket = buckets.get(bucketKey) || [];
      const next = bucket.shift();
      if (!next) continue;
      if (seen.has(next.video_id)) continue;
      selected.push(next);
      seen.add(next.video_id);
      madeProgress = true;
    }
    if (!madeProgress) break;
  }

  if (selected.length < count) {
    throw new Error(`Unable to assemble ${count} unique transcript cases from the current cache sample.`);
  }

  const probeCases = selected.slice(0, count).map((row, index) => toProbeCase(row, index));
  ensureDir(path.dirname(out));
  fs.writeFileSync(out, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    source: 'youtube_transcript_cache',
    cases: probeCases,
  }, null, 2)}\n`, 'utf8');

  const bucketSummary = probeCases.reduce<Record<string, number>>((acc, item) => {
    const bucket = classifyBucket(item.transcript_chars);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    out,
    count: probeCases.length,
    include_videos_requested: includeVideos,
    selected_video_ids: probeCases.map((item) => item.video_id),
    bucket_summary: bucketSummary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
