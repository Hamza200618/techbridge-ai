'use strict';

const path = require('path');
const projectRepository = require('../repositories/projectRepository');
const { toPublicProject } = require('../models/projectModel');
const projectStorage = require('../storage/projectStorage');
const zipExtractor = require('../storage/zipExtractor');
const ApiError = require('../utils/apiError');
const { logger } = require('../utils/logger');

// Upload workflow (docs/API_CONTRACT.md section 8.1):
//
//   validate ZIP → create project record (status: uploaded) → save original
//   ZIP (immutable) → extract safely (status: extracting) → create editable
//   working copy → store paths (status: ready)
//
// No analyzer logic here: files are extracted and stored, not analyzed.
// Discovery/analysis statuses (indexing, analyzing) belong to the analyzer
// phase and are reached through POST /api/projects/:projectId/analyze later.

function deriveProjectName(originalFilename) {
  const withoutExtension = originalFilename.replace(/\.zip$/i, '').trim();
  const name = withoutExtension.slice(0, 255); // projects.name is varchar(255)
  return name || `project-${Date.now()}`;
}

// Best-effort rollback when an upload fails after the record was created:
// remove every filesystem artifact and the project record so no zombie
// projects remain (the client receives the original error and can retry).
async function cleanupFailedUpload(projectId) {
  try {
    await projectStorage.removeProjectFiles(projectId);
  } catch (error) {
    logger.warn('Failed to clean up project files after failed upload', {
      projectId,
      message: error.message,
    });
  }
  try {
    await projectRepository.deleteProject(projectId);
  } catch (error) {
    logger.warn('Failed to remove project record after failed upload', {
      projectId,
      message: error.message,
    });
  }
}

async function uploadProject(userId, file) {
  if (!file || !file.buffer) {
    throw new ApiError(400, 'VALIDATION_ERROR', "No file uploaded. Attach a ZIP file in the 'file' field.");
  }
  if (!zipExtractor.isZipBuffer(file.buffer)) {
    throw new ApiError(400, 'INVALID_ZIP', 'Uploaded file is not a valid ZIP archive.');
  }

  // Multipart filenames may carry path components (e.g. from curl) — keep
  // only the basename. Stored names never influence filesystem paths:
  // storage directories are keyed by projectId.
  const originalFilename = (path.basename(file.originalname || '') || 'project.zip').slice(0, 500);
  const name = deriveProjectName(originalFilename);

  const projectId = await projectRepository.createProject({ userId, name, originalFilename });
  logger.info('Project upload started', { projectId, userId });

  try {
    const zipPath = await projectStorage.saveOriginalZip(projectId, file.buffer);

    await projectRepository.updateProject(projectId, { status: 'extracting' });
    logger.info('Project extraction started', { projectId });

    const { fileCount } = await zipExtractor.extractZipSafely(
      file.buffer,
      projectStorage.projectExtractedDir(projectId),
    );

    const workingDir = await projectStorage.createWorkingCopy(projectId);

    await projectRepository.updateProject(projectId, {
      storage_path: projectStorage.toStoredPath(zipPath),
      extracted_path: projectStorage.toStoredPath(projectStorage.projectExtractedDir(projectId)),
      working_path: projectStorage.toStoredPath(workingDir),
      status: 'ready',
    });

    logger.info('Project extraction completed', { projectId, fileCount });

    const row = await projectRepository.findById(projectId);
    return toPublicProject(row);
  } catch (error) {
    await cleanupFailedUpload(projectId);
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Project upload failed', { projectId, name: error.name, message: error.message });
    throw new ApiError(422, 'EXTRACTION_FAILED', 'Failed to process the uploaded project.');
  }
}

// ---- Project read / delete APIs (docs/API_CONTRACT.md section 9) ----

// Loads a project and enforces ownership. Missing and foreign projects both
// answer 404 PROJECT_NOT_FOUND so other users' project IDs are never leaked.
async function getOwnedProject(userId, projectId) {
  const row = await projectRepository.findById(projectId);
  if (!row || Number(row.user_id) !== Number(userId)) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  }
  return row;
}

// Lists only the authenticated user's projects (newest first).
async function listProjects(userId) {
  const rows = await projectRepository.findByUserId(userId);
  return rows.map(toPublicProject);
}

async function getProject(userId, projectId) {
  const row = await getOwnedProject(userId, projectId);
  return toPublicProject(row);
}

// Deletes the project record (FK cascades remove project_files and analysis
// rows) and then removes the project's storage directories best-effort.
// The database goes first: a failed filesystem cleanup can only leave
// invisible orphan directories, never a project referencing missing files.
async function deleteProject(userId, projectId) {
  const row = await getOwnedProject(userId, projectId);
  await projectRepository.deleteProject(row.id);
  try {
    await projectStorage.removeProjectFiles(row.id);
  } catch (error) {
    logger.warn('Failed to clean up project storage after deletion', {
      projectId: row.id,
      message: error.message,
    });
  }
  logger.info('Project deleted', { projectId: row.id, userId });
}

module.exports = {
  uploadProject,
  getOwnedProject,
  listProjects,
  getProject,
  deleteProject,
};
