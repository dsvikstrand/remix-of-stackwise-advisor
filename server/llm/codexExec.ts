import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export type CodexExecErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTH'
  | 'MODEL_UNAVAILABLE'
  | 'INVALID_OUTPUT'
  | 'PROCESS_FAIL';

export class CodexExecError extends Error {
  code: CodexExecErrorCode;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;

  constructor(input: {
    code: CodexExecErrorCode;
    message: string;
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
    durationMs?: number;
  }) {
    super(input.message);
    this.code = input.code;
    this.exitCode = input.exitCode ?? null;
    this.stdout = input.stdout || '';
    this.stderr = input.stderr || '';
    this.durationMs = Number.isFinite(Number(input.durationMs)) ? Math.max(0, Number(input.durationMs)) : 0;
  }
}

export async function runCodexExec(input: {
  prompt: string;
  model: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  timeoutMs: number;
  execPath?: string;
  cwd?: string;
}) {
  const startedAt = Date.now();
  const execPath = String(input.execPath || 'codex').trim() || 'codex';
  const timeoutMs = Number.isFinite(Number(input.timeoutMs)) ? Math.max(1000, Math.floor(Number(input.timeoutMs))) : 90_000;
  const prompt = String(input.prompt || '');
  const model = String(input.model || '').trim();
  const effort = normalizeReasoningEffort(input.reasoningEffort);
  if (!model) {
    throw new CodexExecError({
      code: 'MODEL_UNAVAILABLE',
      message: 'Codex model is not configured.',
    });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-exec-'));
  const outputPath = path.join(tempDir, 'last_message.txt');
  const args = [
    'exec',
    '-m',
    model,
    '-c',
    `model_reasoning_effort="${effort}"`,
    '--color',
    'never',
    '--output-last-message',
    outputPath,
    '-',
  ];

  let stdout = '';
  let stderr = '';
  let timedOut = false;

  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(execPath, args, {
        cwd: input.cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk || '');
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk || '');
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve(code);
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });

    const durationMs = Date.now() - startedAt;
    if (timedOut) {
      throw new CodexExecError({
        code: 'TIMEOUT',
        message: `Codex timed out after ${timeoutMs}ms.`,
        exitCode,
        stdout,
        stderr,
        durationMs,
      });
    }
    if (exitCode !== 0) {
      throw new CodexExecError({
        code: classifyProcessError(`${stdout}\n${stderr}`),
        message: `Codex exited with code ${exitCode}.`,
        exitCode,
        stdout,
        stderr,
        durationMs,
      });
    }

    let outputText = '';
    try {
      outputText = String(await fs.readFile(outputPath, 'utf8') || '').trim();
    } catch {
      outputText = '';
    }
    if (!outputText) {
      throw new CodexExecError({
        code: 'INVALID_OUTPUT',
        message: 'Codex returned empty output.',
        exitCode,
        stdout,
        stderr,
        durationMs,
      });
    }

    return {
      outputText,
      stdout,
      stderr,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof CodexExecError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CodexExecError({
      code: classifyProcessError(message),
      message,
      stdout,
      stderr,
      durationMs,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function normalizeReasoningEffort(raw: unknown): 'none' | 'low' | 'medium' | 'high' | 'xhigh' {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'none') return 'none';
  if (normalized === 'low') return 'low';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'high') return 'high';
  if (normalized === 'xhigh') return 'xhigh';
  return 'low';
}

function classifyProcessError(text: string): CodexExecErrorCode {
  const normalized = String(text || '').toLowerCase();
  if (normalized.includes('timed out') || normalized.includes('timeout')) return 'TIMEOUT';
  if (normalized.includes('rate limit') || normalized.includes('429')) return 'RATE_LIMITED';
  if (normalized.includes('unauthorized') || normalized.includes('authentication') || normalized.includes('login')) return 'AUTH';
  if (
    normalized.includes('model')
    && (
      normalized.includes('not found')
      || normalized.includes('does not exist')
      || normalized.includes('unsupported')
    )
  ) {
    return 'MODEL_UNAVAILABLE';
  }
  return 'PROCESS_FAIL';
}
