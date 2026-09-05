'use strict';

const projectService = require('./projectService');
const projectFileService = require('./projectFileService');
const projectFileRepository = require('../repositories/projectFileRepository');
const dependencyRepository = require('../repositories/dependencyRepository');
const relationshipRepository = require('../repositories/relationshipRepository');
const apiEndpointRepository = require('../repositories/apiEndpointRepository');
const databaseEntityRepository = require('../repositories/databaseEntityRepository');
const issueRepository = require('../repositories/issueRepository');
const contextBuilder = require('../ai/context');
const aiProvider = require('../ai/provider');
const config = require('../config/env');
const ApiError = require('../utils/apiError');
const { logger } = require('../utils/logger');

// Root Cause Tracing (docs/PROJECT_SPEC.md section 7, docs/API_CONTRACT.md section 23.1,
// docs/ARCHITECTURE.md section 10).
//
// Traces detected issues through stored analyzer relationships, project dependencies,
// files, APIs, and database entities deterministically. AI is optionally used to
// explain the root cause narrative without inventing or modifying graph relationships.

function extractArchitectureArea(filePath) {
  if (!filePath) return 'root';
  const posixPath = filePath.replace(/\\/g, '/');
  const parts = posixPath.split('/');
  if (parts.length === 1) return 'root';
  if (['backend', 'frontend', 'analyzer', 'src'].includes(parts[0]) && parts.length > 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

async function getIssueRootCause(userId, projectId, issueId, options = {}) {
  const shouldExplain = options.explain !== false; // Default true for root cause endpoint

  // 1. Verify project ownership (docs/API_CONTRACT.md section 26)
  const project = await projectService.getOwnedProject(userId, projectId);

  // 2. Verify issue exists in project
  const issue = await issueRepository.findById(project.id, issueId);
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Issue was not found.');
  }

  // 3. Retrieve affected file details if linked
  let affectedFileRow = null;
  let anchorId = null;
  if (issue.file_id) {
    affectedFileRow = await projectFileRepository.findByIdAndProject(project.id, issue.file_id);
    if (affectedFileRow) {
      anchorId = Number(affectedFileRow.id);
    }
  }

  // 4. Retrieve stored project facts (relationships, dependencies, files)
  const [allEdges, allDependencies, allFiles] = await Promise.all([
    relationshipRepository.findByProjectId(project.id),
    dependencyRepository.findByProjectId(project.id),
    projectFileRepository.findByProjectId(project.id),
  ]);

  const fileMap = new Map(allFiles.map((f) => [Number(f.id), f]));

  // Build dependency chain & related files from stored graph
  const dependencyChain = [];
  const relatedFileIds = new Set();

  if (anchorId !== null) {
    // Incoming edges (files that import the affected file - reverse dependencies)
    const incoming = allEdges.filter((e) => Number(e.target_file_id) === anchorId);
    // Outgoing edges (files imported by the affected file - direct dependencies)
    const outgoing = allEdges.filter((e) => Number(e.source_file_id) === anchorId);

    for (const edge of outgoing) {
      const targetId = edge.target_file_id !== null ? Number(edge.target_file_id) : null;
      if (targetId) relatedFileIds.add(targetId);
      const targetFile = targetId ? fileMap.get(targetId) : null;

      dependencyChain.push({
        direction: 'dependency',
        sourceFileId: anchorId,
        sourcePath: affectedFileRow ? affectedFileRow.path : null,
        targetFileId: targetId,
        targetPath: targetFile ? targetFile.path : (edge.target_path || null),
        relationshipType: edge.relationship_type || 'imports',
        symbol: edge.symbol_name || null,
      });
    }

    for (const edge of incoming) {
      const sourceId = Number(edge.source_file_id);
      relatedFileIds.add(sourceId);
      const sourceFile = fileMap.get(sourceId);

      dependencyChain.push({
        direction: 'dependent',
        sourceFileId: sourceId,
        sourcePath: sourceFile ? sourceFile.path : (edge.source_path || null),
        targetFileId: anchorId,
        targetPath: affectedFileRow ? affectedFileRow.path : null,
        relationshipType: edge.relationship_type || 'imports',
        symbol: edge.symbol_name || null,
      });
    }
  }

  const affectedFileSet = anchorId !== null ? [anchorId, ...relatedFileIds] : [];

  // 5. Retrieve affected APIs and DB entities for impacted file set
  const [affectedApis, affectedDatabases] = await Promise.all([
    apiEndpointRepository.findByFileIds(project.id, affectedFileSet),
    databaseEntityRepository.findByFileIds(project.id, affectedFileSet),
  ]);

  // Determine affected architecture components/areas
  const areaSet = new Set();
  if (affectedFileRow) areaSet.add(extractArchitectureArea(affectedFileRow.path));
  for (const fId of relatedFileIds) {
    const fileRow = fileMap.get(fId);
    if (fileRow) areaSet.add(extractArchitectureArea(fileRow.path));
  }
  const architectureAreas = [...areaSet].sort();

  // Related package dependencies
  const relatedPackageDependencies = allDependencies.filter((dep) => {
    if (!dep.source_file_id) return false;
    return affectedFileSet.includes(Number(dep.source_file_id));
  }).map((dep) => ({
    id: Number(dep.id),
    name: dep.name,
    version: dep.version,
    type: dep.dependency_type,
    packageManager: dep.package_manager,
  }));

  // Build likely root cause details
  const likelyRootCause = {
    issueId: Number(issue.id),
    title: issue.title,
    severity: issue.severity,
    issueType: issue.issue_type,
    description: issue.description,
    rootCauseDescription: issue.root_cause || issue.description,
    suggestedFix: issue.suggested_fix || null,
    evidence: issue.evidence || null,
    confidence: issue.confidence !== null && issue.confidence !== undefined ? Number(issue.confidence) : 0.85,
    detectionSource: issue.detection_source || 'static_analysis',
    originFile: affectedFileRow ? {
      fileId: anchorId,
      path: affectedFileRow.path,
      language: affectedFileRow.language,
      healthStatus: affectedFileRow.health_status,
    } : null,
  };

  // Build clean public file metadata objects for related files
  const relatedFiles = [...relatedFileIds].map((id) => {
    const f = fileMap.get(id);
    return {
      fileId: id,
      path: f ? f.path : null,
      name: f ? f.name : null,
      language: f ? f.language : null,
      healthStatus: f ? f.health_status : 'unknown',
      healthScore: f ? Number(f.health_score) || 0 : 0,
    };
  });

  const affectedFilePayload = affectedFileRow ? {
    fileId: anchorId,
    path: affectedFileRow.path,
    name: affectedFileRow.name,
    language: affectedFileRow.language,
    healthStatus: affectedFileRow.health_status,
    healthScore: Number(affectedFileRow.health_score) || 0,
  } : null;

  const result = {
    issueId: Number(issue.id),
    affectedFile: affectedFilePayload,
    relatedFiles,
    dependencyChain,
    likelyRootCause,
    affectedComponents: {
      apis: affectedApis.map((api) => ({
        id: Number(api.id),
        method: api.method,
        route: api.route,
        controllerName: api.controller_name,
        filePath: api.file_path,
      })),
      databases: affectedDatabases.map((db) => ({
        id: Number(db.id),
        name: db.name,
        entityType: db.entity_type,
        databaseName: db.database_name,
        filePath: db.file_path,
      })),
      packageDependencies: relatedPackageDependencies,
      architectureAreas,
    },
    explanation: null,
  };

  // 6. Optional AI explanation using context builder
  if (shouldExplain) {
    try {
      const issueContext = await contextBuilder.buildIssueContext(project.id, issue.id);
      const systemPrompt = `You are a senior software engineering assistant performing root-cause analysis.
Explain the root cause of the specified issue, how it propagates through project relationships and dependencies, and why the suggested fix addresses the root cause.
Rely strictly on the provided facts. Do not invent any file paths, imports, or project relationships.`;

      const providerMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Explain the root cause for issue #${issue.id}: "${issue.title}".\n\n${issueContext.text}` },
      ];

      const response = await aiProvider.generateResponse(providerMessages, {
        temperature: config.ai.chat.temperature,
        maxTokens: config.ai.chat.maxTokens,
      });

      result.explanation = response.content;
    } catch (error) {
      logger.warn('AI root cause explanation generation failed', {
        projectId: project.id,
        issueId: issue.id,
        message: error.message,
      });
      result.explanation = 'AI explanation is currently unavailable. The factual graph above details all verified code relationships and root-cause evidence.';
    }
  }

  logger.info('Root-cause analysis completed', {
    projectId: project.id,
    issueId: issue.id,
    affectedFile: affectedFileRow ? affectedFileRow.path : null,
    relatedFilesCount: relatedFiles.length,
    dependencyChainLength: dependencyChain.length,
    explained: shouldExplain,
  });

  return result;
}

module.exports = { getIssueRootCause };
