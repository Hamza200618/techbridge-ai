'use strict';

const { extractJavaScriptImports } = require('../parsers/javascriptParser');
const { extractPythonImports } = require('../parsers/pythonParser');
const { isJavaScriptExtension } = require('../parsers/languageDetector');

// File-to-file relationship detection (docs/PROJECT_SPEC.md section 3.8).
// Only relative imports that resolve to files that actually exist in the
// project become relationships — the graph never invents edges
// (docs/ARCHITECTURE.md rule: "Never invent analyzer relationships").

// Resolution order for extensionless JS/TS imports.
const RESOLVE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json'];

function normalizePosix(segments) {
  const resolved = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  return resolved.join('/');
}

function dirnameOf(posixPath) {
  const slash = posixPath.lastIndexOf('/');
  return slash === -1 ? '' : posixPath.slice(0, slash);
}

function resolveJavaScriptImport(fromPath, specifier, filePaths) {
  if (!specifier.startsWith('.')) return null; // external or absolute
  const dir = dirnameOf(fromPath);
  const base = normalizePosix([...dir.split('/'), ...specifier.split('/')]);
  if (!base) return null;
  const candidates = [
    base,
    ...RESOLVE_EXTENSIONS.map((extension) => base + extension),
    ...RESOLVE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find((candidate) => filePaths.has(candidate)) || null;
}

function resolvePythonImport(fromPath, ref, filePaths) {
  const dir = dirnameOf(fromPath);
  // Walk up one directory per dot beyond the first.
  let baseSegments = dir ? dir.split('/') : [];
  for (let i = 1; i < ref.dots; i += 1) {
    baseSegments.pop();
  }
  const bases = [];
  if (ref.module) {
    bases.push([...baseSegments, ...ref.module.split('.')].join('/'));
  } else {
    // "from . import x" — each imported name may be a sibling module.
    for (const name of ref.names) {
      if (name !== '*') bases.push([...baseSegments, name].join('/'));
    }
  }
  const candidates = [];
  for (const base of bases) {
    candidates.push(`${base}.py`, `${base}/__init__.py`);
  }
  return candidates.find((candidate) => filePaths.has(candidate)) || null;
}

function externalPackageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (specifier.startsWith('node:')) return null; // explicit Node builtin
  const [first, second] = specifier.split('/');
  return specifier.startsWith('@') && second ? `${first}/${second}` : first;
}

// Returns { relationships, unresolvedImports, externalImports }.
function detectRelationships(sourceFiles, files) {
  const filePaths = new Set(files.filter((f) => f.fileType === 'file').map((f) => f.path));
  const relationships = [];
  const unresolvedImports = [];
  const externalImports = [];
  const seenRelationships = new Set();

  for (const file of sourceFiles) {
    const isJs = isJavaScriptExtension(file.extension);
    const isPy = file.extension === 'py';
    if (!isJs && !isPy) continue;

    const refs = isJs ? extractJavaScriptImports(file.text) : extractPythonImports(file.text);
    for (const ref of refs) {
      if (isJs) {
        const resolved = resolveJavaScriptImport(file.path, ref.module, filePaths);
        if (resolved) {
          const key = `${file.path}|${resolved}|${ref.module}`;
          if (!seenRelationships.has(key)) {
            seenRelationships.add(key);
            relationships.push({
              sourcePath: file.path,
              targetPath: resolved,
              relationshipType: 'imports',
              symbolName: ref.module,
            });
          }
        } else if (ref.module.startsWith('.')) {
          unresolvedImports.push({ sourcePath: file.path, module: ref.module, line: ref.line });
        } else {
          const packageName = externalPackageName(ref.module);
          if (packageName) {
            externalImports.push({ sourcePath: file.path, name: packageName });
          }
        }
      } else {
        // Python
        if (ref.dots > 0) {
          const resolved = resolvePythonImport(file.path, ref, filePaths);
          if (resolved) {
            const key = `${file.path}|${resolved}|${ref.module}`;
            if (!seenRelationships.has(key)) {
              seenRelationships.add(key);
              relationships.push({
                sourcePath: file.path,
                targetPath: resolved,
                relationshipType: 'imports',
                symbolName: ref.module || '.',
              });
            }
          } else {
            unresolvedImports.push({
              sourcePath: file.path,
              module: '.'.repeat(ref.dots) + ref.module,
              line: ref.line,
            });
          }
        } else if (ref.module) {
          externalImports.push({ sourcePath: file.path, name: ref.module.split('.')[0] });
        }
      }
    }
  }

  return { relationships, unresolvedImports, externalImports };
}

module.exports = { detectRelationships };
