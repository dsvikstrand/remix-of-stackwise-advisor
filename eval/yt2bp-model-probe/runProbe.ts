import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { buildYouTubeBlueprintUserPrompt, YOUTUBE_BLUEPRINT_SYSTEM_PROMPT } from '../../server/llm/prompts';
import { getOpenAIConstructor } from '../../server/llm/openaiRuntime';
import {
  BlueprintJsonInvalidError,
  isBlueprintJsonInvalidError,
  parseBlueprintJsonOutput,
  type BlueprintJsonFailureClass,
} from '../../server/llm/blueprintJsonGuard';
import { ensureDir, getEnvValue, readDotEnv, sanitizeFilePart, writeJson, type ProbeCase, type ProbeCaseFile } from './shared';

const EVAL_PROMPT_TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'docs/golden_blueprint/golden_bp_prompt_contract_one_step_eval_v1.md',
);

const BlueprintValidator = z.object({
  schema_version: z.literal('blueprint_sections_v1'),
  tags: z.array(z.string()).optional(),
  summary: z.object({ text: z.string() }),
  takeaways: z.object({ bullets: z.array(z.string()) }),
  storyline: z.object({ text: z.string() }),
  deep_dive: z.object({ bullets: z.array(z.string()) }),
  practical_rules: z.object({ bullets: z.array(z.string()) }),
  open_questions: z.object({ bullets: z.array(z.string()) }),
});

const RETRY_INSTRUCTION = [
  'RETRY REQUIREMENT:',
  'Return strict valid JSON only.',
  'Do not include markdown fences or commentary.',
  'Ensure all required keys are present, including storyline.',
  'Ensure all arrays and objects are syntactically complete.',
].join(' ');

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
type RunMode = 'quality-set' | 'latency-pair';
type VariantLabel = 'standard' | 'flex';

type AttemptRecord = {
  attempt: number;
  variant: VariantLabel;
  duration_ms: number;
  service_tier: 'flex' | null;
  prompt_chars: number;
  valid: boolean;
  failure_class: BlueprintJsonFailureClass | null;
  failure_detail: string | null;
  raw_output_file: string;
  parsed_output_file: string | null;
};

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const read = (flag: string, fallback: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() || fallback : fallback;
  };
  return {
    mode: (read('--mode', 'quality-set') as RunMode),
    casesPath: path.resolve(process.cwd(), read('--cases', 'eval/yt2bp-model-probe/cases.local.json')),
    outDir: path.resolve(process.cwd(), read('--out-dir', 'eval/yt2bp-model-probe/output')),
    model: read('--model', 'gpt-5.4-mini'),
    serviceTier: read('--service-tier', 'flex'),
    reasoning: (read('--reasoning', 'low') as ReasoningEffort),
    attempts: Math.max(1, Number.parseInt(read('--attempts', '2'), 10) || 2),
    caseIds: read('--case-ids', '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
    latencyLimit: Math.max(1, Number.parseInt(read('--latency-limit', '2'), 10) || 2),
  };
}

function loadCases(casesPath: string) {
  const parsed = JSON.parse(fs.readFileSync(casesPath, 'utf8')) as ProbeCaseFile;
  if (!parsed || !Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error(`No cases found in ${casesPath}`);
  }
  return parsed;
}

function selectCases(allCases: ProbeCase[], caseIds: string[], limit: number) {
  if (caseIds.length > 0) {
    const chosen = allCases.filter((item) => caseIds.includes(item.case_id) || caseIds.includes(item.video_id));
    if (chosen.length === 0) {
      throw new Error(`No cases matched --case-ids: ${caseIds.join(', ')}`);
    }
    return chosen;
  }
  return allCases.slice(0, limit);
}

function buildRunId(mode: RunMode, model: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${sanitizeFilePart(mode)}-${sanitizeFilePart(model)}`;
}

function summarizeValidShape(value: z.infer<typeof BlueprintValidator>) {
  return {
    schema_version: value.schema_version,
    tag_count: Array.isArray(value.tags) ? value.tags.length : 0,
    takeaway_count: value.takeaways.bullets.length,
    deep_dive_count: value.deep_dive.bullets.length,
    practical_rules_count: value.practical_rules.bullets.length,
    open_questions_count: value.open_questions.bullets.length,
    summary_chars: value.summary.text.length,
    storyline_chars: value.storyline.text.length,
  };
}

async function runSingleAttempt(input: {
  client: InstanceType<ReturnType<typeof getOpenAIConstructor>>;
  probeCase: ProbeCase;
  model: string;
  reasoning: ReasoningEffort;
  serviceTier: 'flex' | null;
  prompt: string;
  runDir: string;
  variant: VariantLabel;
  attempt: number;
}) {
  const caseDir = ensureDir(path.join(input.runDir, sanitizeFilePart(input.probeCase.case_id)));
  const attemptBase = `${input.variant}-attempt-${String(input.attempt).padStart(2, '0')}`;
  const started = Date.now();
  const response = await input.client.responses.create({
    model: input.model,
    instructions: YOUTUBE_BLUEPRINT_SYSTEM_PROMPT,
    input: input.prompt,
    ...(input.reasoning !== 'none' ? { reasoning: { effort: input.reasoning } } : {}),
    ...(input.serviceTier ? { service_tier: input.serviceTier } : {}),
  });
  const durationMs = Date.now() - started;
  const outputText = String(response.output_text || '').trim();
  const rawOutputFile = path.join(caseDir, `${attemptBase}.raw.txt`);
  fs.writeFileSync(rawOutputFile, outputText, 'utf8');

  try {
    const parsed = parseBlueprintJsonOutput({
      rawText: outputText,
      validator: BlueprintValidator,
    });
    const parsedOutputFile = path.join(caseDir, `${attemptBase}.parsed.json`);
    writeJson(parsedOutputFile, parsed);
    return {
      attempt: input.attempt,
      variant: input.variant,
      duration_ms: durationMs,
      service_tier: input.serviceTier,
      prompt_chars: input.prompt.length,
      valid: true,
      failure_class: null,
      failure_detail: null,
      raw_output_file: path.relative(process.cwd(), rawOutputFile),
      parsed_output_file: path.relative(process.cwd(), parsedOutputFile),
      parsed,
    };
  } catch (error) {
    const parsedOutputFile = path.join(caseDir, `${attemptBase}.error.json`);
    if (isBlueprintJsonInvalidError(error)) {
      writeJson(parsedOutputFile, {
        code: error.code,
        failure_class: error.failureClass,
        detail: error.detail,
        raw_excerpt: error.rawExcerpt,
      });
      return {
        attempt: input.attempt,
        variant: input.variant,
        duration_ms: durationMs,
        service_tier: input.serviceTier,
        prompt_chars: input.prompt.length,
        valid: false,
        failure_class: error.failureClass,
        failure_detail: error.detail,
        raw_output_file: path.relative(process.cwd(), rawOutputFile),
        parsed_output_file: path.relative(process.cwd(), parsedOutputFile),
        parsed: null,
      };
    }
    writeJson(parsedOutputFile, {
      code: 'UNEXPECTED_ERROR',
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function runQualitySet(input: {
  runDir: string;
  cases: ProbeCase[];
  model: string;
  reasoning: ReasoningEffort;
  serviceTier: 'flex' | null;
  attempts: number;
}) {
  const OpenAI = getOpenAIConstructor();
  const dotEnv = readDotEnv();
  const apiKey = getEnvValue(dotEnv, 'OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing.');
  const client = new OpenAI({ apiKey });
  const localPosDir = path.resolve(process.cwd(), 'docs/golden_blueprint/reddit/clean/pos');
  const casesSummary = [];

  for (const probeCase of input.cases) {
    const basePrompt = buildYouTubeBlueprintUserPrompt({
      videoUrl: probeCase.video_url,
      videoTitle: probeCase.video_title,
      transcriptSource: probeCase.transcript_source,
      transcript: probeCase.transcript,
      promptTemplatePath: EVAL_PROMPT_TEMPLATE_PATH,
      oraclePosDir: localPosDir,
    });
    const attempts: AttemptRecord[] = [];
    let finalStatus: 'valid' | 'failed' = 'failed';
    let finalFailure: string | null = null;

    for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
      const prompt = attempt === 1 ? basePrompt : `${basePrompt}\n\n${RETRY_INSTRUCTION}`;
      // eslint-disable-next-line no-await-in-loop
      const result = await runSingleAttempt({
        client,
        probeCase,
        model: input.model,
        reasoning: input.reasoning,
        serviceTier: input.serviceTier,
        prompt,
        runDir: input.runDir,
        variant: 'flex',
        attempt,
      });
      attempts.push({
        attempt: result.attempt,
        variant: result.variant,
        duration_ms: result.duration_ms,
        service_tier: result.service_tier,
        prompt_chars: result.prompt_chars,
        valid: result.valid,
        failure_class: result.failure_class,
        failure_detail: result.failure_detail,
        raw_output_file: result.raw_output_file,
        parsed_output_file: result.parsed_output_file,
      });
      if (result.valid && result.parsed) {
        finalStatus = 'valid';
        finalFailure = null;
        break;
      }
      finalFailure = result.failure_detail || result.failure_class || 'unknown';
    }

    const validAttempt = attempts.find((entry) => entry.valid);
    const parsedPath = validAttempt?.parsed_output_file
      ? path.resolve(process.cwd(), validAttempt.parsed_output_file)
      : null;
    const parsedSummary = parsedPath && fs.existsSync(parsedPath)
      ? summarizeValidShape(JSON.parse(fs.readFileSync(parsedPath, 'utf8')) as z.infer<typeof BlueprintValidator>)
      : null;

    casesSummary.push({
      case_id: probeCase.case_id,
      video_id: probeCase.video_id,
      transcript_source: probeCase.transcript_source,
      transcript_chars: probeCase.transcript_chars,
      final_status: finalStatus,
      attempts,
      final_failure: finalFailure,
      parsed_summary: parsedSummary,
    });
  }

  const successCount = casesSummary.filter((item) => item.final_status === 'valid').length;
  const failureBreakdown = casesSummary.reduce<Record<string, number>>((acc, item) => {
    if (item.final_status === 'valid') return acc;
    const key = String(item.final_failure || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    mode: 'quality-set',
    model: input.model,
    service_tier: input.serviceTier,
    case_count: input.cases.length,
    success_count: successCount,
    failure_count: input.cases.length - successCount,
    failure_breakdown: failureBreakdown,
    cases: casesSummary,
  };
}

async function runLatencyPair(input: {
  runDir: string;
  cases: ProbeCase[];
  model: string;
  reasoning: ReasoningEffort;
}) {
  const OpenAI = getOpenAIConstructor();
  const dotEnv = readDotEnv();
  const apiKey = getEnvValue(dotEnv, 'OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing.');
  const client = new OpenAI({ apiKey });
  const localPosDir = path.resolve(process.cwd(), 'docs/golden_blueprint/reddit/clean/pos');
  const casesSummary = [];

  for (const probeCase of input.cases) {
    const prompt = buildYouTubeBlueprintUserPrompt({
      videoUrl: probeCase.video_url,
      videoTitle: probeCase.video_title,
      transcriptSource: probeCase.transcript_source,
      transcript: probeCase.transcript,
      promptTemplatePath: EVAL_PROMPT_TEMPLATE_PATH,
      oraclePosDir: localPosDir,
    });

    // eslint-disable-next-line no-await-in-loop
    const standard = await runSingleAttempt({
      client,
      probeCase,
      model: input.model,
      reasoning: input.reasoning,
      serviceTier: null,
      prompt,
      runDir: input.runDir,
      variant: 'standard',
      attempt: 1,
    });
    // eslint-disable-next-line no-await-in-loop
    const flex = await runSingleAttempt({
      client,
      probeCase,
      model: input.model,
      reasoning: input.reasoning,
      serviceTier: 'flex',
      prompt,
      runDir: input.runDir,
      variant: 'flex',
      attempt: 1,
    });

    casesSummary.push({
      case_id: probeCase.case_id,
      video_id: probeCase.video_id,
      transcript_chars: probeCase.transcript_chars,
      prompt_chars: prompt.length,
      standard: {
        duration_ms: standard.duration_ms,
        valid: standard.valid,
        failure_class: standard.failure_class,
        failure_detail: standard.failure_detail,
        raw_output_file: standard.raw_output_file,
      },
      flex: {
        duration_ms: flex.duration_ms,
        valid: flex.valid,
        failure_class: flex.failure_class,
        failure_detail: flex.failure_detail,
        raw_output_file: flex.raw_output_file,
      },
      duration_delta_ms: flex.duration_ms - standard.duration_ms,
    });
  }

  return {
    mode: 'latency-pair',
    model: input.model,
    case_count: input.cases.length,
    cases: casesSummary,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const caseFile = loadCases(args.casesPath);
  const runId = buildRunId(args.mode, args.model);
  const runDir = ensureDir(path.join(args.outDir, runId));
  const selectedCases = args.mode === 'latency-pair'
    ? selectCases(caseFile.cases, args.caseIds, args.latencyLimit)
    : selectCases(caseFile.cases, args.caseIds, caseFile.cases.length);

  const summary = args.mode === 'latency-pair'
    ? await runLatencyPair({
      runDir,
      cases: selectedCases,
      model: args.model,
      reasoning: args.reasoning,
    })
    : await runQualitySet({
      runDir,
      cases: selectedCases,
      model: args.model,
      reasoning: args.reasoning,
      serviceTier: args.serviceTier === 'flex' ? 'flex' : null,
      attempts: args.attempts,
    });

  writeJson(path.join(runDir, 'summary.json'), {
    run_id: runId,
    generated_at: new Date().toISOString(),
    cases_path: path.relative(process.cwd(), args.casesPath),
    ...summary,
  });

  console.log(JSON.stringify({
    run_id: runId,
    run_dir: path.relative(process.cwd(), runDir),
    mode: args.mode,
    model: args.model,
    case_count: selectedCases.length,
    summary_file: path.relative(process.cwd(), path.join(runDir, 'summary.json')),
  }, null, 2));
}

main().catch((error) => {
  if (error instanceof BlueprintJsonInvalidError) {
    console.error(JSON.stringify({
      code: error.code,
      failure_class: error.failureClass,
      detail: error.detail,
      raw_excerpt: error.rawExcerpt,
    }, null, 2));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
});
