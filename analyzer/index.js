'use strict';

// TechBridge AI analyzer — public entry point.
//
// The analyzer owns project analysis (docs/ARCHITECTURE.md section 10-11):
// it walks an extracted project and returns factual, deterministic results.
// It never talks to the database or HTTP — the backend orchestrates it and
// persists the result ("The analyzer should remain responsible for project
// analysis; the backend orchestrates it and persists results").
//
// Pipeline (docs/PROJECT_SPEC.md sections 3.3-3.10):
//   discovery → languages → dependencies → relationships → api_detection
//   → database_detection → security → issues → health

const { loadProjectInput } = require('./ingestion/projectInput');
const { discoverFiles, loadTextContents } = require('./discovery/fileDiscovery');
const { aggregateLanguages } = require('./parsers/languageDetector');
const { detectDependencies } = require('./dependencies/dependencyDetector');
const { detectRelationships } = require('./relationships/relationshipDetector');
const { detectApiEndpoints } = require('./api_detection/apiDetector');
const { detectDatabaseEntities } = require('./database_detection/databaseDetector');
const { scanSecurity } = require('./security/securityScanner');
const { detectIssues } = require('./issues/issueDetector');
const {
  calculateFileHealth,
  calculateProjectHealth,
} = require('./health/healthCalculator');

// Stage name → cumulative progress percent reported through onStage.
const STAGE_PROGRESS = {
  discovery: 10,
  languages: 20,
  dependencies: 30,
  relationships: 40,
  api_detection: 50,
  database_detection: 60,
  security: 70,
  issues: 80,
  health: 90,
};

async function reportStage(onStage, stage) {
  if (!onStage) return;
  try {
    await onStage(stage, STAGE_PROGRESS[stage]);
  } catch {
    // Progress reporting must never break the analysis itself.
  }
}

// analyzeProject(projectRoot, { onStage }) → AnalysisResult
//
// AnalysisResult (all paths project-relative, forward slashes):
//   summary            — { totalFiles, totalDirectories, totalLines,
//                          totalSizeBytes, primaryLanguage, languages,
//                          framework, projectType }
//   files              — rows for project_files (path, parentPath, ...)
//   dependencies       — rows for project_dependencies
//   relationships      — rows for code_relationships
//   apiEndpoints       — rows for api_endpoints
//   databaseEntities   — rows for database_entities
//   securityFindings   — rows for security_findings (evidence pre-masked)
//   issues             — rows for analysis_issues
//   fileHealth         — { path, healthScore, healthStatus, analysisStatus }
//   projectHealth      — { score, healthyFiles, ..., issueCounts, securityCounts }
async function analyzeProject(projectRoot, options = {}) {
  const onStage = typeof options.onStage === 'function' ? options.onStage : null;

  const input = await loadProjectInput(projectRoot);

  // 1. Discover project files (files and directories).
  const files = await discoverFiles(input);
  await reportStage(onStage, 'discovery');

  // 2. Detect languages.
  const languageInfo = aggregateLanguages(files);
  await reportStage(onStage, 'languages');

  // Load text content once for every deep-analysis stage.
  const sourceFiles = await loadTextContents(input.root, files);

  // 3. Detect dependencies.
  const dependencyInfo = detectDependencies(sourceFiles, files);
  await reportStage(onStage, 'dependencies');

  // 4. Detect relationships.
  const relationshipInfo = detectRelationships(sourceFiles, files);
  await reportStage(onStage, 'relationships');

  // 5. Detect APIs.
  const apiEndpoints = detectApiEndpoints(sourceFiles, dependencyInfo.profile);
  await reportStage(onStage, 'api_detection');

  // 6. Detect database usage.
  const databaseEntities = detectDatabaseEntities(sourceFiles);
  await reportStage(onStage, 'database_detection');

  // 7. Detect security findings.
  const securityFindings = scanSecurity(sourceFiles);
  await reportStage(onStage, 'security');

  // 8. Detect issues.
  const issues = detectIssues(sourceFiles, dependencyInfo, relationshipInfo);
  await reportStage(onStage, 'issues');

  // 9 + 10. Calculate file health and the project health score.
  const parsedPaths = new Set(sourceFiles.map((file) => file.path));
  const fileHealth = calculateFileHealth(files, issues, securityFindings, parsedPaths);
  const projectHealth = calculateProjectHealth(fileHealth, issues, securityFindings);
  await reportStage(onStage, 'health');

  const fileRows = files.filter((file) => file.fileType === 'file');
  const summary = {
    totalFiles: fileRows.length,
    totalDirectories: files.length - fileRows.length,
    totalLines: fileRows.reduce((sum, file) => sum + (file.lineCount || 0), 0),
    totalSizeBytes: fileRows.reduce((sum, file) => sum + (file.sizeBytes || 0), 0),
    primaryLanguage: languageInfo.primaryLanguage,
    languages: languageInfo.languages,
    framework: dependencyInfo.profile.framework,
    projectType: dependencyInfo.profile.projectType,
  };

  return {
    summary,
    files,
    dependencies: dependencyInfo.dependencies,
    relationships: relationshipInfo.relationships,
    apiEndpoints,
    databaseEntities,
    securityFindings,
    issues,
    fileHealth,
    projectHealth,
  };
}

module.exports = { analyzeProject, STAGE_PROGRESS };
