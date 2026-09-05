'use strict';

// Public surface of the AI context layer (docs/PROJECT_SPEC.md section 4.2,
// docs/TEAM_RULES.md section 17). The rest of the backend requires this
// module — never the internal builder/budget files:
//
//   const context = require('../ai/context');
//   const fileContext = await context.buildFileContext(projectId, fileId);
//
// Every builder assembles focused context from stored analyzer data only,
// keeps it within the configured character/token budget, and is
// provider-independent: the result is plain text plus a structured section
// list that any provider (or none) can consume.
//
// Callers verify project ownership before building; every query inside is
// additionally scoped to the project, and lookups of files/issues inside a
// project context answer 404 FILE_NOT_FOUND / ISSUE_NOT_FOUND otherwise.

const contextBuilder = require('./contextBuilder');

module.exports = {
  buildProjectContext: contextBuilder.buildProjectContext,
  buildFileContext: contextBuilder.buildFileContext,
  buildIssueContext: contextBuilder.buildIssueContext,
  buildArchitectureContext: contextBuilder.buildArchitectureContext,
  buildDependencyContext: contextBuilder.buildDependencyContext,
  buildImpactContext: contextBuilder.buildImpactContext,
  buildSecurityContext: contextBuilder.buildSecurityContext,
};
