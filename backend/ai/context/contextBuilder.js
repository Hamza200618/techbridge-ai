'use strict';

const fs = require('fs/promises');
const path = require('path');
const config = require('../../config/env');
const projectRepository = require('../../repositories/projectRepository');
const projectFileRepository = require('../../repositories/projectFileRepository');
const dependencyRepository = require('../../repositories/dependencyRepository');
const relationshipRepository = require('../../repositories/relationshipRepository');
const apiEndpointRepository = require('../../repositories/apiEndpointRepository');
const databaseEntityRepository = require('../../repositories/databaseEntityRepository');
const issueRepository = require('../../repositories/issueRepository');
const securityFindingRepository = require('../../repositories/securityFindingRepository');
const projectStorage = require('../../storage/projectStorage');
const ApiError = require('../../utils/apiError');
const { ContextBudget } = require('./contextBudget');

// AI context builder (docs/PROJECT_SPEC.md section 4.2, docs/ARCHITECTURE.md
// section 15, docs/TEAM_RULES.md section 17).
//
// Assembles FOCUSED context for AI operations from stored analyzer data
// only — project_files, project_dependencies, code_relationships,
// api_endpoints, database_entities, analysis_issues and security_findings —
// plus bounded source excerpts read from the project's working copy. The
// entire project is never sent to a provider: every builder selects the
// slice of knowledge relevant to one question and caps it with a
// ContextBudget.
//
// Nothing is invented (docs/TEAM_RULES.md section 17): files, dependencies,
// relationships, APIs, database entities, issues and findings all come from
// the database rows the analyzer produced. Absent data is reported as
// absent, never guessed.
//
// Provider-independent: output is plain text plus a structured section list
// that any provider (or none) can consume. Callers verify project ownership
// first; every query below is additionally scoped to the project.

// Per-line rendering cap (minified files, long descriptions).
const MAX_LINE_CHARS = 300;
// Cap on excerpt lines per file (budget caps the characters anyway).
const MAX_EXCERPT_LINES = 200;

function capLine(line, max = MAX_LINE_CHARS) {
  const text = String(line).replace(/\s+$/, '');
  return text.length > max ? `${text.slice(0, max)} …[truncated]` : text;
}

function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Row → line renderers (facts only, one row per line) ───────────────────

function fileLabel(file) {
  if (file.file_type === 'directory') return `${file.path}/ (directory)`;
  const parts = [file.path];
  if (file.language) parts.push(file.language);
  if (Number(file.line_count) > 0) parts.push(`${file.line_count} lines`);
  parts.push(formatSize(file.size_bytes));
  if (Number(file.is_binary)) parts.push('binary');
  else if (Number(file.is_generated)) parts.push('generated');
  else if (Number(file.is_ignored)) parts.push('ignored');
  parts.push(`health: ${file.health_status || 'unknown'} (${Number(file.health_score) || 0}/100)`);
  return parts.join(' — ');
}

function issueLine(issue) {
  const where = issue.file_path ? ` (${issue.file_path})` : '';
  return `[${issue.severity}] ${issue.issue_type}: ${issue.title}${where}`;
}

function findingLine(finding) {
  const where = finding.file_path ? ` (${finding.file_path})` : '';
  return `[${finding.severity}] ${finding.category}: ${finding.title}${where}`;
}

function endpointLine(endpoint) {
  const parts = [`${(endpoint.method || 'GET').toUpperCase()} ${endpoint.route}`];
  if (endpoint.controller_name) parts.push(`controller: ${endpoint.controller_name}`);
  if (Number(endpoint.authentication_required)) parts.push('auth required');
  if (endpoint.framework) parts.push(endpoint.framework);
  if (endpoint.file_path) parts.push(`(${endpoint.file_path})`);
  return parts.join(' — ');
}

function entityLine(entity) {
  const database = entity.database_name ? ` @ ${entity.database_name}` : '';
  const where = entity.file_path ? ` (${entity.file_path})` : '';
  return `${entity.entity_type} ${entity.name}${database}${where}`;
}

function dependencyLine(dependency) {
  const version = dependency.version ? ` ${dependency.version}` : '';
  const manager = dependency.package_manager ? `, ${dependency.package_manager}` : '';
  const security = dependency.security_status && dependency.security_status !== 'unknown'
    ? `, ${dependency.security_status}`
    : '';
  return `${dependency.name}${version} (${dependency.dependency_type}${manager}${security})`;
}

function relationshipLine(edge) {
  const symbol = edge.symbol_name ? ` [${edge.symbol_name}]` : '';
  return `${edge.source_path} --${edge.relationship_type}--> ${edge.target_path || '(unresolved)'}${symbol}`;
}

// Edge direction relative to an anchor file, for per-file sections.
function edgeLineRelative(edge, anchorFileId) {
  const symbol = edge.symbol_name ? ` [${edge.symbol_name}]` : '';
  if (Number(edge.source_file_id) === Number(anchorFileId)) {
    return `this file --${edge.relationship_type}--> ${edge.target_path || '(unresolved)'}${symbol}`;
  }
  return `${edge.source_path} --${edge.relationship_type}--> this file${symbol}`;
}

// ── Aggregation helpers (counts computed from real rows) ──────────────────

function severityCountLine(items) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const item of items) {
    if (counts[item.severity] !== undefined) counts[item.severity] += 1;
  }
  const detail = Object.entries(counts).map(([severity, count]) => `${severity} ${count}`).join(', ');
  return `Severity counts: ${detail}`;
}

function categoryCountLine(findings) {
  const counts = new Map();
  for (const finding of findings) {
    counts.set(finding.category, (counts.get(finding.category) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length === 0) return 'Categories: none';
  return `Categories: ${sorted.slice(0, 10).map(([category, count]) => `${category} ${count}`).join(', ')}`;
}

function dependencyTypeLine(dependencies) {
  const counts = new Map();
  for (const dependency of dependencies) {
    counts.set(dependency.dependency_type, (counts.get(dependency.dependency_type) || 0) + 1);
  }
  const detail = [...counts.entries()].map(([type, count]) => `${type} ${count}`).join(', ');
  return `Total: ${dependencies.length} (${detail})`;
}

function languageBreakdownLines(files) {
  const counts = new Map();
  for (const file of files) {
    if (file.file_type !== 'file') continue;
    const language = file.language || 'Other';
    counts.set(language, (counts.get(language) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (sorted.length === 0) return ['No files discovered.'];
  return sorted.slice(0, 10).map(([language, count]) => `${language}: ${count} file${count === 1 ? '' : 's'}`);
}

function structureLines(files) {
  const byTop = new Map();
  let rootFiles = 0;
  let directories = 0;
  for (const file of files) {
    if (file.file_type === 'directory') {
      directories += 1;
      continue;
    }
    const separator = file.path.indexOf('/');
    if (separator === -1) {
      rootFiles += 1;
      continue;
    }
    const top = file.path.slice(0, separator);
    byTop.set(top, (byTop.get(top) || 0) + 1);
  }
  const sorted = [...byTop.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const lines = sorted.slice(0, 15).map(([dir, count]) => `${dir}/ — ${count} file${count === 1 ? '' : 's'}`);
  if (rootFiles > 0) lines.push(`(root) — ${rootFiles} file${rootFiles === 1 ? '' : 's'}`);
  if (sorted.length > 15) lines.push(`... ${sorted.length - 15} more top-level directories omitted`);
  lines.push(`Total directories: ${directories}`);
  return lines;
}

function healthCountLines(files) {
  const counts = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
  for (const file of files) {
    if (file.file_type !== 'file') continue;
    if (counts[file.health_status] !== undefined) counts[file.health_status] += 1;
  }
  const summary = Object.entries(counts).map(([status, count]) => `${status} ${count}`).join(', ');
  const criticalFiles = files.filter((file) => file.file_type === 'file' && file.health_status === 'critical');
  return [`Files by health: ${summary}`, ...criticalFiles.slice(0, 20).map(fileLabel)];
}

function projectOverviewLines(project) {
  return [
    `Name: ${project.name}`,
    `Status: ${project.status}`,
    `Primary language: ${project.primary_language || 'not detected'}`,
    `Framework: ${project.framework || 'not detected'}`,
    `Project type: ${project.project_type || 'not detected'}`,
    `Health score: ${Number(project.health_score) || 0}/100`,
    `Size: ${Number(project.total_files) || 0} files, ${Number(project.total_lines) || 0} lines (${formatSize(project.total_size_bytes)})`,
  ];
}

function issueDetailLines(issue) {
  const lines = [
    `Severity: ${issue.severity}`,
    `Type: ${issue.issue_type}`,
    `Title: ${capLine(issue.title)}`,
    `Description: ${capLine(issue.description)}`,
  ];
  if (issue.root_cause) lines.push(`Root cause: ${capLine(issue.root_cause)}`);
  if (issue.suggested_fix) lines.push(`Suggested fix: ${capLine(issue.suggested_fix)}`);
  if (issue.confidence !== null && issue.confidence !== undefined) {
    lines.push(`Confidence: ${Number(issue.confidence)} (${issue.detection_source || 'unknown source'})`);
  }
  if (issue.status) lines.push(`Status: ${issue.status}`);
  return lines;
}

function evidenceLines(evidence) {
  if (!evidence) return ['No evidence recorded for this issue.'];
  const lines = String(evidence).split('\n').filter(Boolean).slice(0, 10).map((line) => capLine(line));
  return lines.length > 0 ? lines : ['No evidence recorded for this issue.'];
}

// ── Data helpers ───────────────────────────────────────────────────────────

async function requireProject(projectId) {
  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Project was not found.');
  }
  return project;
}

async function requireProjectFile(projectId, fileId) {
  const file = await projectFileRepository.findByIdAndProject(projectId, fileId);
  if (!file) {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }
  return file;
}

async function loadProjectData(projectId) {
  const [files, dependencies, edges, endpoints, entities, issues, findings] = await Promise.all([
    projectFileRepository.findByProjectId(projectId),
    dependencyRepository.findByProjectId(projectId),
    relationshipRepository.findByProjectId(projectId),
    apiEndpointRepository.findByProjectId(projectId),
    databaseEntityRepository.findByProjectId(projectId),
    issueRepository.findByProjectId(projectId),
    securityFindingRepository.findByProjectId(projectId),
  ]);
  return { files, dependencies, edges, endpoints, entities, issues, findings };
}

// Loads the files on the other end of the given edges (excluding the anchor).
async function loadNeighbourFiles(projectId, edges, anchorFileId) {
  const ids = new Set();
  for (const edge of edges) {
    ids.add(Number(edge.source_file_id));
    if (edge.target_file_id !== null) ids.add(Number(edge.target_file_id));
  }
  ids.delete(Number(anchorFileId));
  if (ids.size === 0) return [];
  return projectFileRepository.findByIds(projectId, [...ids]);
}

// Reads a bounded source excerpt from the project's working copy. The stored
// path is only trusted after re-resolving it inside the working directory
// (same containment rule as the file-content API, docs/API_CONTRACT.md
// section 33). Returns null when no excerpt can be read — callers then fall
// back to manifest-level information instead of guessing file contents.
async function readFileExcerpt(project, file, maxChars) {
  if (!project.working_path) return null;
  if (file.file_type !== 'file' || Number(file.is_binary)) return null;

  const workingDir = projectStorage.fromStoredPath(project.working_path);
  const filePath = path.resolve(workingDir, String(file.path));
  if (filePath !== workingDir && !filePath.startsWith(workingDir + path.sep)) return null;

  let handle;
  try {
    handle = await fs.open(filePath, 'r');
  } catch {
    return null;
  }
  try {
    // Read at most enough bytes for maxChars characters (UTF-8 is up to 4
    // bytes per character) — large files are never fully loaded.
    const maxBytes = maxChars * 4 + 64;
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    if (bytesRead === 0) return null;

    let text = buffer.toString('utf8', 0, bytesRead);
    let truncated = (Number(file.size_bytes) || 0) > bytesRead;
    if (text.length > maxChars) {
      text = text.slice(0, maxChars);
      truncated = true;
    }
    const allLines = text.split('\n');
    if (allLines.length > MAX_EXCERPT_LINES) truncated = true;
    const lines = allLines.slice(0, MAX_EXCERPT_LINES).map((line) => capLine(line));
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length === 0) return null;
    return { lines, rawText: text, truncated };
  } finally {
    await handle.close();
  }
}

// Selects declared dependencies actually referenced in the given source
// text. Tokens split on non-package-name characters so '@scope/pkg' and
// 'flask_sqlalchemy' match exactly; names come from project_dependencies
// rows only — nothing is invented.
function dependenciesReferencedIn(dependencies, text) {
  if (text == null) return null;
  const tokens = new Set(text.split(/[^A-Za-z0-9@/._-]+/).filter(Boolean));
  return dependencies.filter((dependency) => tokens.has(dependency.name));
}

// Dependencies section shared by the file and issue builders: prefer the
// dependencies the source actually references; fall back to a capped
// manifest overview when no source excerpt is available.
function addDependencySection(budget, dependencies, excerpt) {
  const referenced = excerpt ? dependenciesReferencedIn(dependencies, excerpt.rawText) : null;
  if (referenced === null) {
    budget.addSection(
      'Declared project dependencies (manifest)',
      dependencies.slice(0, 30).map(dependencyLine),
    );
    return;
  }
  if (referenced.length === 0) {
    budget.addSection(
      'Declared dependencies referenced in this file',
      ['None of the declared dependencies are referenced in this file.'],
    );
    return;
  }
  budget.addSection('Declared dependencies referenced in this file', referenced.map(dependencyLine));
}

function finalizeContext(type, meta, budget) {
  const text = budget.render();
  return {
    type,
    ...meta,
    text,
    totalChars: text.length,
    estimatedTokens: ContextBudget.estimateTokens(text),
    truncated: budget.sections.some((section) => section.omitted > 0),
    sections: budget.sections,
  };
}

function contextBudget(options) {
  return new ContextBudget(options.maxChars || config.ai.contextMaxChars);
}

function excerptChars(options) {
  return options.excerptChars || config.ai.contextFileExcerptChars;
}

// ── 1. Project context (project-wide questions) ────────────────────────────
// docs/TEAM_RULES.md section 17 "For project chat": project summary,
// architecture, dependencies, APIs, database usage, issues, security
// findings, relevant files — counts plus capped highlights, never full dumps.

async function buildProjectContext(projectId, options = {}) {
  const project = await requireProject(projectId);
  const budget = contextBudget(options);
  const { files, dependencies, edges, endpoints, entities, issues, findings } = await loadProjectData(projectId);

  budget.addSection('Project overview', projectOverviewLines(project));
  budget.addSection('Languages', languageBreakdownLines(files));
  budget.addSection('Issues', [
    severityCountLine(issues),
    ...issues.slice(0, 15).map(issueLine),
  ]);
  budget.addSection('Security findings', [
    severityCountLine(findings),
    ...findings.slice(0, 15).map(findingLine),
  ]);
  budget.addSection('Dependencies', [
    dependencyTypeLine(dependencies),
    ...dependencies.slice(0, 25).map(dependencyLine),
  ]);
  budget.addSection('API endpoints', [
    `Total: ${endpoints.length}`,
    ...endpoints.slice(0, 25).map(endpointLine),
  ]);
  budget.addSection('Database entities', [
    `Total: ${entities.length}`,
    ...entities.slice(0, 25).map(entityLine),
  ]);
  budget.addSection('Module relationships', [
    `Total: ${edges.length}`,
    ...edges.slice(0, 25).map(relationshipLine),
  ]);
  budget.addSection('Project structure', structureLines(files));

  return finalizeContext('project', { projectId: Number(project.id), projectName: project.name }, budget);
}

// ── 2. File context (questions about one selected file) ───────────────────
// docs/TEAM_RULES.md section 17 "For file chat" + docs/ARCHITECTURE.md
// section 15: selected file, its source excerpt, its issues and security
// findings, related files (code relationships), relevant dependencies and
// the architecture bits the file participates in.

async function buildFileContext(projectId, fileId, options = {}) {
  const project = await requireProject(projectId);
  const file = await requireProjectFile(projectId, fileId);
  const budget = contextBudget(options);

  const [dependencies, edges, issues, findings, endpoints, entities] = await Promise.all([
    dependencyRepository.findByProjectId(projectId),
    relationshipRepository.findByFileId(projectId, file.id),
    issueRepository.findByFileId(projectId, file.id),
    securityFindingRepository.findByFileId(projectId, file.id),
    apiEndpointRepository.findByFileId(projectId, file.id),
    databaseEntityRepository.findByFileId(projectId, file.id),
  ]);

  const excerpt = await readFileExcerpt(project, file, excerptChars(options));
  const relatedFiles = await loadNeighbourFiles(projectId, edges, file.id);

  budget.addSection('Selected file', [fileLabel(file)]);
  if (excerpt) {
    budget.addSection(excerpt.truncated ? 'Source (excerpt, truncated)' : 'Source', excerpt.lines);
  }
  budget.addSection('Issues in this file', issues.slice(0, 15).map(issueLine));
  budget.addSection('Security findings in this file', findings.slice(0, 15).map(findingLine));
  budget.addSection(
    'Related files (code relationships)',
    edges.length > 0
      ? edges.map((edge) => edgeLineRelative(edge, file.id))
      : ['No code relationships detected for this file.'],
  );
  budget.addSection('Related file details', relatedFiles.slice(0, 15).map(fileLabel));
  addDependencySection(budget, dependencies, excerpt);
  budget.addSection('API endpoints defined in this file', endpoints.map(endpointLine));
  budget.addSection('Database entities referenced in this file', entities.map(entityLine));
  budget.addSection('Project overview', projectOverviewLines(project));

  return finalizeContext('file', {
    projectId: Number(project.id),
    projectName: project.name,
    fileId: Number(file.id),
    filePath: file.path,
  }, budget);
}

// ── 3. Issue context (diagnosis of one issue) ─────────────────────────────
// docs/TEAM_RULES.md section 17 "For issue diagnosis": issue, evidence,
// affected file, related files, relevant dependencies and the project
// relationships around the affected file.

async function buildIssueContext(projectId, issueId, options = {}) {
  const project = await requireProject(projectId);
  const issue = await issueRepository.findById(projectId, issueId);
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Issue was not found.');
  }
  const budget = contextBudget(options);

  const affectedFile = issue.file_id
    ? await projectFileRepository.findByIdAndProject(projectId, issue.file_id)
    : null;

  const [dependencies, allEdges] = await Promise.all([
    dependencyRepository.findByProjectId(projectId),
    affectedFile ? relationshipRepository.findByProjectId(projectId) : Promise.resolve([]),
  ]);

  const touchingEdges = affectedFile
    ? allEdges.filter(
        (edge) => Number(edge.source_file_id) === Number(affectedFile.id)
          || Number(edge.target_file_id) === Number(affectedFile.id),
      )
    : [];
  const relatedFiles = affectedFile ? await loadNeighbourFiles(projectId, touchingEdges, affectedFile.id) : [];

  // Local subgraph: edges among the affected file and its neighbours.
  const localIds = new Set();
  if (affectedFile) {
    localIds.add(Number(affectedFile.id));
    for (const related of relatedFiles) localIds.add(Number(related.id));
  }
  const localEdges = localIds.size > 0
    ? allEdges.filter(
        (edge) => localIds.has(Number(edge.source_file_id)) && localIds.has(Number(edge.target_file_id)),
      )
    : [];

  const excerpt = affectedFile ? await readFileExcerpt(project, affectedFile, excerptChars(options)) : null;

  budget.addSection('Issue', issueDetailLines(issue));
  budget.addSection('Evidence', evidenceLines(issue.evidence));
  budget.addSection(
    'Affected file',
    affectedFile ? [fileLabel(affectedFile)] : ['No specific file is affected by this issue.'],
  );
  if (excerpt) {
    budget.addSection(
      excerpt.truncated ? 'Affected file source (excerpt, truncated)' : 'Affected file source',
      excerpt.lines,
    );
  }
  budget.addSection(
    'Related files (code relationships)',
    affectedFile
      ? (touchingEdges.length > 0
        ? touchingEdges.map((edge) => edgeLineRelative(edge, affectedFile.id))
        : ['No code relationships detected for the affected file.'])
      : ['No affected file to trace relationships from.'],
  );
  budget.addSection('Related file details', relatedFiles.slice(0, 15).map(fileLabel));
  addDependencySection(budget, dependencies, excerpt);
  budget.addSection(
    'Project relationships (around the affected file)',
    affectedFile
      ? (localEdges.length > 0 ? localEdges.map(relationshipLine) : ['No relationships detected around the affected file.'])
      : (allEdges.length > 0 ? allEdges.slice(0, 30).map(relationshipLine) : ['No code relationships detected in this project.']),
  );
  budget.addSection('Project overview', projectOverviewLines(project));

  return finalizeContext('issue', {
    projectId: Number(project.id),
    projectName: project.name,
    issueId: Number(issue.id),
    issueTitle: issue.title,
    fileId: affectedFile ? Number(affectedFile.id) : null,
    filePath: affectedFile ? affectedFile.path : null,
  }, budget);
}

// ── 4. Architecture context (structure-level questions) ───────────────────

async function buildArchitectureContext(projectId, options = {}) {
  const project = await requireProject(projectId);
  const budget = contextBudget(options);
  const { files, dependencies, edges, endpoints, entities, issues, findings } = await loadProjectData(projectId);

  budget.addSection('Project overview', projectOverviewLines(project));
  budget.addSection('Project structure', structureLines(files));
  budget.addSection('Languages', languageBreakdownLines(files));
  budget.addSection('Module relationships', [
    `Total: ${edges.length}`,
    ...edges.slice(0, 50).map(relationshipLine),
  ]);
  budget.addSection('API endpoints', [
    `Total: ${endpoints.length}`,
    ...endpoints.slice(0, 30).map(endpointLine),
  ]);
  budget.addSection('Database entities', [
    `Total: ${entities.length}`,
    ...entities.slice(0, 30).map(entityLine),
  ]);
  budget.addSection('Dependencies', [
    dependencyTypeLine(dependencies),
    ...dependencies.slice(0, 25).map(dependencyLine),
  ]);
  budget.addSection('File health', healthCountLines(files));
  budget.addSection('Top issues', [severityCountLine(issues), ...issues.slice(0, 10).map(issueLine)]);
  budget.addSection('Top security findings', [
    severityCountLine(findings),
    ...findings.slice(0, 10).map(findingLine),
  ]);

  return finalizeContext('architecture', { projectId: Number(project.id), projectName: project.name }, budget);
}

// ── 5. Dependency context (dependency questions) ──────────────────────────

async function buildDependencyContext(projectId, options = {}) {
  const project = await requireProject(projectId);
  const budget = contextBudget(options);

  const [dependencies, issues] = await Promise.all([
    dependencyRepository.findByProjectId(projectId),
    issueRepository.findByProjectId(projectId),
  ]);

  const managers = [...new Set(dependencies.map((dependency) => dependency.package_manager).filter(Boolean))];
  const manifestIds = [...new Set(
    dependencies.map((dependency) => dependency.source_file_id).filter((id) => id !== null),
  )];
  const manifestFiles = await projectFileRepository.findByIds(projectId, manifestIds);

  const runtime = dependencies.filter((dependency) => dependency.dependency_type === 'runtime');
  const development = dependencies.filter((dependency) => dependency.dependency_type === 'development');
  const other = dependencies.filter(
    (dependency) => dependency.dependency_type !== 'runtime' && dependency.dependency_type !== 'development',
  );

  const overview = [dependencyTypeLine(dependencies)];
  if (managers.length > 0) overview.push(`Package managers: ${managers.join(', ')}`);
  if (manifestFiles.length > 0) {
    overview.push(`Declared in: ${manifestFiles.map((file) => file.path).join(', ')}`);
  }

  budget.addSection('Dependency overview', overview);
  budget.addSection(
    'Runtime dependencies',
    runtime.length > 0 ? runtime.slice(0, 40).map(dependencyLine) : ['No runtime dependencies declared.'],
  );
  budget.addSection(
    'Development dependencies',
    development.length > 0 ? development.slice(0, 25).map(dependencyLine) : ['No development dependencies declared.'],
  );
  budget.addSection(
    'Peer/optional/other dependencies',
    other.length > 0 ? other.slice(0, 25).map(dependencyLine) : ['No peer, optional or unknown dependencies declared.'],
  );

  const dependencyIssues = issues.filter((issue) => issue.issue_type === 'dependency');
  budget.addSection(
    'Dependency issues',
    dependencyIssues.length > 0
      ? dependencyIssues.slice(0, 20).map(issueLine)
      : ['No dependency issues detected.'],
  );
  budget.addSection('Project overview', projectOverviewLines(project));

  return finalizeContext('dependency', { projectId: Number(project.id), projectName: project.name }, budget);
}

// ── 6. Impact context (what breaks if a file changes) ─────────────────────

async function buildImpactContext(projectId, fileId, options = {}) {
  const project = await requireProject(projectId);
  const file = await requireProjectFile(projectId, fileId);
  const budget = contextBudget(options);

  const allEdges = await relationshipRepository.findByProjectId(projectId);
  const forward = new Map(); // source file id -> outgoing edges
  const reverse = new Map(); // target file id -> incoming edges
  for (const edge of allEdges) {
    const sourceId = Number(edge.source_file_id);
    if (!forward.has(sourceId)) forward.set(sourceId, []);
    forward.get(sourceId).push(edge);
    if (edge.target_file_id !== null) {
      const targetId = Number(edge.target_file_id);
      if (!reverse.has(targetId)) reverse.set(targetId, []);
      reverse.get(targetId).push(edge);
    }
  }

  const anchorId = Number(file.id);
  const dependentEdges = reverse.get(anchorId) || [];
  const dependencyEdges = forward.get(anchorId) || [];

  const directDependentIds = [...new Set(dependentEdges.map((edge) => Number(edge.source_file_id)))]
    .filter((id) => id !== anchorId);
  const directDependencyIds = [...new Set(
    dependencyEdges
      .map((edge) => (edge.target_file_id === null ? null : Number(edge.target_file_id)))
      .filter((id) => id !== null && id !== anchorId),
  )];

  // Second hop: files that import the direct dependents (excluding the
  // anchor and the direct dependents themselves).
  const secondHopEdges = [];
  const secondHopIds = new Set();
  for (const dependentId of directDependentIds) {
    for (const edge of reverse.get(dependentId) || []) {
      const sourceId = Number(edge.source_file_id);
      if (sourceId === anchorId || directDependentIds.includes(sourceId)) continue;
      if (!secondHopIds.has(sourceId)) {
        secondHopIds.add(sourceId);
        secondHopEdges.push(edge);
      }
    }
  }

  const affectedIds = [anchorId, ...directDependentIds, ...directDependencyIds, ...secondHopIds];
  const [affectedFiles, issues, findings, endpoints, entities] = await Promise.all([
    projectFileRepository.findByIds(projectId, affectedIds),
    issueRepository.findByFileIds(projectId, affectedIds),
    securityFindingRepository.findByFileIds(projectId, affectedIds),
    apiEndpointRepository.findByFileIds(projectId, affectedIds),
    databaseEntityRepository.findByFileIds(projectId, affectedIds),
  ]);

  budget.addSection('Target file', [fileLabel(file)]);
  budget.addSection(
    'Direct dependents (files importing this file)',
    dependentEdges.length > 0 ? dependentEdges.map(relationshipLine) : ['No project files import this file.'],
  );
  budget.addSection(
    'Direct dependencies (files this file imports)',
    dependencyEdges.length > 0 ? dependencyEdges.map(relationshipLine) : ['This file imports no other project files.'],
  );
  budget.addSection(
    'Transitive impact (second hop)',
    secondHopEdges.length > 0 ? secondHopEdges.map(relationshipLine) : ['No transitive dependents beyond the direct dependents.'],
  );
  budget.addSection(
    'Affected files',
    affectedFiles.filter((affected) => Number(affected.id) !== anchorId).slice(0, 25).map(fileLabel),
  );
  budget.addSection('Issues in affected files', issues.slice(0, 20).map(issueLine));
  budget.addSection('Security findings in affected files', findings.slice(0, 20).map(findingLine));
  budget.addSection('API endpoints in affected files', endpoints.slice(0, 20).map(endpointLine));
  budget.addSection('Database entities in affected files', entities.slice(0, 20).map(entityLine));
  budget.addSection('Project overview', projectOverviewLines(project));

  return finalizeContext('impact', {
    projectId: Number(project.id),
    projectName: project.name,
    fileId: Number(file.id),
    filePath: file.path,
    directDependents: directDependentIds.length,
    directDependencies: directDependencyIds.length,
    transitiveDependents: secondHopIds.size,
  }, budget);
}

// ── 7. Security context (security questions) ──────────────────────────────

async function buildSecurityContext(projectId, options = {}) {
  const project = await requireProject(projectId);
  const budget = contextBudget(options);

  const [files, findings, issues] = await Promise.all([
    projectFileRepository.findByProjectId(projectId),
    securityFindingRepository.findByProjectId(projectId),
    issueRepository.findByProjectId(projectId),
  ]);

  const findingBlocks = [];
  for (const finding of findings.slice(0, 25)) {
    findingBlocks.push(findingLine(finding));
    const evidence = String(finding.evidence || '').split('\n').filter(Boolean).slice(0, 3);
    for (const line of evidence) findingBlocks.push(`    ${capLine(line)}`);
    if (finding.recommendation) findingBlocks.push(`    fix: ${capLine(finding.recommendation)}`);
  }

  const affectedCounts = new Map();
  for (const finding of findings) {
    const key = finding.file_path || '(no file)';
    affectedCounts.set(key, (affectedCounts.get(key) || 0) + 1);
  }
  const affectedLines = [...affectedCounts.entries()].slice(0, 20).map(([filePath, count]) => {
    const fileRow = files.find((file) => file.path === filePath && file.file_type === 'file');
    const health = fileRow ? `, health: ${fileRow.health_status}` : '';
    return `${filePath} — ${count} finding${count === 1 ? '' : 's'}${health}`;
  });

  const securityIssues = issues.filter((issue) => issue.issue_type === 'security');

  budget.addSection('Security overview', [
    severityCountLine(findings),
    categoryCountLine(findings),
    `Affected files: ${affectedCounts.size}`,
  ]);
  budget.addSection(
    'Security findings',
    findingBlocks.length > 0 ? findingBlocks : ['No security findings detected for this project.'],
  );
  budget.addSection(
    'Security issues',
    securityIssues.length > 0 ? securityIssues.slice(0, 20).map(issueLine) : ['No security-classified issues detected.'],
  );
  budget.addSection(
    'Affected files',
    affectedLines.length > 0 ? affectedLines : ['No files are affected by security findings.'],
  );
  budget.addSection('Project overview', projectOverviewLines(project));

  return finalizeContext('security', { projectId: Number(project.id), projectName: project.name }, budget);
}

module.exports = {
  buildProjectContext,
  buildFileContext,
  buildIssueContext,
  buildArchitectureContext,
  buildDependencyContext,
  buildImpactContext,
  buildSecurityContext,
};
