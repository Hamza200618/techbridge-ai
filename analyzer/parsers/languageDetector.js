'use strict';

// Language detection by file extension (docs/PROJECT_SPEC.md section 3.3).
// Only mappings that are factual are included; unknown extensions get null.

const EXTENSION_LANGUAGES = {
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript',
  py: 'Python',
  java: 'Java', kt: 'Kotlin', swift: 'Swift', go: 'Go', rs: 'Rust',
  php: 'PHP', rb: 'Ruby', cs: 'C#',
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++',
  sql: 'SQL', sh: 'Shell', bash: 'Shell', ps1: 'PowerShell',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less',
  vue: 'Vue', svelte: 'Svelte',
};

// Extensions that are always treated as binary regardless of content.
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'cur',
  'exe', 'dll', 'so', 'dylib', 'bin', 'class', 'jar', 'war',
  'zip', 'gz', 'tar', 'rar', '7z', 'bz2', 'xz',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'o', 'a', 'obj', 'lib', 'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp3', 'mp4', 'm4a', 'avi', 'mov', 'wmv', 'flac', 'ogg', 'wav',
  'psd', 'ai', 'sqlite', 'db', 'pyc', 'pyo',
]);

const JAVASCRIPT_EXTENSIONS = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs']);

function detectLanguage(extension) {
  if (!extension) return null;
  return EXTENSION_LANGUAGES[extension] || null;
}

function isBinaryExtension(extension) {
  return Boolean(extension) && BINARY_EXTENSIONS.has(extension);
}

function isJavaScriptExtension(extension) {
  return Boolean(extension) && JAVASCRIPT_EXTENSIONS.has(extension);
}

// Aggregates per-language file counts over the discovered file rows and
// derives the primary language (most code files; ties broken by name).
function aggregateLanguages(files) {
  const counts = new Map();
  for (const file of files) {
    if (file.fileType !== 'file' || !file.language) continue;
    counts.set(file.language, (counts.get(file.language) || 0) + 1);
  }
  const languages = [...counts.entries()]
    .map(([language, fileCount]) => ({ language, fileCount }))
    .sort((a, b) => b.fileCount - a.fileCount || a.language.localeCompare(b.language));
  return {
    languages,
    primaryLanguage: languages.length > 0 ? languages[0].language : null,
  };
}

module.exports = {
  detectLanguage,
  isBinaryExtension,
  isJavaScriptExtension,
  aggregateLanguages,
};
