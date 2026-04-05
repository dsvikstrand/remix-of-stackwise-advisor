import { describe, expect, it } from 'vitest';
import {
  pruneTranscriptForGeneration,
  readTranscriptPruningConfigFromEnv,
  type TranscriptPruningConfig,
} from '../../server/services/transcriptPruning';

function repeatChar(char: string, count: number) {
  return Array.from({ length: count }).fill(char).join('');
}

describe('transcriptPruning', () => {
  it('passes through under-budget transcripts', () => {
    const config: TranscriptPruningConfig = {
      enabled: true,
      budgetChars: 5000,
      thresholds: [5000, 9000, 16000],
      windows: [1, 4, 6, 8],
      separator: '\n\n...\n\n',
      minWindowChars: 120,
    };
    const transcript = `intro ${repeatChar('a', 1200)} outro`;
    const result = pruneTranscriptForGeneration({
      transcriptText: transcript,
      config,
    });

    expect(result.meta.applied).toBe(false);
    expect(result.meta.original_chars).toBe(result.meta.pruned_chars);
    expect(result.text.length).toBeLessThanOrEqual(5000);
  });

  it('selects dynamic window counts for each threshold bucket', () => {
    const config: TranscriptPruningConfig = {
      enabled: true,
      budgetChars: 5000,
      thresholds: [5000, 9000, 16000],
      windows: [1, 4, 6, 8],
      separator: '\n\n...\n\n',
      minWindowChars: 120,
    };

    const medium = pruneTranscriptForGeneration({
      transcriptText: repeatChar('m', 7000),
      config,
    });
    const long = pruneTranscriptForGeneration({
      transcriptText: repeatChar('l', 12000),
      config,
    });
    const xlong = pruneTranscriptForGeneration({
      transcriptText: repeatChar('x', 20000),
      config,
    });

    expect(medium.meta.window_count).toBe(4);
    expect(long.meta.window_count).toBe(6);
    expect(xlong.meta.window_count).toBe(8);
  });

  it('keeps output within budget and retains first/last timeline coverage', () => {
    const config: TranscriptPruningConfig = {
      enabled: true,
      budgetChars: 5000,
      thresholds: [5000, 9000, 16000],
      windows: [1, 4, 6, 8],
      separator: '\n\n...\n\n',
      minWindowChars: 120,
    };
    const transcript = [
      'BEGIN_SENTINEL',
      repeatChar('a', 10000),
      'MID_SENTINEL',
      repeatChar('b', 10000),
      'END_SENTINEL',
    ].join(' ');

    const result = pruneTranscriptForGeneration({
      transcriptText: transcript,
      config,
    });

    expect(result.meta.applied).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(5000);
    expect(result.text.includes('BEGIN_SENTINEL')).toBe(true);
    expect(result.text.includes('END_SENTINEL')).toBe(true);
  });

  it('falls back to safe defaults on malformed env parsing', () => {
    const parsed = readTranscriptPruningConfigFromEnv({
      YT2BP_TRANSCRIPT_PRUNE_ENABLED: 'true',
      YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS: 'not-a-number',
      YT2BP_TRANSCRIPT_PRUNE_THRESHOLDS: '5000,9000',
      YT2BP_TRANSCRIPT_PRUNE_WINDOWS: '2,three,7',
    });

    expect(parsed.config.enabled).toBe(true);
    expect(parsed.config.budgetChars).toBe(5000);
    expect(parsed.config.thresholds).toEqual([5000, 9000, 16000]);
    expect(parsed.config.windows).toEqual([1, 4, 6, 8]);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});
