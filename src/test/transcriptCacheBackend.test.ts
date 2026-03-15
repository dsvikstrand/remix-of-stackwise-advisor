import { describe, expect, it } from 'vitest';
import {
  hydrateCachedTranscriptResult,
  readCachedTranscript,
  writeCachedTranscript,
} from '../../server/transcript/transcriptCache';

describe('transcriptCache', () => {
  it('hydrates cached rows back into transcript results with cache-hit trace metadata', () => {
    const result = hydrateCachedTranscriptResult({
      video_id: 'video123',
      transcript_text: 'cached transcript',
      transcript_source: 'youtube_timedtext',
      confidence: 0.9,
      segments_json: [{ text: 'segment one', startSec: 0, endSec: 2 }],
      provider_id: 'youtube_timedtext',
      transport_json: {
        provider: 'youtube_timedtext',
        proxy_enabled: false,
        proxy_mode: 'direct',
        proxy_selector: null,
        proxy_selected_index: null,
        proxy_host: null,
      },
      provider_trace_json: {
        attempted_providers: [
          {
            provider: 'videotranscriber_temp',
            ok: false,
            error_code: 'VIDEOTRANSCRIBER_DAILY_LIMIT',
            provider_debug: null,
          },
          {
            provider: 'youtube_timedtext',
            ok: true,
            error_code: null,
            provider_debug: null,
          },
        ],
        winning_provider: 'youtube_timedtext',
        used_fallback: true,
        session_value: 'sid_final123456',
        session_initial_value: 'sid_initial9876',
        session_mode: 'shared',
        session_rotated: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(result).toMatchObject({
      text: 'cached transcript',
      source: 'youtube_timedtext',
      confidence: 0.9,
      segments: [{ text: 'segment one', startSec: 0, endSec: 2 }],
      transport: {
        provider: 'youtube_timedtext',
        proxy_enabled: false,
        proxy_mode: 'direct',
      },
      provider_trace: {
        winning_provider: 'youtube_timedtext',
        used_fallback: true,
        cache_hit: true,
        cache_provider: 'youtube_timedtext',
        session_value: 'sid_final123456',
        session_initial_value: 'sid_initial9876',
        session_mode: 'shared',
        session_rotated: true,
      },
    });
  });

  it('treats legacy yt_to_text cache rows as unusable after provider retirement', () => {
    const result = hydrateCachedTranscriptResult({
      video_id: 'video123',
      transcript_text: 'legacy transcript',
      transcript_source: 'yt_to_text',
      confidence: null,
      segments_json: null,
      provider_id: 'yt_to_text',
      transport_json: {
        provider: 'yt_to_text',
        proxy_enabled: false,
        proxy_mode: 'direct',
        proxy_selector: null,
        proxy_selected_index: null,
        proxy_host: null,
      },
      provider_trace_json: {
        attempted_providers: [],
        winning_provider: 'yt_to_text',
        used_fallback: false,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(result).toBeNull();
  });

  it('reads cached transcripts from the database table', async () => {
    const db = {
      from(table: string) {
        expect(table).toBe('youtube_transcript_cache');
        return {
          select(columns: string) {
            expect(columns).toContain('transcript_text');
            return {
              eq(column: string, value: string) {
                expect(column).toBe('video_id');
                expect(value).toBe('video123');
                return {
                  maybeSingle: async () => ({
                    data: {
                      video_id: 'video123',
                      transcript_text: 'cached transcript',
                      transcript_source: 'youtube_timedtext',
                      confidence: null,
                      segments_json: null,
                      provider_id: 'youtube_timedtext',
                      transport_json: null,
                      provider_trace_json: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    };

    const result = await readCachedTranscript(db, 'video123');

    expect(result).toMatchObject({
      text: 'cached transcript',
      source: 'youtube_timedtext',
      provider_trace: {
        winning_provider: 'youtube_timedtext',
        cache_hit: true,
      },
    });
  });

  it('writes normalized transcript results into the cache table', async () => {
    const writes: Array<{ table: string; payload: unknown; onConflict: string }> = [];
    const db = {
      from(table: string) {
        return {
          upsert: async (payload: unknown, options: { onConflict: string }) => {
            writes.push({ table, payload, onConflict: options.onConflict });
            return { error: null };
          },
        };
      },
    };

    await writeCachedTranscript(db, 'video123', {
      text: 'fresh transcript',
      source: 'youtube_timedtext',
      confidence: null,
      transport: {
        provider: 'youtube_timedtext',
        proxy_enabled: false,
        proxy_mode: 'direct',
        proxy_selector: null,
        proxy_selected_index: null,
        proxy_host: null,
      },
      provider_trace: {
        attempted_providers: [],
        winning_provider: 'youtube_timedtext',
        used_fallback: false,
        session_value: 'sid_final123456',
        session_initial_value: 'sid_initial9876',
        session_mode: 'shared',
        session_rotated: false,
      },
    });

    expect(writes).toEqual([
      {
        table: 'youtube_transcript_cache',
        onConflict: 'video_id',
        payload: expect.objectContaining({
          video_id: 'video123',
          transcript_text: 'fresh transcript',
          transcript_source: 'youtube_timedtext',
          provider_id: 'youtube_timedtext',
          provider_trace_json: {
            attempted_providers: [],
            winning_provider: 'youtube_timedtext',
            used_fallback: false,
            session_value: 'sid_final123456',
            session_initial_value: 'sid_initial9876',
            session_mode: 'shared',
            session_rotated: false,
          },
        }),
      },
    ]);
  });

  it('skips cache writes for empty transcript text', async () => {
    let wrote = false;
    const db = {
      from() {
        return {
          upsert: async () => {
            wrote = true;
            return { error: null };
          },
        };
      },
    };

    await writeCachedTranscript(db, 'video123', {
      text: '   ',
      source: 'youtube_timedtext',
      confidence: null,
    });

    expect(wrote).toBe(false);
  });
});
