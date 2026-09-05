'use strict';

const projectService = require('./projectService');
const securityFindingRepository = require('../repositories/securityFindingRepository');
const projectFileRepository = require('../repositories/projectFileRepository');
const { toPublicFinding } = require('../models/securityFindingModel');
const contextBuilder = require('../ai/context');
const aiProvider = require('../ai/provider');
const config = require('../config/env');
const ApiError = require('../utils/apiError');
const { logger } = require('../utils/logger');

// Security Analysis Integration (docs/PROJECT_SPEC.md section 3.7, docs/API_CONTRACT.md section 13.1).
//
// Manages security finding reporting and analysis. All findings are persisted in
// security_findings by the analyzer; sensitive values (passwords, tokens, API keys)
// are pre-masked by maskLine in securityScanner.js and never exposed in API outputs.

function computeSecuritySummary(findings) {
  const summary = {
    total: findings.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    categories: {},
  };

  for (const finding of findings) {
    const severity = (finding.severity || 'info').toLowerCase();
    if (summary[severity] !== undefined) {
      summary[severity] += 1;
    }

    const category = finding.category || 'other';
    summary.categories[category] = (summary.categories[category] || 0) + 1;
  }

  return summary;
}

async function getSecurityFindings(userId, projectId) {
  // 1. Verify project ownership (docs/API_CONTRACT.md section 26)
  const project = await projectService.getOwnedProject(userId, projectId);

  // 2. Fetch security findings persisted for project
  const rows = await securityFindingRepository.findByProjectId(project.id);
  const findings = rows.map(toPublicFinding);
  const summary = computeSecuritySummary(findings);

  logger.info('Retrieved security findings', {
    projectId: project.id,
    totalFindings: summary.total,
    critical: summary.critical,
    high: summary.high,
  });

  return { findings, summary };
}

async function getSecurityFindingById(userId, projectId, findingId, options = {}) {
  const shouldExplain = Boolean(options.explain);

  // 1. Verify project ownership
  const project = await projectService.getOwnedProject(userId, projectId);

  // 2. Fetch finding by ID
  const row = await securityFindingRepository.findById(project.id, findingId);
  if (!row) {
    throw new ApiError(404, 'FINDING_NOT_FOUND', 'Security finding was not found.');
  }

  const finding = toPublicFinding(row);

  let affectedFilePayload = null;
  if (finding.fileId) {
    const fileRow = await projectFileRepository.findByIdAndProject(project.id, finding.fileId);
    if (fileRow) {
      affectedFilePayload = {
        fileId: Number(fileRow.id),
        path: fileRow.path,
        name: fileRow.name,
        language: fileRow.language,
        healthStatus: fileRow.health_status,
      };
    }
  }

  const payload = {
    finding,
    affectedFile: affectedFilePayload,
    explanation: null,
  };

  if (shouldExplain) {
    try {
      const securityContext = await contextBuilder.buildSecurityContext(project.id);
      const systemPrompt = `You are a cybersecurity expert analyzing project vulnerabilities.
Explain the risk associated with this finding, potential exploit vectors, and recommended remediation steps.
Rely strictly on the provided factual evidence and do not invent any non-existent vulnerabilities or credentials.`;

      const providerMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Provide remediation advice for security finding #${finding.findingId} [${finding.severity} - ${finding.category}]: "${finding.title}" in file "${finding.filePath || 'project'}".\nDescription: ${finding.description}\nEvidence: ${finding.evidence || 'N/A'}\n\n${securityContext.text}` },
      ];

      const response = await aiProvider.generateResponse(providerMessages, {
        temperature: config.ai.chat.temperature,
        maxTokens: config.ai.chat.maxTokens,
      });

      payload.explanation = response.content;
    } catch (error) {
      logger.warn('AI security explanation generation failed', {
        projectId: project.id,
        findingId: finding.findingId,
        message: error.message,
      });
      payload.explanation = 'AI remediation analysis is currently unavailable. Review the recommendation and masked evidence above.';
    }
  }

  return payload;
}

module.exports = {
  getSecurityFindings,
  getSecurityFindingById,
  computeSecuritySummary,
};
