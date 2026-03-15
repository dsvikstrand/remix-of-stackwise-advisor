import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildYouTubeBlueprintUserPrompt } from '../../server/llm/prompts';

describe('YouTube prompt POS references', () => {
  it('only accepts positive reference files from the configured pos directory', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yt2bp-pos-ref-'));
    const posDir = path.join(tmpRoot, 'pos');
    const outsideDir = path.join(tmpRoot, 'outside');
    fs.mkdirSync(posDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    const allowedPath = path.join(posDir, 'allowed.md');
    const blockedPath = path.join(outsideDir, 'blocked.md');
    fs.writeFileSync(allowedPath, 'allowed reference content', 'utf8');
    fs.writeFileSync(blockedPath, 'blocked reference content', 'utf8');

    const prevEnabled = process.env.YT2BP_POS_REF_ENABLED;
    const prevMaxFiles = process.env.YT2BP_POS_REF_MAX_FILES;
    process.env.YT2BP_POS_REF_ENABLED = 'true';
    process.env.YT2BP_POS_REF_MAX_FILES = '-1';

    try {
      const prompt = buildYouTubeBlueprintUserPrompt({
        videoUrl: 'https://www.youtube.com/watch?v=abc123xyz00',
        videoTitle: 'Sample',
        transcriptSource: 'videotranscriber_temp',
        transcript: 'Transcript content.',
        oraclePosDir: posDir,
        positiveReferencePaths: [blockedPath, allowedPath],
      });

      expect(prompt.includes(allowedPath)).toBe(true);
      expect(prompt.includes(blockedPath)).toBe(false);
      expect(prompt.includes('allowed reference content')).toBe(true);
      expect(prompt.includes('blocked reference content')).toBe(false);
    } finally {
      if (prevEnabled == null) delete process.env.YT2BP_POS_REF_ENABLED;
      else process.env.YT2BP_POS_REF_ENABLED = prevEnabled;
      if (prevMaxFiles == null) delete process.env.YT2BP_POS_REF_MAX_FILES;
      else process.env.YT2BP_POS_REF_MAX_FILES = prevMaxFiles;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
