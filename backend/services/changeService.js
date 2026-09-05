'use strict';

const fs = require('fs/promises');
const path = require('path');

const projectService = require('./projectService');
const projectFileService = require('./projectFileService');
const projectFileRepository = require('../repositories/projectFileRepository');
const projectVersionRepository = require('../repositories/projectVersionRepository');
const codeChangeRepository = require('../repositories/codeChangeRepository');
const projectStorage = require('../storage/projectStorage');
const { toPublicChange, toPublicFileVersion } = require('../models/codeChangeModel');
const { toPublicProjectVersion } = require('../models/projectVersionModel');
const { hashContent, storageHash } = require('../utils/hash');
const ApiError = require('../utils/apiError');
const { logger } = require('../utils/logger');

// Apply / Reject for proposed changes (docs/API_CONTRACT.md sections 18-19,
// docs/PROJECT_SPEC.md section 4.7, docs/ARCHITECTURE.md section 19).
//
// Apply is the ONLY flow that writes AI-approved content into the working
// project — and only after the user explicitly asked for it. The original
// upload in storage/uploads is never touched (docs/TEAM_RULES.md section 19);
// all writes go to the working copy.
//
// The schema has no 'modified' value in projects.status (the enum is the
// processing pipeline: uploaded…ready), so the durable "modified" markers are
// the applied code_changes row, its project_versions row, and the changed
// file's analysis_status='pending' (stale until re-analysis).
//
// Ordering: the status transition proposed → applied is a conditional UPDATE,
// so exactly one concurrent request can win it; the file write happens after
// the claim and every failure path rolls the claim back, leaving the change
// 'proposed' and the working copy unchanged.

const STATUS_VERBS = {
  applied: 'applied',
  rejected: 'rejected',
  rolled_back: 'rolled back',
};

function alreadyProcessed(status) {
  const verb = STATUS_VERBS[status] || 'processed';
  return new ApiError(409, 'CHANGE_ALREADY_PROCESSED', `This change has already been ${verb}.`);
}

function fileDiverged() {
  return new ApiError(
    409,
    'CHANGE_CONFLICT',
    'The file has changed since this proposal was generated, so the change can no longer be applied. Generate a new fix proposal.',
  );
}

function applyFailed() {
  return new ApiError(500, 'INTERNAL_ERROR', 'Applying the change failed. The working project was left unchanged.');
}

// Resolves the change's file inside the working directory — the same
// containment discipline as the file-content API (docs/API_CONTRACT.md
// section 33): the stored path is only trusted after re-resolving it inside
// the working copy.
function resolveWorkingFilePath(project, file) {
  if (!project.working_path) {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }
  const workingDir = projectStorage.fromStoredPath(project.working_path);
  const filePath = path.resolve(workingDir, String(file.path));
  if (filePath !== workingDir && !filePath.startsWith(workingDir + path.sep)) {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }
  return filePath;
}

// Best-effort rollback of a claimed apply: undo the status transition and
// drop the version row created for it. The working copy itself is restored by
// the caller (which holds the verified pre-apply content).
async function rollbackClaim(changeId, versionId) {
  try {
    await codeChangeRepository.updateStatus(changeId, 'applied', 'proposed');
  } catch (error) {
    logger.error('Failed to revert change status after failed apply', {
      changeId,
      message: error.message,
    });
  }
  if (versionId) {
    try {
      await projectVersionRepository.deleteById(versionId);
    } catch (error) {
      logger.error('Failed to remove version row after failed apply', {
        versionId,
        message: error.message,
      });
    }
  }
}

// Parses the change id encoded in a project_versions.label created by the
// apply flow. Returns null when the label is missing or does not follow the
// expected `change-{id}-applied` convention.
function parseChangeIdFromLabel(label) {
  if (!label) return null;
  const match = /^change-(\d+)-applied$/.exec(label);
  return match ? Number(match[1]) : null;
}

// Returns the stored diff_content when present; regenerates from old/new
// content as a fallback for manually inserted changes. The joined file path
// (findByProjectId / findByFileId) is required — without it the regenerated
// headers would be meaningless.
function getDiffForChange(change) {
  if (change.diff_content) return change.diff_content;
  if (change.old_content === null || change.new_content === null || !change.file_path) {
    return null;
  }
  try {
    const { generateUnifiedDiff } = require('../ai/fixing/diffGenerator');
    return generateUnifiedDiff(change.old_content, change.new_content, change.file_path);
  } catch {
    return null;
  }
}

// Project version history (docs/API_CONTRACT.md section 21.1). Versions are
// rows in project_versions; the change that produced each version is linked
// by parsing the version label. Returns an empty list when no versions exist.
async function getProjectVersions(userId, projectId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const versions = await projectVersionRepository.findByProjectId(project.id);
  const changes = await codeChangeRepository.findByProjectId(project.id);
  const changeMap = new Map();
  for (const change of changes) {
    changeMap.set(Number(change.id), change);
  }

  const parsed = versions.map((version) => {
    const changeId = parseChangeIdFromLabel(version.label);
    const change = changeId !== null ? changeMap.get(changeId) || null : null;
    // The change row may be gone (re-analysis cascades code_changes), in
    // which case the parsed id is still reported with null detail fields —
    // the version keeps its linkage to the change that produced it.
    const changeInfo = {
      changeId,
      fileId: change ? Number(change.file_id) : null,
      filePath: change ? change.file_path : null,
      changeType: change ? change.change_type : null,
      diff: change ? getDiffForChange(change) : null,
      oldHash: change ? hashContent(change.old_content) : null,
      newHash: change ? hashContent(change.new_content) : null,
    };
    return toPublicProjectVersion(version, changeInfo);
  });

  return { versions: parsed };
}

// File version history (docs/API_CONTRACT.md section 21.2). The existing
// schema has no file_versions table, so history is derived from applied
// code_changes for the given file. Each applied change represents a version
// transition; the baseline entry represents the original content before the
// first applied change. Hashes are computed from the stored old/new content.
async function getFileVersions(userId, projectId, fileId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const file = await projectFileService.requireProjectFile(project.id, fileId);
  const changes = await codeChangeRepository.findByFileId(project.id, file.id);
  const appliedChanges = changes.filter((c) => c.status === 'applied');

  // Version 0 is the file's baseline — the original content as discovered,
  // before any applied change. With applied changes its hash is recomputed
  // from the first change's old_content; without any, the analyzer-stored
  // content_hash (bare sha256, re-prefixed) describes the current content.
  const versions = [
    {
      versionNumber: 0,
      label: 'original',
      status: 'baseline',
      changeId: null,
      changeType: null,
      description: appliedChanges.length > 0
        ? `Original content of ${file.path} before any applied changes.`
        : `Original content of ${file.path}. No applied changes yet.`,
      diff: null,
      filePath: file.path,
      oldHash: null,
      newHash: appliedChanges.length > 0
        ? hashContent(appliedChanges[0].old_content)
        : (file.content_hash ? `sha256:${file.content_hash}` : null),
      createdAt: file.created_at,
    },
  ];

  // Each applied change is one version transition (1, 2, ... in apply
  // order); rows map through the model, with the diff regenerated only when
  // diff_content is empty.
  let versionNumber = 0;
  for (const change of appliedChanges) {
    versionNumber += 1;
    versions.push(
      toPublicFileVersion({ ...change, diff_content: getDiffForChange(change) }, {
        versionNumber,
        label: `change-${change.id}-applied`,
        oldHash: hashContent(change.old_content),
        newHash: hashContent(change.new_content),
      }),
    );
  }

  return { versions };
}

async function applyChange(userId, projectId, changeId) {
  // 1. Ownership: missing and foreign projects both answer 404.
  const project = await projectService.getOwnedProject(userId, projectId);

  // 2. The change must belong to the owned project.
  const change = await codeChangeRepository.findByIdAndProject(project.id, changeId);
  if (!change) {
    throw new ApiError(404, 'CHANGE_NOT_FOUND', 'Change was not found.');
  }

  // 3. Only proposed changes can be applied (checked again atomically below).
  if (change.status !== 'proposed') {
    throw alreadyProcessed(change.status);
  }
  if (typeof change.new_content !== 'string') {
    throw new ApiError(422, 'VALIDATION_ERROR', 'This change has no proposed content to apply.');
  }

  const file = await projectFileService.requireProjectFile(project.id, change.file_id);
  const filePath = resolveWorkingFilePath(project, file);

  // 4. Claim the change: the conditional UPDATE is the serialization point —
  // a concurrent apply or reject of the same change loses here.
  const claimed = await codeChangeRepository.updateStatus(change.id, 'proposed', 'applied');
  if (!claimed) {
    const current = await codeChangeRepository.findById(change.id);
    throw alreadyProcessed(current ? current.status : change.status);
  }

  // 5. The file must still match the content the proposal was based on —
  // otherwise applying the stored new_content would silently revert whatever
  // changed in between. The change stays 'proposed' when this fails.
  let currentContent;
  try {
    currentContent = await fs.readFile(filePath, 'utf8');
  } catch {
    await rollbackClaim(change.id, null);
    throw fileDiverged();
  }
  if (change.old_content !== null && currentContent !== change.old_content) {
    await rollbackClaim(change.id, null);
    throw fileDiverged();
  }

  // 6. Preserve the previous version: the content itself is already immutable
  // in code_changes.old_content; this row anchors the application in the
  // project's version history.
  let version;
  try {
    version = await projectVersionRepository.createNextVersion({
      projectId: project.id,
      label: `change-${change.id}-applied`,
      description: `${file.path} modified by applied change #${change.id}. Previous content is preserved in code_changes #${change.id}.`,
      createdBy: userId,
    });

    // 7. Apply the approved content to the working project. The stored hash
    // uses the analyzer's bare sha256 format (storageHash) so
    // project_files.content_hash stays comparable across analyzer runs and
    // change applications.
    await fs.writeFile(filePath, change.new_content, 'utf8');
    const contentHash = storageHash(change.new_content);
    await projectFileRepository.updateContentHash(project.id, file.id, contentHash);
  } catch (error) {
    // Leave the working copy as it was: if the write itself failed partway,
    // restore the verified pre-apply content.
    try {
      await fs.writeFile(filePath, currentContent, 'utf8');
    } catch (restoreError) {
      logger.error('Failed to restore working file after failed apply', {
        projectId: project.id,
        changeId: change.id,
        filePath: file.path,
        message: restoreError.message,
      });
    }
    await rollbackClaim(change.id, version ? version.id : null);
    logger.error('Change apply failed', {
      projectId: project.id,
      changeId: change.id,
      message: error.message,
    });
    throw applyFailed();
  }

  // 8. Mark the stored analysis of the changed file as stale until the
  // analyzer runs again. Best-effort: the apply itself already succeeded, so
  // a failure here must not turn the response into an error.
  try {
    await projectFileRepository.markAnalysisPending(project.id, file.id);
  } catch (error) {
    logger.warn('Failed to mark file analysis as stale after apply', {
      projectId: project.id,
      changeId: change.id,
      fileId: file.id,
      message: error.message,
    });
  }

  logger.info('Change applied', {
    projectId: project.id,
    changeId: change.id,
    fileId: file.id,
    versionNumber: version.versionNumber,
    userId,
  });

  const row = await codeChangeRepository.findById(change.id);
  return { change: toPublicChange(row) };
}

// Reject never touches the filesystem (docs/API_CONTRACT.md section 19.1: a
// rejected change must not modify project files).
async function rejectChange(userId, projectId, changeId) {
  // 1. Ownership.
  const project = await projectService.getOwnedProject(userId, projectId);

  // 2. The change must belong to the owned project.
  const change = await codeChangeRepository.findByIdAndProject(project.id, changeId);
  if (!change) {
    throw new ApiError(404, 'CHANGE_NOT_FOUND', 'Change was not found.');
  }

  // 3. Transition proposed → rejected; a concurrent apply or reject of the
  // same change loses the conditional UPDATE.
  const rejected = await codeChangeRepository.updateStatus(change.id, 'proposed', 'rejected');
  if (!rejected) {
    const current = await codeChangeRepository.findById(change.id);
    throw alreadyProcessed(current ? current.status : change.status);
  }

  logger.info('Change rejected', { projectId: project.id, changeId: change.id, userId });

  const row = await codeChangeRepository.findById(change.id);
  return { change: toPublicChange(row) };
}

module.exports = { applyChange, rejectChange, getProjectVersions, getFileVersions };
