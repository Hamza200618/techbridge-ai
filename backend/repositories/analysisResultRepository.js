'use strict';

const { pool } = require('../config/database');
const projectRepository = require('./projectRepository');

// Persists a complete analyzer result into the existing analysis tables:
// project_files, project_dependencies, code_relationships, api_endpoints,
// database_entities, analysis_issues and security_findings, plus the
// aggregated project columns (docs/PROJECT_SPEC.md section 3.5: the project
// health score is stored in projects.health_score).
//
// A persist run replaces all previous analysis data for the project inside
// one transaction, so readers always see a consistent snapshot (either the
// previous analysis or the new one).

const BATCH_SIZE = 500;

async function insertBatches(connection, table, columns, rows) {
  if (rows.length === 0) return;
  const placeholders = `(${columns.map(() => '?').join(', ')})`;
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const chunk = rows.slice(offset, offset + BATCH_SIZE);
    const values = [];
    const valueSql = chunk
      .map((row) => {
        columns.forEach((column) => values.push(row[column]));
        return placeholders;
      })
      .join(', ');
    await connection.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valueSql}`, values);
  }
}

async function replaceAnalysisData(projectId, analysisResult, { workingPath } = {}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Clear previous analysis data (children that reference project_files
    // go first; FKs cascade on project deletion but not on row replacement).
    await connection.query('DELETE FROM code_relationships WHERE project_id = ?', [projectId]);
    await connection.query('DELETE FROM api_endpoints WHERE project_id = ?', [projectId]);
    await connection.query('DELETE FROM database_entities WHERE project_id = ?', [projectId]);
    await connection.query('DELETE FROM security_findings WHERE project_id = ?', [projectId]);
    await connection.query('DELETE FROM analysis_issues WHERE project_id = ?', [projectId]);
    await connection.query('DELETE FROM project_dependencies WHERE project_id = ?', [projectId]);
    await connection.query('DELETE FROM project_files WHERE project_id = ?', [projectId]);

    // Insert the discovered files and directories. parent_file_id is linked
    // afterwards: the parent path is the file path minus its last segment.
    const healthByPath = new Map(
      analysisResult.fileHealth.map((entry) => [entry.path, entry]),
    );
    const fileRows = analysisResult.files.map((file) => {
      const health = healthByPath.get(file.path) || {
        healthScore: 0,
        healthStatus: 'unknown',
        analysisStatus: 'skipped',
      };
      return {
        project_id: projectId,
        path: file.path,
        name: file.name,
        extension: file.extension,
        file_type: file.fileType,
        language: file.language,
        size_bytes: file.sizeBytes,
        line_count: file.lineCount,
        content_hash: file.contentHash,
        storage_path: workingPath ? `${workingPath}/${file.path}` : null,
        is_generated: file.isGenerated ? 1 : 0,
        is_ignored: file.isIgnored ? 1 : 0,
        is_binary: file.isBinary ? 1 : 0,
        health_status: health.healthStatus,
        health_score: health.healthScore,
        analysis_status: health.analysisStatus,
      };
    });
    await insertBatches(
      connection,
      'project_files',
      [
        'project_id', 'path', 'name', 'extension', 'file_type', 'language',
        'size_bytes', 'line_count', 'content_hash', 'storage_path',
        'is_generated', 'is_ignored', 'is_binary', 'health_status',
        'health_score', 'analysis_status',
      ],
      fileRows,
    );

    await connection.query(
      `UPDATE project_files pf
        JOIN project_files par
          ON par.project_id = pf.project_id
         AND par.path = SUBSTRING_INDEX(pf.path, '/', LENGTH(pf.path) - LENGTH(REPLACE(pf.path, '/', '')))
         AND pf.path LIKE CONCAT(par.path, '/%')
         SET pf.parent_file_id = par.id
       WHERE pf.project_id = ? AND pf.parent_file_id IS NULL`,
      [projectId],
    );

    // Authoritative path → id map for the FK columns below.
    const [fileIdRows] = await connection.query(
      'SELECT id, path FROM project_files WHERE project_id = ?',
      [projectId],
    );
    const fileIdByPath = new Map(fileIdRows.map((row) => [row.path, Number(row.id)]));

    const dependencyRows = analysisResult.dependencies
      .filter((dependency) => fileIdByPath.has(dependency.sourcePath))
      .map((dependency) => ({
        project_id: projectId,
        name: dependency.name,
        version: dependency.version,
        dependency_type: dependency.dependencyType,
        package_manager: dependency.packageManager,
        source_file_id: fileIdByPath.get(dependency.sourcePath),
        security_status: 'unknown',
      }));
    await insertBatches(
      connection,
      'project_dependencies',
      [
        'project_id', 'name', 'version', 'dependency_type', 'package_manager',
        'source_file_id', 'security_status',
      ],
      dependencyRows,
    );

    const relationshipRows = analysisResult.relationships
      .filter((relationship) => fileIdByPath.has(relationship.sourcePath)
        && fileIdByPath.has(relationship.targetPath))
      .map((relationship) => ({
        project_id: projectId,
        source_file_id: fileIdByPath.get(relationship.sourcePath),
        target_file_id: fileIdByPath.get(relationship.targetPath),
        relationship_type: relationship.relationshipType,
        symbol_name: relationship.symbolName,
      }));
    await insertBatches(
      connection,
      'code_relationships',
      ['project_id', 'source_file_id', 'target_file_id', 'relationship_type', 'symbol_name'],
      relationshipRows,
    );

    const apiRows = analysisResult.apiEndpoints
      .filter((endpoint) => fileIdByPath.has(endpoint.filePath))
      .map((endpoint) => ({
        project_id: projectId,
        file_id: fileIdByPath.get(endpoint.filePath),
        method: endpoint.method,
        route: endpoint.route,
        controller_name: endpoint.controllerName,
        framework: endpoint.framework,
        authentication_required: endpoint.authenticationRequired,
      }));
    await insertBatches(
      connection,
      'api_endpoints',
      ['project_id', 'file_id', 'method', 'route', 'controller_name', 'framework', 'authentication_required'],
      apiRows,
    );

    const databaseRows = analysisResult.databaseEntities
      .filter((entity) => fileIdByPath.has(entity.filePath))
      .map((entity) => ({
        project_id: projectId,
        file_id: fileIdByPath.get(entity.filePath),
        entity_type: entity.entityType,
        name: entity.name,
        database_name: entity.databaseName,
      }));
    await insertBatches(
      connection,
      'database_entities',
      ['project_id', 'file_id', 'entity_type', 'name', 'database_name'],
      databaseRows,
    );

    const issueRows = analysisResult.issues
      .filter((issue) => fileIdByPath.has(issue.filePath))
      .map((issue) => ({
        project_id: projectId,
        file_id: fileIdByPath.get(issue.filePath),
        issue_type: issue.issueType,
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        suggested_fix: issue.suggestedFix,
        evidence: issue.evidence,
        detection_source: issue.detectionSource,
        confidence: issue.confidence,
        status: 'open',
      }));
    await insertBatches(
      connection,
      'analysis_issues',
      [
        'project_id', 'file_id', 'issue_type', 'severity', 'title',
        'description', 'suggested_fix', 'evidence', 'detection_source',
        'confidence', 'status',
      ],
      issueRows,
    );

    const findingRows = analysisResult.securityFindings
      .filter((finding) => fileIdByPath.has(finding.filePath))
      .map((finding) => ({
        project_id: projectId,
        file_id: fileIdByPath.get(finding.filePath),
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        evidence: finding.evidence,
        recommendation: finding.recommendation,
        status: 'open',
      }));
    await insertBatches(
      connection,
      'security_findings',
      [
        'project_id', 'file_id', 'category', 'severity', 'title',
        'description', 'evidence', 'recommendation', 'status',
      ],
      findingRows,
    );

    const summary = analysisResult.summary;
    await projectRepository.updateProject(
      projectId,
      {
        status: 'ready',
        analysis_progress: 100,
        health_score: analysisResult.projectHealth.score,
        total_files: summary.totalFiles,
        total_lines: summary.totalLines,
        total_size_bytes: summary.totalSizeBytes,
        primary_language: summary.primaryLanguage,
        framework: summary.framework,
        project_type: summary.projectType,
      },
      connection,
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { replaceAnalysisData };
