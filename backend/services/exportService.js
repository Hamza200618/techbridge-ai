'use strict';

const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');

const projectService = require('./projectService');
const projectStorage = require('../storage/projectStorage');
const projectExportRepository = require('../repositories/projectExportRepository');
const projectVersionRepository = require('../repositories/projectVersionRepository');
const ApiError = require('../utils/apiError');
const { logger } = require('../utils/logger');

// Modified project export service (docs/PROJECT_SPEC.md section 9, docs/API_CONTRACT.md section 25).
//
// Packages the editable working copy (storage/working) containing all applied changes.
// The original uploaded ZIP in storage/uploads remains strictly immutable. Internal
// TechBridge metadata files and OS temporary files are excluded.

const EXCLUDED_NAMES = new Set([
  '.techbridge',
  '.git',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
]);

function isExcluded(relativePath) {
  const parts = relativePath.split(/[/\\]/);
  for (const part of parts) {
    if (EXCLUDED_NAMES.has(part)) return true;
  }
  return false;
}

function sanitizeFilename(name) {
  const base = String(name || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'project'}-fixed.zip`;
}

function toPublicExport(row) {
  if (!row) return null;
  const status = row.status === 'ready' ? 'completed' : row.status;
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    versionId: row.version_id ? Number(row.version_id) : null,
    filename: row.filename,
    status,
    sizeBytes: row.size_bytes !== null ? Number(row.size_bytes) : null,
    downloadUrl: `/api/projects/${row.project_id}/exports/${row.id}/download`,
    createdAt: row.created_at,
  };
}

// Packages working copy into a clean ZIP archive excluding internal metadata
async function buildCleanZip(workingDir, exportFilePath) {
  const zip = new AdmZip();

  async function addDirectory(currentDir, relativePrefix) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      if (isExcluded(relPath)) continue;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await addDirectory(fullPath, relPath);
      } else if (entry.isFile()) {
        const fileContent = await fs.readFile(fullPath);
        zip.addFile(relPath, fileContent);
      }
    }
  }

  await addDirectory(workingDir, '');

  // Ensure output directory exists
  await fs.mkdir(path.dirname(exportFilePath), { recursive: true });

  await new Promise((resolve, reject) => {
    zip.writeZip(exportFilePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function exportProject(userId, projectId) {
  // 1. Verify ownership (docs/API_CONTRACT.md section 26)
  const project = await projectService.getOwnedProject(userId, projectId);

  if (!project.working_path) {
    throw new ApiError(422, 'EXPORT_FAILED', 'Project has no working copy to export.');
  }

  const workingDir = projectStorage.fromStoredPath(project.working_path);
  const stat = await fs.stat(workingDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new ApiError(422, 'EXPORT_FAILED', 'Project working copy is missing on disk.');
  }

  // Get latest version if available
  const latestVersion = await projectVersionRepository.findLatestByProjectId(project.id);
  const versionId = latestVersion ? latestVersion.id : null;

  const filename = sanitizeFilename(project.name);
  const exportsDir = path.join(projectStorage.getExportsDir(), String(project.id));
  const exportFilePath = path.join(exportsDir, `${Date.now()}_${filename}`);

  // Create record with status 'creating'
  const exportId = await projectExportRepository.createExport({
    projectId: project.id,
    versionId,
    filename,
    storagePath: projectStorage.toStoredPath(exportFilePath),
    status: 'creating',
  });

  try {
    // Package editable working copy into clean ZIP
    await buildCleanZip(workingDir, exportFilePath);

    const fileStat = await fs.stat(exportFilePath);
    const sizeBytes = fileStat.size;

    await projectExportRepository.updateExportStatus(exportId, {
      status: 'ready',
      sizeBytes,
      storagePath: projectStorage.toStoredPath(exportFilePath),
    });

    logger.info('Project exported successfully', {
      projectId: project.id,
      exportId,
      filename,
      sizeBytes,
    });

    const row = await projectExportRepository.findById(project.id, exportId);
    return { export: toPublicExport(row) };
  } catch (error) {
    await projectExportRepository.updateExportStatus(exportId, { status: 'failed' }).catch(() => {});
    logger.error('Project export failed', {
      projectId: project.id,
      exportId,
      message: error.message,
    });
    throw new ApiError(500, 'EXPORT_FAILED', 'Failed to generate project export archive.');
  }
}

async function getProjectExports(userId, projectId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const rows = await projectExportRepository.findByProjectId(project.id);
  return { exports: rows.map(toPublicExport) };
}

async function downloadExport(userId, projectId, exportId, res) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const exportRecord = await projectExportRepository.findById(project.id, exportId);

  if (!exportRecord) {
    throw new ApiError(404, 'EXPORT_NOT_FOUND', 'Export archive was not found.');
  }
  if (exportRecord.status !== 'ready' && exportRecord.status !== 'completed') {
    throw new ApiError(400, 'EXPORT_NOT_READY', 'Export archive is not ready for download.');
  }

  const exportFilePath = projectStorage.fromStoredPath(exportRecord.storage_path);
  const stat = await fs.stat(exportFilePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new ApiError(404, 'EXPORT_NOT_FOUND', 'Export archive file is missing on disk.');
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.filename}"`);
  return res.download(exportFilePath, exportRecord.filename);
}

module.exports = {
  exportProject,
  getProjectExports,
  downloadExport,
};
