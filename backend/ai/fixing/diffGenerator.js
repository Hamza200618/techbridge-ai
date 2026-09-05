'use strict';

// Line-based unified diff generator for the Fix It workflow
// (docs/API_CONTRACT.md section 17.1, docs/PROJECT_SPEC.md section 4.6).
// The diff is always computed server-side from the real current content and
// the proposed content — the AI never authors the diff, so what the user
// reviews is exactly what applying the change would do.
//
// Output format (standard unified diff):
//   --- a/<path>
//   +++ b/<path>
//   @@ -oldStart,oldCount +newStart,newCount @@
//    context line
//   -removed line
//   +added line
//   \ No newline at end of file   (after the last line, when it lacks one)

const CONTEXT_LINES = 3;
// Rendering cap for pathological files; code_changes keeps the full
// old/new content regardless, so the change itself is never lost.
const MAX_RENDERED_LINES = 5000;
// Guard for the quadratic LCS table (in cells): beyond this a complete
// rewrite is rendered as one replace-block hunk instead.
const MAX_LCS_CELLS = 4_000_000;

// Splits text into comparable line objects. CRLF is normalized to LF so
// diffs read cleanly; a file that does not end with a newline marks its last
// line so the diff shows it honestly instead of silently normalizing it.
function toLineObjects(text) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  const endsWithNewline = normalized.endsWith('\n');
  const lines = normalized.split('\n');
  if (endsWithNewline) lines.pop();
  return lines.map((line, index) => ({
    text: line,
    noNewline: !endsWithNewline && index === lines.length - 1,
  }));
}

function sameLine(a, b) {
  return a.text === b.text && a.noNewline === b.noNewline;
}

function buildLcsTable(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      rows[i][j] = sameLine(a[i], b[j])
        ? rows[i + 1][j + 1] + 1
        : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  return rows;
}

// Edit script: entries { type: 'same' | 'del' | 'add', line } in file order.
// Common prefix/suffix are trimmed first so the LCS table only covers the
// changed middle; a huge middle (complete rewrite) skips LCS entirely.
function buildScript(oldLines, newLines) {
  let start = 0;
  while (start < oldLines.length && start < newLines.length && sameLine(oldLines[start], newLines[start])) {
    start += 1;
  }
  let endOld = oldLines.length;
  let endNew = newLines.length;
  while (endOld > start && endNew > start && sameLine(oldLines[endOld - 1], newLines[endNew - 1])) {
    endOld -= 1;
    endNew -= 1;
  }

  const script = [];
  const midOld = oldLines.slice(start, endOld);
  const midNew = newLines.slice(start, endNew);

  for (let i = 0; i < start; i += 1) script.push({ type: 'same', line: oldLines[i] });

  if (midOld.length * midNew.length > MAX_LCS_CELLS) {
    for (const line of midOld) script.push({ type: 'del', line });
    for (const line of midNew) script.push({ type: 'add', line });
  } else {
    const table = buildLcsTable(midOld, midNew);
    let i = 0;
    let j = 0;
    while (i < midOld.length && j < midNew.length) {
      if (sameLine(midOld[i], midNew[j])) {
        script.push({ type: 'same', line: midOld[i] });
        i += 1;
        j += 1;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        script.push({ type: 'del', line: midOld[i] });
        i += 1;
      } else {
        script.push({ type: 'add', line: midNew[j] });
        j += 1;
      }
    }
    while (i < midOld.length) {
      script.push({ type: 'del', line: midOld[i] });
      i += 1;
    }
    while (j < midNew.length) {
      script.push({ type: 'add', line: midNew[j] });
      j += 1;
    }
  }

  for (let i = endOld; i < oldLines.length; i += 1) script.push({ type: 'same', line: oldLines[i] });
  return script;
}

// Groups script indices into hunks: each change expanded by CONTEXT_LINES,
// overlapping or adjacent ranges merged (unified-diff convention).
function buildHunkRanges(script) {
  const ranges = [];
  let current = null;
  for (let index = 0; index < script.length; index += 1) {
    if (script[index].type === 'same') continue;
    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(script.length - 1, index + CONTEXT_LINES);
    if (current && start <= current.end + 1) {
      current.end = Math.max(current.end, end);
    } else {
      current = { start, end };
      ranges.push(current);
    }
  }
  return ranges;
}

function renderEntry(entry) {
  const marker = entry.type === 'same' ? ' ' : entry.type === 'del' ? '-' : '+';
  const lines = [`${marker}${entry.line.text}`];
  if (entry.line.noNewline) lines.push('\\ No newline at end of file');
  return lines;
}

// Generates the unified diff between two file contents. Returns an empty
// string when the contents are identical.
function generateUnifiedDiff(originalContent, proposedContent, filePath) {
  const oldLines = toLineObjects(originalContent);
  const newLines = toLineObjects(proposedContent);
  const script = buildScript(oldLines, newLines);

  const ranges = buildHunkRanges(script);
  if (ranges.length === 0) return '';

  // 1-based line numbers consumed before each script index, for hunk headers.
  const oldBefore = new Array(script.length + 1);
  const newBefore = new Array(script.length + 1);
  let oldCount = 0;
  let newCount = 0;
  for (let index = 0; index <= script.length; index += 1) {
    oldBefore[index] = oldCount;
    newBefore[index] = newCount;
    const entry = script[index];
    if (entry && entry.type !== 'add') oldCount += 1;
    if (entry && entry.type !== 'del') newCount += 1;
  }

  const output = [`--- a/${filePath}`, `+++ b/${filePath}`];
  let rendered = 0;
  let truncated = false;

  for (const range of ranges) {
    if (truncated) break;
    let hunkOldStart = null;
    let hunkNewStart = null;
    let hunkOldCount = 0;
    let hunkNewCount = 0;
    const body = [];

    for (let index = range.start; index <= range.end; index += 1) {
      const entry = script[index];
      if (entry.type !== 'add') {
        if (hunkOldStart === null) hunkOldStart = oldBefore[index] + 1;
        hunkOldCount += 1;
      }
      if (entry.type !== 'del') {
        if (hunkNewStart === null) hunkNewStart = newBefore[index] + 1;
        hunkNewCount += 1;
      }
      const lines = renderEntry(entry);
      if (rendered + lines.length > MAX_RENDERED_LINES) {
        truncated = true;
        break;
      }
      rendered += lines.length;
      body.push(...lines);
    }

    if (truncated) break;
    // For empty sides the header anchors to the line before the hunk
    // (unified-diff convention: "-5,0" means inserted after old line 5).
    output.push(
      `@@ -${hunkOldCount > 0 ? hunkOldStart : oldBefore[range.start]},${hunkOldCount} `
      + `+${hunkNewCount > 0 ? hunkNewStart : newBefore[range.start]},${hunkNewCount} @@`,
    );
    output.push(...body);
  }

  if (truncated) {
    output.push(`\\ Diff truncated after ${MAX_RENDERED_LINES} rendered lines — the stored old/new content holds the full change.`);
  }
  return output.join('\n');
}

module.exports = { generateUnifiedDiff };
