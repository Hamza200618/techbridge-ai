'use strict';

// Deterministic extraction of import references from Python source
// (docs/PROJECT_SPEC.md section 3.8: "Python imports").

// import a.b
const PLAIN_IMPORT = /^\s*import\s+([A-Za-z_][\w.]*)/;
// from a.b import x  /  from .mod import x  /  from . import x  (relaxed:
// anything after "import" on the same line)
const FROM_IMPORT = /^\s*from\s+(\.*)([A-Za-z_][\w.]*)?\s+import\s+(.+)$/;

// Returns [{ module, dots, names, line }]:
//   module  — absolute module path ('os.path') or '' for relative forms
//   dots    — number of leading dots (0 = absolute import)
//   names   — imported names (only meaningful for relative from-imports)
function extractPythonImports(text) {
  const refs = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const plain = line.match(PLAIN_IMPORT);
    if (plain && !line.trim().startsWith('#')) {
      refs.push({ module: plain[1], dots: 0, names: [], line: i + 1 });
      continue;
    }
    if (/^\s*from\s+/.test(line)) {
      const from = line.match(FROM_IMPORT);
      if (from) {
        const names = from[3]
          .replace(/[()\\]/g, '')
          .split(',')
          .map((name) => name.trim().split(/\s+as\s+/)[0])
          .filter((name) => /^[A-Za-z_][\w*]*$/.test(name));
        refs.push({ module: from[2] || '', dots: from[1].length, names, line: i + 1 });
      }
    }
  }
  return refs;
}

module.exports = { extractPythonImports };
