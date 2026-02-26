import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);

function parseTargetDir(argv) {
  const dirFlagIndex = argv.findIndex((arg) => arg === '--dir');
  if (dirFlagIndex >= 0) {
    const value = argv[dirFlagIndex + 1];
    if (!value) {
      throw new Error('Missing value for --dir');
    }
    return value;
  }
  const inline = argv.find((arg) => arg.startsWith('--dir='));
  if (inline) {
    const value = inline.slice('--dir='.length);
    if (!value) {
      throw new Error('Missing value for --dir');
    }
    return value;
  }
  return 'reddit';
}

const targetDirArg = parseTargetDir(args);
const REDDIT_DIR = path.isAbsolute(targetDirArg)
  ? targetDirArg
  : path.join(ROOT, targetDirArg);
const BACKUP_DIR = path.join(REDDIT_DIR, '_raw_backup');
const REPORT_PATH = path.join(REDDIT_DIR, '_clean_report.md');

const COMMENT_MARKER_RE = /(\[!\[u\/|\bu\/[A-Za-z0-9_\-]+|More replies|Join the conversation|\/user\/[A-Za-z0-9_\-]+|redditstatic\.com\/avatars|styles\.redditmedia\.com\/.*profileIcon)/i;
const HARD_DROP_LINE_RE = [
  /chrome-extension:\/\//i,
  /^\s*Join the conversation\s*$/i,
  /^\s*Discussion\s*$/i,
  /^\s*R\s*$/i,
  /^\s*📜\s*Write Up\s*$/i,
  /^\s*Share\s*$/i,
  /^\s*Comment deleted by user\s*$/i,
  /^\s*\[More replies\]\(/i,
  /^\s*\[!\[u\//i,
  /^\s*\[!\[r\//i,
  /^\s*\[(?:!\[)?u\/[A-Za-z0-9_\-]+/i,
  /^\s*\]\(https?:\/\/www\.reddit\.com\/r\//i,
  /^\s*\]\(https?:\/\/www\.reddit\.com\/user\//i,
  /^\s*\[\s*$/,
  /^\s*\]\([^)]*\)\s*$/,
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeLines(raw) {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function countMatches(text, re) {
  const m = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`));
  return m ? m.length : 0;
}

function removeObviousNoise(lines) {
  const kept = [];
  for (const line of lines) {
    let drop = false;
    for (const re of HARD_DROP_LINE_RE) {
      if (re.test(line)) {
        drop = true;
        break;
      }
    }
    if (!drop) kept.push(line);
  }
  return kept;
}

function dropCommentQuoteBlocks(lines) {
  const out = [];
  for (const line of lines) {
    // Remove quote-style reply lines commonly present in comment dumps.
    if (/^\s*>\s/.test(line)) continue;
    out.push(line);
  }
  return out;
}

function collapseWhitespace(lines) {
  const out = [];
  let prevBlank = true;
  for (const rawLine of lines) {
    const line = rawLine.replace(/[ \t]+$/g, '');
    const isBlank = line.trim() === '';
    if (isBlank) {
      if (!prevBlank) out.push('');
    } else {
      out.push(line);
    }
    prevBlank = isBlank;
  }
  while (out.length > 0 && out[0] === '') out.shift();
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

function dedupeLongParagraphs(text) {
  const paras = text.split(/\n\n+/);
  const seen = new Set();
  const kept = [];
  for (const para of paras) {
    const key = para.trim();
    if (!key) continue;
    if (key.length >= 180) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    kept.push(key);
  }
  return kept.join('\n\n');
}

function findFirstCommentMarkerLine(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    if (COMMENT_MARKER_RE.test(lines[i])) return i;
  }
  return -1;
}

function cleanOne(rawText) {
  const rawLines = normalizeLines(rawText);
  const rawCommentMarkerCount = rawLines.filter((line) => COMMENT_MARKER_RE.test(line)).length;
  const firstCommentMarkerLine = findFirstCommentMarkerLine(rawLines);

  // Heuristic: if marker appears, OP usually precedes it in export; trim to pre-comment section.
  let workingLines = rawLines;
  let usedPreCommentTrim = false;
  if (firstCommentMarkerLine >= 0) {
    const preComment = rawLines.slice(0, firstCommentMarkerLine);
    const preCommentChars = preComment.join('\n').trim().length;
    if (preCommentChars >= 300) {
      workingLines = preComment;
      usedPreCommentTrim = true;
    }
  }

  workingLines = removeObviousNoise(workingLines);
  workingLines = dropCommentQuoteBlocks(workingLines);
  workingLines = collapseWhitespace(workingLines);

  let cleaned = workingLines.join('\n');
  cleaned = dedupeLongParagraphs(cleaned);
  cleaned = collapseWhitespace(cleaned.split('\n')).join('\n');

  const residualCommentSignals = countMatches(cleaned, COMMENT_MARKER_RE);
  const confidence = (
    cleaned.length < 280
    || residualCommentSignals > 0
    || (rawCommentMarkerCount > 0 && !usedPreCommentTrim)
    || rawCommentMarkerCount > 20
  )
    ? 'needs_manual_check'
    : 'high';

  return {
    cleaned,
    stats: {
      rawLines: rawLines.length,
      rawChars: rawText.length,
      cleanedLines: cleaned ? cleaned.split('\n').length : 0,
      cleanedChars: cleaned.length,
      rawCommentMarkerCount,
      residualCommentSignals,
      firstCommentMarkerLine,
      usedPreCommentTrim,
      confidence,
    },
  };
}

function main() {
  ensureDir(BACKUP_DIR);
  const files = fs.readdirSync(REDDIT_DIR)
    .filter((name) => name.endsWith('.md') && !name.startsWith('_'))
    .sort((a, b) => a.localeCompare(b));

  const reportRows = [];
  for (const fileName of files) {
    const fullPath = path.join(REDDIT_DIR, fileName);
    const backupPath = path.join(BACKUP_DIR, fileName);
    const current = fs.readFileSync(fullPath, 'utf8');
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, current, 'utf8');
    }
    const raw = fs.readFileSync(backupPath, 'utf8');

    const { cleaned, stats } = cleanOne(raw);
    fs.writeFileSync(fullPath, `${cleaned}${cleaned.endsWith('\n') || cleaned.length === 0 ? '' : '\n'}`, 'utf8');

    reportRows.push({ fileName, ...stats });
  }

  const lines = [];
  lines.push('# Reddit OP Cleanup Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('| File | Raw lines | Clean lines | Raw chars | Clean chars | Raw comment markers | Residual comment signals | Pre-comment trim | Confidence |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---|---|');
  for (const row of reportRows) {
    lines.push(`| ${row.fileName.replace(/\|/g, '\\|')} | ${row.rawLines} | ${row.cleanedLines} | ${row.rawChars} | ${row.cleanedChars} | ${row.rawCommentMarkerCount} | ${row.residualCommentSignals} | ${row.usedPreCommentTrim ? 'yes' : 'no'} | ${row.confidence} |`);
  }

  const high = reportRows.filter((row) => row.confidence === 'high').length;
  const manual = reportRows.filter((row) => row.confidence !== 'high').length;
  lines.push('');
  lines.push(`Summary: high=${high}, needs_manual_check=${manual}, total=${reportRows.length}`);
  lines.push('');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Cleaned ${reportRows.length} files.`);
  console.log(`Report: ${path.relative(ROOT, REPORT_PATH)}`);
}

main();
