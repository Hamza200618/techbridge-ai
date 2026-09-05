'use strict';

// Deterministic extraction of module references from JavaScript/TypeScript
// source (docs/TEAM_RULES.md rule 16: structural facts come from actual code
// analysis, never from an LLM). Regex-based on purpose — the analyzer stays
// dependency-free and predictable.

// All patterns capture the module specifier (group 1).
const IMPORT_PATTERNS = [
  // import defaultExport, { named } from 'module';  (multi-line friendly)
  /\bimport\s+[^;'"]*?from\s*['"]([^'"]+)['"]/g,
  // import 'module';  (side-effect import)
  /\bimport\s*['"]([^'"]+)['"]/g,
  // export { x } from 'module';  export * from 'module';
  /\bexport\s+(?:\{[^}]*?\}\s*from|\*\s*from)\s*['"]([^'"]+)['"]/g,
  // const x = require('module');  require('module');
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // import('module')  (dynamic)
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

// Returns [{ module, line }] — de-duplicated per (module, line).
function extractJavaScriptImports(text) {
  const seen = new Set();
  const refs = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      const moduleName = match[1];
      const line = lineOf(text, match.index);
      const key = `${moduleName}:${line}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ module: moduleName, line });
      }
      match = pattern.exec(text);
    }
  }
  refs.sort((a, b) => a.line - b.line || a.module.localeCompare(b.module));
  return refs;
}

module.exports = { extractJavaScriptImports };
