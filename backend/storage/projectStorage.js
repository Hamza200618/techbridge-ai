'use strict';

const fs = require('fs/promises');
const path = require('path');
const config = require('../config/env');

// Filesystem layout for uploaded projects (docs/PROJECT_SPEC.md section 10):
//
//   storage/uploads/{projectId}/original.zip  — immutable original upload
//   storage/extracted/{projectId}/            — extracted project
//   storage/working/{projectId}/              — editable working copy
//   storage/exports/{projectId}/              — generated export archives
//
// The database stores repo-root-relative paths (forward slashes) such as
// "storage/uploads/3/original.zip".

const STORAGE_AREAS = ['uploads', 'extracted', 'working', 'exports', 'temp'];

function storageRoot() {
  return config.storage.root;
}

function projectUploadDir(projectId) {
  return path.join(storageRoot(), 'uploads', String(projectId));
}

function projectExtractedDir(projectId) {
  return path.join(storageRoot(), 'extracted', String(projectId));
}

function projectWorkingDir(projectId) {
  return path.join(storageRoot(), 'working', String(projectId));
}

function projectExportDir(projectId) {
  return path.join(storageRoot(), 'exports', String(projectId));
}

// Converts an absolute path into the portable form stored in the projects
// table (relative to the repository root, forward slashes).
function toStoredPath(absolutePath) {
  const repoRoot = path.resolve(storageRoot(), '..');
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

// Resolves a stored repo-relative path ("storage/working/3") back to an
// absolute path. Inverse of toStoredPath.
function fromStoredPath(storedPath) {
  const repoRoot = path.resolve(storageRoot(), '..');
  return path.resolve(repoRoot, storedPath);
}

// Guarantees the five storage areas exist. Called at server startup.
async function ensureStorageLayout() {
  for (const area of STORAGE_AREAS) {
    await fs.mkdir(path.join(storageRoot(), area), { recursive: true });
  }
}

// Persists the original ZIP exactly as received. This is the only write to
// the uploads area — the original archive is immutable afterwards; all later
// processing works on the extracted and working copies.
async function saveOriginalZip(projectId, zipBuffer) {
  const dir = projectUploadDir(projectId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, 'original.zip');
  await fs.writeFile(filePath, zipBuffer);
  return filePath;
}

// Creates the editable working copy from the extracted project. AI fixes are
// later applied here; the extracted copy and original ZIP stay untouched.
async function createWorkingCopy(projectId) {
  const workingDir = projectWorkingDir(projectId);
  await fs.cp(projectExtractedDir(projectId), workingDir, { recursive: true });
  return workingDir;
}

// Removes every filesystem artifact of a project (used when an upload fails
// or a project is deleted).
async function removeProjectFiles(projectId) {
  const dirs = [
    projectUploadDir(projectId),
    projectExtractedDir(projectId),
    projectWorkingDir(projectId),
    projectExportDir(projectId),
  ];
  await Promise.all(dirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
}

module.exports = {
  storageRoot,
  toStoredPath,
  fromStoredPath,
  ensureStorageLayout,
  projectUploadDir,
  projectExtractedDir,
  projectWorkingDir,
  projectExportDir,
  saveOriginalZip,
  createWorkingCopy,
  removeProjectFiles,
};
