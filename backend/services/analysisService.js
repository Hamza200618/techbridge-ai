'use strict';

const fs = require('fs/promises');
const analyzer = require('../../analyzer');
const projectService = require('./projectService');
const projectRepository = require('../repositories/projectRepository');
const projectStorage = require('../storage/projectStorage');
const analysisRunRepository = require('../repositories/analysisRunRepository');
const analysisResultRepository = require('../repositories/analysisResultRepository');
const issueRepository = require('../repositories/issueRepository');
const securityFindingRepository = require('../repositories/securityFindingRepository');
const securityService = require('./securityService');
const { toPublicIssue } = require('../models/issueModel');
const { toPublicFinding } = require('../models/securityFindingModel');
const ApiError = require('../utils/apiError');
const { logger } = require('../utils/logger');

// Orchestrates the analyzer and persists its results
// (docs/ARCHITECTURE.md sections 10-11: the analyzer discovers facts, the
// backend persists them; no analyzer logic lives in services).
//
// POST /analyze creates the run row and returns immediately; the pipeline
// then continues in the background. Analysis is local and fast, but the
// queued → running → completed lifecycle keeps progress observable through
// GET /analysis (docs/API_CONTRACT.md section 11).

function parseMetadata(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Creates an analysis run for an owned project and starts the pipeline.
// Returns { id, status: 'queued' } (docs/API_CONTRACT.md section 11.1).
async function startAnalysis(userId, projectId) {
  const project = await projectService.getOwnedProject(userId, projectId);

  const activeRun = await analysisRunRepository.findActiveByProjectId(project.id);
  if (activeRun) {
    throw new ApiError(409, 'ANALYSIS_IN_PROGRESS', 'An analysis is already running for this project.');
  }

  if (!project.working_path) {
    throw new ApiError(422, 'ANALYSIS_FAILED', 'Project has no working copy to analyze.');
  }
  const workingDir = projectStorage.fromStoredPath(project.working_path);
  const stat = await fs.stat(workingDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new ApiError(422, 'ANALYSIS_FAILED', 'Project working copy is missing on disk.');
  }

  const previousRun = await analysisRunRepository.findLatestByProjectId(project.id);
  const runType = previousRun && previousRun.status === 'completed' ? 'full' : 'initial';
  const runId = await analysisRunRepository.createRun({ projectId: project.id, runType });

  logger.info('Analysis started', { projectId: project.id, runId, runType });

  // Run the pipeline after the HTTP response is sent.
  setImmediate(() => {
    runAnalysis({ projectId: project.id, workingPath: project.working_path }, runId).catch(
      (error) => {
        logger.error('Analysis runner crashed', {
          projectId: project.id,
          runId,
          message: error.message,
        });
      },
    );
  });

  return { id: runId, status: 'queued' };
}

// Internal pipeline: analyzer → transactional persist → run/project state.
async function runAnalysis(project, runId) {
  const startedAt = Date.now();
  const workingDir = projectStorage.fromStoredPath(project.workingPath);
  const metadata = { currentStage: 'discovery' };

  try {
    await analysisRunRepository.markRunning(runId, metadata);
    await projectRepository.updateProject(project.projectId, {
      status: 'analyzing',
      analysis_progress: 0,
    });

    const result = await analyzer.analyzeProject(workingDir, {
      onStage: async (stage, progress) => {
        metadata.currentStage = stage;
        await analysisRunRepository.updateProgress(runId, progress, metadata);
        await projectRepository.updateProject(project.projectId, {
          analysis_progress: progress,
        });
      },
    });

    await analysisResultRepository.replaceAnalysisData(project.projectId, result, {
      workingPath: project.workingPath,
    });

    const filesAnalyzed = result.fileHealth.filter(
      (entry) => entry.analysisStatus === 'completed',
    ).length;
    const durationMs = Date.now() - startedAt;
    await analysisRunRepository.markCompleted(runId, {
      filesAnalyzed,
      issuesFound: result.issues.length,
      metadata: {
        currentStage: 'completed',
        framework: result.summary.framework,
        projectType: result.summary.projectType,
        primaryLanguage: result.summary.primaryLanguage,
        languages: result.summary.languages,
        counts: {
          dependencies: result.dependencies.length,
          relationships: result.relationships.length,
          apiEndpoints: result.apiEndpoints.length,
          databaseEntities: result.databaseEntities.length,
          securityFindings: result.securityFindings.length,
          issues: result.issues.length,
        },
        durationMs,
      },
    });

    logger.info('Analysis completed', {
      projectId: project.projectId,
      runId,
      durationMs,
      filesAnalyzed,
      issuesFound: result.issues.length,
      securityFindings: result.securityFindings.length,
      healthScore: result.projectHealth.score,
    });
  } catch (error) {
    // currentStage keeps the stage where the pipeline stopped.
    await analysisRunRepository
      .markFailed(runId, error.message, metadata)
      .catch((markError) => {
        logger.error('Failed to mark analysis run as failed', {
          runId,
          message: markError.message,
        });
      });
    await projectRepository
      .updateProject(project.projectId, { status: 'error' })
      .catch(() => {});
    logger.error('Analysis failed', {
      projectId: project.projectId,
      runId,
      message: error.message,
    });
  }
}

// GET /analysis status for the latest run
// (docs/API_CONTRACT.md section 11.2).
async function getAnalysisStatus(userId, projectId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const run = await analysisRunRepository.findLatestByProjectId(project.id);
  if (!run) {
    return { status: 'not_started', progress: 0, currentStage: 'not_started' };
  }
  const metadata = parseMetadata(run.metadata);

  let currentStage;
  if (run.status === 'completed') {
    currentStage = 'completed';
  } else if (run.status === 'queued') {
    currentStage = 'queued';
  } else {
    currentStage = (metadata && metadata.currentStage) || (run.status === 'failed' ? 'failed' : 'running');
  }

  const payload = {
    status: run.status,
    progress: Number(run.progress) || 0,
    currentStage,
  };
  if (run.status === 'failed' && run.error_message) {
    payload.errorMessage = run.error_message;
  }
  return payload;
}

// GET /issues (docs/API_CONTRACT.md section 12.1).
async function getIssues(userId, projectId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const rows = await issueRepository.findByProjectId(project.id);
  return rows.map(toPublicIssue);
}

// GET /security (docs/API_CONTRACT.md section 13.1).
async function getSecurityFindings(userId, projectId) {
  return securityService.getSecurityFindings(userId, projectId);
}

module.exports = {
  startAnalysis,
  getAnalysisStatus,
  getIssues,
  getSecurityFindings,
};
