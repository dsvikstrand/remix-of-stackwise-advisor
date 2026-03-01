import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexExecError, runCodexExec } from '../../server/llm/codexExec';

const tempDirs: string[] = [];

async function makeFakeCodex(scriptBody: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-codex-'));
  tempDirs.push(dir);
  const scriptPath = path.join(dir, 'codex');
  await fs.writeFile(scriptPath, scriptBody, 'utf8');
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('codex exec', () => {
  it('writes and reads output message file', async () => {
    const fakeCodex = await makeFakeCodex(`#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--output-last-message');
const outPath = outIndex >= 0 ? args[outIndex + 1] : '';
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(outPath, JSON.stringify({ ok: true, prompt_chars: input.length }));
  process.exit(0);
});
`);

    const result = await runCodexExec({
      execPath: fakeCodex,
      model: 'gpt-test',
      reasoningEffort: 'low',
      timeoutMs: 5000,
      prompt: 'hello world',
    });

    expect(result.outputText).toContain('"ok":true');
  });

  it('classifies timeout failures', async () => {
    const fakeCodex = await makeFakeCodex(`#!/usr/bin/env node
setTimeout(() => process.exit(0), 2000);
`);

    await expect(runCodexExec({
      execPath: fakeCodex,
      model: 'gpt-test',
      reasoningEffort: 'low',
      timeoutMs: 100,
      prompt: 'timeout',
    })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('classifies rate-limit failures from process output', async () => {
    const fakeCodex = await makeFakeCodex(`#!/usr/bin/env node
console.error('rate limit reached');
process.exit(1);
`);

    let caught: unknown = null;
    try {
      await runCodexExec({
        execPath: fakeCodex,
        model: 'gpt-test',
        reasoningEffort: 'low',
        timeoutMs: 5000,
        prompt: 'x',
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CodexExecError);
    expect((caught as CodexExecError).code).toBe('RATE_LIMITED');
  });
});
