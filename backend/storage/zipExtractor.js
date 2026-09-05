'use strict';

const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const config = require('../config/env');
const ApiError = require('../utils/apiError');

// Safe ZIP extraction for untrusted uploads (docs/PROJECT_SPEC.md sections
// 3.2 and 13). Uploaded projects are untrusted input, so every entry is
// validated before anything is written to disk:
//
//   - no null bytes, absolute paths, drive letters, or ".." segments
//   - every resolved path must stay inside the extraction directory
//   - entry count and total uncompressed size are capped (zip-bomb defense)
//   - entries are always written as regular files/directories — symlink
//     entries from a malicious archive can never become real links on disk

const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]), // local file header
  Buffer.from([0x50, 0x4b, 0x05, 0x06]), // empty archive
  Buffer.from([0x50, 0x4b, 0x07, 0x08]), // spanned archive
];

function invalidZip(message) {
  return new ApiError(400, 'INVALID_ZIP', message);
}

function securityError(message) {
  return new ApiError(400, 'ZIP_SECURITY_ERROR', message);
}

// Cheap content check on the first bytes (PK\x03\x04 …) — the filename and
// declared mimetype are not trusted.
function isZipBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }
  const head = buffer.subarray(0, 4);
  return ZIP_SIGNATURES.some((signature) => signature.equals(head));
}

// Validates a single entry name and returns it with backslashes normalized
// to forward slashes. Throws ZIP_SECURITY_ERROR on anything suspicious.
function assertSafeEntryName(entryName, baseDir) {
  if (typeof entryName !== 'string' || entryName.length === 0) {
    throw securityError('ZIP entry has an invalid name.');
  }
  if (entryName.includes('\0')) {
    throw securityError('ZIP entry name contains a null byte.');
  }

  const normalized = entryName.replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    throw securityError('ZIP entry uses an absolute path.');
  }
  if (/^[a-zA-Z]:/.test(normalized)) {
    throw securityError('ZIP entry uses an absolute Windows path.');
  }
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw securityError('ZIP entry path traversal detected.');
  }

  // Defense in depth: even a name that passed the checks above must resolve
  // inside the extraction directory.
  const resolved = path.resolve(baseDir, normalized);
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
    throw securityError('ZIP entry resolves outside the extraction directory.');
  }

  return normalized;
}

// Extracts `zipBuffer` into `targetDir`. Returns { fileCount, totalBytes }.
// Throws ApiError with INVALID_ZIP / ZIP_SECURITY_ERROR / EXTRACTION_FAILED.
async function extractZipSafely(zipBuffer, targetDir, limits = {}) {
  if (!isZipBuffer(zipBuffer)) {
    throw invalidZip('Uploaded file is not a valid ZIP archive.');
  }

  let zip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch (error) {
    throw invalidZip('ZIP file is corrupt or could not be read.');
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw invalidZip('ZIP archive is empty.');
  }

  const maxEntries = limits.maxEntries ?? config.upload.maxZipEntries;
  const maxTotalBytes = limits.maxTotalUncompressedBytes ?? config.upload.maxZipUncompressedBytes;

  if (entries.length > maxEntries) {
    throw securityError(`ZIP archive contains too many entries (limit: ${maxEntries}).`);
  }

  // Zip-bomb defense, stage 1: reject based on declared uncompressed sizes
  // before decompressing anything.
  const declaredTotal = entries.reduce((sum, entry) => sum + (entry.header.size || 0), 0);
  if (declaredTotal > maxTotalBytes) {
    throw securityError(`ZIP archive expands beyond the allowed size (limit: ${maxTotalBytes} bytes).`);
  }

  const baseDir = path.resolve(targetDir);
  await fs.mkdir(baseDir, { recursive: true });

  let fileCount = 0;
  let writtenBytes = 0;

  for (const entry of entries) {
    const normalized = assertSafeEntryName(entry.entryName, baseDir);
    const destination = path.resolve(baseDir, normalized);

    // adm-zip >= 0.6 exposes isDirectory as a boolean property; older
    // versions as a method. Support both.
    const isDirectory =
      typeof entry.isDirectory === 'function' ? entry.isDirectory() : Boolean(entry.isDirectory);
    if (normalized.endsWith('/') || isDirectory) {
      await fs.mkdir(destination, { recursive: true });
      continue;
    }

    // Zip-bomb defense, stage 2: track actual decompressed bytes so a lying
    // header cannot bypass the declared-size check.
    const data = entry.getData();
    writtenBytes += data.length;
    if (writtenBytes > maxTotalBytes) {
      throw securityError('ZIP archive expands beyond the allowed size during extraction.');
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.writeFile(destination, data);
    } catch (error) {
      throw new ApiError(422, 'EXTRACTION_FAILED', 'Failed to extract the ZIP archive.');
    }
    fileCount += 1;
  }

  if (fileCount === 0) {
    throw invalidZip('ZIP archive contains no files.');
  }

  return { fileCount, totalBytes: writtenBytes };
}

module.exports = { isZipBuffer, extractZipSafely };
