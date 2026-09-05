'use strict';

// Detectable code issues (docs/PROJECT_SPEC.md section 3.6). Issues are
// deterministic static-analysis facts — never AI inference. Every issue
// carries evidence and a confidence score.

const MAX_ISSUES_PER_RULE = 100;

// Node.js built-in modules that never need a package.json entry.
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

// Common Python standard-library modules (subset — deliberately
// conservative; anything outside this set AND outside requirements.txt is
// reported with reduced confidence).
const PYTHON_STDLIB = new Set([
  'abc', 'argparse', 'asyncio', 'base64', 'collections', 'contextlib', 'copy',
  'csv', 'datetime', 'decimal', 'enum', 'functools', 'glob', 'hashlib',
  'heapq', 'html', 'http', 'importlib', 'inspect', 'io', 'itertools', 'json',
  'logging', 'math', 'multiprocessing', 'os', 'pathlib', 'pickle', 'platform',
  'queue', 'random', 're', 'shutil', 'signal', 'socket', 'sqlite3', 'ssl',
  'stat', 'statistics', 'string', 'subprocess', 'sys', 'tempfile', 'threading',
  'time', 'traceback', 'typing', 'unittest', 'urllib', 'uuid', 'warnings',
  'weakref', 'xml', 'zipfile',
]);

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function lineIssues(file, lines, pattern) {
  const evidenceLines = [];
  lines.forEach((line, index) => {
    if (pattern.test(line) && evidenceLines.length < 3) {
      evidenceLines.push(`Line ${index + 1}: ${line.trim()}`);
    }
  });
  return evidenceLines;
}

// Returns [{ filePath, issueType, severity, title, description, evidence,
//            suggestedFix, confidence, detectionSource }].
function detectIssues(sourceFiles, dependencyInfo, relationshipInfo) {
  const issues = [];

  // 1. Relative imports that resolve to nothing.
  for (const unresolved of relationshipInfo.unresolvedImports.slice(0, MAX_ISSUES_PER_RULE)) {
    issues.push({
      filePath: unresolved.sourcePath,
      issueType: 'dependency',
      severity: 'high',
      title: 'Import target not found',
      description: `Import '${unresolved.module}' does not resolve to any file in the project.`,
      evidence: `${unresolved.sourcePath}:${unresolved.line}: ${unresolved.module}`,
      suggestedFix: 'Restore the missing file or correct the import path.',
      confidence: 0.9,
      detectionSource: 'dependency_analysis',
    });
  }

  // 2. JavaScript packages used but not declared in package.json.
  if (dependencyInfo.profile.hasNpmManifest) {
    const seen = new Set();
    for (const external of relationshipInfo.externalImports) {
      if (seen.has(external.name)) continue;
      seen.add(external.name);
      const isJsSource = /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(external.sourcePath);
      if (!isJsSource) continue;
      if (NODE_BUILTINS.has(external.name)) continue;
      if (dependencyInfo.declaredPackages.has(external.name.toLowerCase())) continue;
      if (issues.filter((issue) => issue.title === 'Package used but not declared').length >= MAX_ISSUES_PER_RULE) {
        break;
      }
      issues.push({
        filePath: external.sourcePath,
        issueType: 'dependency',
        severity: 'medium',
        title: 'Package used but not declared',
        description: `Package '${external.name}' is imported but not listed in package.json dependencies.`,
        evidence: `${external.sourcePath}: import '${external.name}'`,
        suggestedFix: `Add '${external.name}' to package.json dependencies, or remove the import if unused.`,
        confidence: 0.6,
        detectionSource: 'dependency_analysis',
      });
    }
  }

  // 3. Python packages used but not declared in requirements.txt.
  if (dependencyInfo.profile.hasPipManifest) {
    const seen = new Set();
    for (const external of relationshipInfo.externalImports) {
      if (seen.has(external.name)) continue;
      seen.add(external.name);
      const isPySource = external.sourcePath.endsWith('.py');
      if (!isPySource) continue;
      if (PYTHON_STDLIB.has(external.name)) continue;
      if (dependencyInfo.declaredPackages.has(external.name.toLowerCase())) continue;
      if (issues.filter((issue) => issue.title === 'Python package used but not declared').length >= MAX_ISSUES_PER_RULE) {
        break;
      }
      issues.push({
        filePath: external.sourcePath,
        issueType: 'dependency',
        severity: 'medium',
        title: 'Python package used but not declared',
        description: `Module '${external.name}' is imported but not listed in requirements.txt.`,
        evidence: `${external.sourcePath}: import '${external.name}'`,
        suggestedFix: `Add '${external.name}' to requirements.txt, or remove the import if unused.`,
        confidence: 0.6,
        detectionSource: 'dependency_analysis',
      });
    }
  }

  // 4–6. Line-oriented rules over every parsed source file.
  for (const file of sourceFiles) {
    const lines = file.text.split(/\r?\n/);

    const todo = lineIssues(file, lines, /(?:\/\/|#|\/\*|<!--)\s*(TODO|FIXME|HACK|XXX)\b/i);
    if (todo.length > 0) {
      const hasFixme = /FIXME|HACK/i.test(todo.join(' '));
      issues.push({
        filePath: file.path,
        issueType: 'style',
        severity: hasFixme ? 'low' : 'info',
        title: 'Unresolved work marker in comment',
        description: 'TODO/FIXME/HACK markers indicate unfinished work.',
        evidence: todo.join('\n'),
        suggestedFix: 'Complete the marked work or remove the obsolete marker.',
        confidence: 0.95,
        detectionSource: 'static_analysis',
      });
    }

    const emptyCatch = lineIssues(file, lines, /catch\s*\([^)]*\)\s*\{\s*\}/);
    if (emptyCatch.length > 0) {
      issues.push({
        filePath: file.path,
        issueType: 'logic',
        severity: 'medium',
        title: 'Empty catch block swallows errors',
        description: 'A try/catch block catches errors and discards them silently.',
        evidence: emptyCatch.join('\n'),
        suggestedFix: 'Log the error or handle it explicitly; rethrow when the caller must know about the failure.',
        confidence: 0.85,
        detectionSource: 'static_analysis',
      });
    }

    const debuggerLines = lineIssues(file, lines, /^\s*debugger\s*;?\s*$/);
    if (debuggerLines.length > 0) {
      issues.push({
        filePath: file.path,
        issueType: 'style',
        severity: 'low',
        title: 'Leftover debugger statement',
        description: 'A debugger statement will pause execution in development tools.',
        evidence: debuggerLines.join('\n'),
        suggestedFix: 'Remove the debugger statement.',
        confidence: 0.95,
        detectionSource: 'static_analysis',
      });
    }

    if (file.lineCount > 3000) {
      issues.push({
        filePath: file.path,
        issueType: 'architecture',
        severity: 'info',
        title: 'File is unusually large',
        description: `File has ${file.lineCount} lines, which makes review and maintenance harder.`,
        evidence: `${file.path}: ${file.lineCount} lines`,
        suggestedFix: 'Consider splitting the file into focused modules.',
        confidence: 0.8,
        detectionSource: 'static_analysis',
      });
    }
  }

  issues.sort((a, b) => {
    if (SEVERITY_ORDER[a.severity] !== SEVERITY_ORDER[b.severity]) {
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    }
    return a.filePath.localeCompare(b.filePath) || a.title.localeCompare(b.title);
  });
  return issues;
}

module.exports = { detectIssues };
