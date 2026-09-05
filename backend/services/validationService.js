'use strict';

const fs = require('fs/promises');
const projectService = require('./projectService');
const projectStorage = require('../storage/projectStorage');
const validationRunRepository = require('../repositories/validationRunRepository');
const validationRunner = require('../validation/validationRunner');
const ApiError = require('../utils/apiError');
const { logger } = require('../utils/logger');

// Orchestrates project validation (docs/PROJECT_SPEC.md section 8, docs/API_CONTRACT.md section 24).
//
// POST /validate creates a validation_runs row with status='queued' and returns immediately.
// The runner executes the sandboxed child process in the background.

const ALLOWED_TYPES = new Set(['build', 'test', 'runtime', 'lint', 'dependency', 'full', 'syntax']);

function toPublicRun(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    type: row.type,
    status: row.status,
    command: row.command,
    output: row.output,
    errorOutput: row.error_output,
    exitCode: row.exit_code,
    durationMs: row.duration_ms !== null ? Number(row.duration_ms) : null,
    createdAt: row.created_at,
  };
}

async function startValidation(userId, projectId, options = {}) {
  // 1. Verify project ownership (docs/API_CONTRACT.md section 26)
  const project = await projectService.getOwnedProject(userId, projectId);

  const rawType = String(options.type || 'full').toLowerCase();
  const type = ALLOWED_TYPES.has(rawType) ? rawType : 'full';

  if (!project.working_path) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Project has no working copy to validate.');
  }

  const workingDir = projectStorage.fromStoredPath(project.working_path);
  const stat = await fs.stat(workingDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new ApiError(422, 'VALIDATION_FAILED', 'Project working directory is missing on disk.');
  }

  // Create queued validation run
  const runId = await validationRunRepository.createRun({
    projectId: project.id,
    type,
    status: 'queued',
  });

  logger.info('Validation run started', { projectId: project.id, runId, type });

  // Run child process validation asynchronously in background
  setImmediate(() => {
    executeValidationRun({ projectId: project.id, workingPath: project.working_path }, runId, type).catch(
      (error) => {
        logger.error('Validation runner crashed', {
          projectId: project.id,
          runId,
          message: error.message,
        });
      },
    );
  });

  return { id: runId, status: 'queued' };
}

async function executeValidationRun(project, runId, type) {
  const workingDir = projectStorage.fromStoredPath(project.workingPath);

  try {
    await validationRunRepository.markRunning(runId);

    const result = await validationRunner.runProjectValidation(workingDir, type);

    await validationRunRepository.updateRunResult(runId, {
      status: result.status,
      command: result.command,
      output: result.output,
      errorOutput: result.errorOutput,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    });

    logger.info('Validation run completed', {
      projectId: project.projectId,
      runId,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    });
  } catch (error) {
    await validationRunRepository
      .updateRunResult(runId, {
        status: 'error',
        command: null,
        output: '',
        errorOutput: error.message,
        exitCode: -1,
        durationMs: 0,
      })
      .catch((err) => {
        logger.error('Failed to record validation error', { runId, message: err.message });
      });

    logger.error('Validation run failed', {
      projectId: project.projectId,
      runId,
      message: error.message,
    });
  }
}

async function getValidationResults(userId, projectId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const rows = await validationRunRepository.findByProjectId(project.id);
  return { runs: rows.map(toPublicRun) };
}

async function getValidationRunById(userId, projectId, runId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const row = await validationRunRepository.findById(project.id, runId);
  if (!row) {
    throw new ApiError(404, 'RUN_NOT_FOUND', 'Validation run was not found.');
  }
  return { run: toPublicRun(row) };
}

module.exports = {
  startValidation,
  getValidationResults,
  getValidationRunById,
};
