'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { detectLanguage, isBinaryExtension } = require('../parsers/languageDetector');

// File and directory discovery (docs/ARCHITECTURE.md section 10 "discovery").
// Emits project-relative POSIX paths only.

// Files larger than this are recorded but not hashed or line-counted.
const MAX_HASH_BYTES = 2 * 1024 * 1024;
// Files larger than this are not loaded for deep analysis.
const MAX_PARSE_BYTES = 1024 * 1024;
// Total text content loaded for deep analysis across the whole project.
const MAX_TOTAL_TEXT_BYTES = 64 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8192;

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return name.slice(dot + 1).toLowerCase();
}

function countLines(text) {
  if (!text) return 0;
  let lines = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lines += 1;
  }
  if (!text.endsWith('\n')) lines += 1;
  return lines;
}

async function statFile(absolutePath) {
  try {
    return await fs.stat(absolutePath);
  } catch {
    return null;
  }
}

// Walks the project tree. Skipped directories (node_modules, .git, ...) are
// recorded with is_ignored = 1 and not descended into; directories inside
// generated output roots (dist, build, ...) are descended into but flagged.
async function walk(root, relDir, insideGenerated, input, files) {
  const absDir = relDir ? path.join(root, relDir) : root;
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return; // unreadable directory — record nothing below it
  }
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const ignored = input.skippedDirs.has(entry.name);
      files.push({
        path: relPath,
        name: entry.name,
        extension: null,
        fileType: 'directory',
        parentPath: relDir || null,
        language: null,
        sizeBytes: 0,
        lineCount: 0,
        isBinary: false,
        isGenerated: insideGenerated,
        isIgnored: ignored,
        contentHash: null,
      });
      if (!ignored) {
        await walk(
          root,
          relPath,
          insideGenerated || input.generatedDirs.has(entry.name),
          input,
          files,
        );
      }
    } else if (entry.isFile()) {
      const extension = extensionOf(entry.name);
      const stat = await statFile(path.join(root, relPath));
      const sizeBytes = stat ? stat.size : 0;
      let isBinary = isBinaryExtension(extension);
      let lineCount = 0;
      let contentHash = null;
      if (stat && stat.size <= MAX_HASH_BYTES) {
        try {
          const buffer = await fs.readFile(path.join(root, relPath));
          contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
          if (!isBinary) {
            isBinary = buffer.slice(0, BINARY_SNIFF_BYTES).includes(0);
          }
          if (!isBinary) {
            lineCount = countLines(buffer.toString('utf8'));
          }
        } catch {
          // unreadable file — keep metadata only
        }
      }
      files.push({
        path: relPath,
        name: entry.name,
        extension,
        fileType: 'file',
        parentPath: relDir || null,
        language: detectLanguage(extension),
        sizeBytes,
        lineCount,
        isBinary,
        isGenerated: insideGenerated,
        isIgnored: input.junkFiles.has(entry.name),
        contentHash,
      });
    }
  }
}

async function discoverFiles(input) {
  const files = [];
  await walk(input.root, '', false, input, files);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

// Loads text content for every analyzable file (non-binary, non-ignored,
// non-generated, within per-file and total caps). The result feeds every
// deep-analysis stage so each file is read at most once.
async function loadTextContents(root, files) {
  const sourceFiles = [];
  let totalBytes = 0;
  for (const file of files) {
    if (
      file.fileType !== 'file'
      || file.isBinary
      || file.isIgnored
      || file.isGenerated
      || file.sizeBytes <= 0
      || file.sizeBytes > MAX_PARSE_BYTES
    ) {
      continue;
    }
    if (totalBytes + file.sizeBytes > MAX_TOTAL_TEXT_BYTES) {
      continue; // keep memory bounded on very large projects
    }
    try {
      const text = await fs.readFile(path.join(root, file.path), 'utf8');
      totalBytes += Buffer.byteLength(text, 'utf8');
      sourceFiles.push({ ...file, text });
    } catch {
      // unreadable file — excluded from deep analysis
    }
  }
  return sourceFiles;
}

module.exports = {
  discoverFiles,
  loadTextContents,
  // exposed for tests
  toPosix,
};
