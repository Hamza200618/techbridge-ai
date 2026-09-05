'use strict';

const fs = require('fs/promises');
const path = require('path');

// Analyzer input normalization (docs/ARCHITECTURE.md section 10 "ingestion").
// The analyzer never learns absolute paths from callers beyond resolving the
// project root; all emitted paths are project-relative POSIX paths.

// Directory names that are recorded but never descended into. Vendored and
// VCS directories would dominate the file inventory without adding facts.
const SKIPPED_DIRS = new Set([
  'node_modules', '.git', 'venv', '.venv', '__pycache__', '.cache', '.idea', '.vscode',
]);

// Directory names whose contents are recorded but flagged as generated
// build output (is_generated = 1) and excluded from deep analysis.
const GENERATED_DIRS = new Set(['dist', 'build', 'out', 'coverage', '.next', 'target']);

// OS junk files recorded but flagged as ignored (is_ignored = 1).
const JUNK_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

async function loadProjectInput(projectRoot) {
  const root = path.resolve(projectRoot);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    const error = new Error('Project root is not a readable directory.');
    error.code = 'ANALYZER_INVALID_ROOT';
    throw error;
  }
  return {
    root,
    skippedDirs: SKIPPED_DIRS,
    generatedDirs: GENERATED_DIRS,
    junkFiles: JUNK_FILES,
  };
}

module.exports = { loadProjectInput, SKIPPED_DIRS, GENERATED_DIRS, JUNK_FILES };
