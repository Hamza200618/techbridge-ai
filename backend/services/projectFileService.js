'use strict';

const fs = require('fs/promises');
const path = require('path');
const config = require('../config/env');
const projectService = require('./projectService');
const projectFileRepository = require('../repositories/projectFileRepository');
const projectStorage = require('../storage/projectStorage');
const { toPublicFile } = require('../models/projectFileModel');
const ApiError = require('../utils/apiError');

// File APIs for a project's discovered files (docs/API_CONTRACT.md section
// 10). All data comes from the existing project_files table; rows are
// created by the analyzer's discovery phase. Every operation verifies
// project ownership first, then that the file belongs to that project.

// Builds a nested tree from flat project_files rows using parent_file_id.
// Directories sort before files; siblings sort alphabetically. Rows whose
// parent is missing (or self-referencing) surface at the root so no file
// silently disappears.
function buildTree(rows) {
  const nodes = new Map();
  for (const row of rows) {
    nodes.set(Number(row.id), {
      fileId: Number(row.id),
      name: row.name,
      path: row.path,
      fileType: row.file_type,
      extension: row.extension,
      sizeBytes: Number(row.size_bytes) || 0,
      healthStatus: row.health_status,
      healthScore: Number(row.health_score) || 0,
      children: [],
    });
  }

  const roots = [];
  for (const row of rows) {
    const node = nodes.get(Number(row.id));
    const parentId = row.parent_file_id === null ? null : Number(row.parent_file_id);
    const parent = parentId === null ? undefined : nodes.get(parentId);
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortNodes(list) {
    list.sort((a, b) => {
      if (a.fileType !== b.fileType) {
        return a.fileType === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const node of list) {
      sortNodes(node.children);
    }
  }
  sortNodes(roots);

  return roots;
}

// Loads a file row and verifies it belongs to the given project
// (docs/API_CONTRACT.md section 26: requested resource belongs to project).
async function requireProjectFile(projectId, fileId) {
  const row = await projectFileRepository.findById(fileId);
  if (!row || Number(row.project_id) !== Number(projectId)) {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }
  return row;
}

async function listFiles(userId, projectId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const rows = await projectFileRepository.findByProjectId(project.id);
  return rows.map(toPublicFile);
}

async function getProjectTree(userId, projectId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const rows = await projectFileRepository.findByProjectId(project.id);
  return buildTree(rows);
}

async function getFile(userId, projectId, fileId) {
  await projectService.getOwnedProject(userId, projectId);
  const row = await requireProjectFile(projectId, fileId);
  return toPublicFile(row);
}

// Reads file content from the project's working copy. The stored row path is
// only trusted after re-resolving it inside the working directory — content
// is never served from outside it (docs/API_CONTRACT.md sections 10.4, 33).
async function getFileContent(userId, projectId, fileId) {
  const project = await projectService.getOwnedProject(userId, projectId);
  const row = await requireProjectFile(projectId, fileId);

  if (row.is_binary) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Binary file content cannot be displayed.');
  }
  if (Number(row.size_bytes) > config.files.maxContentBytes) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `File is too large to display (limit: ${config.files.maxContentMb} MB).`,
    );
  }
  if (!project.working_path) {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }

  const workingDir = projectStorage.fromStoredPath(project.working_path);
  const filePath = path.resolve(workingDir, String(row.path));
  if (filePath !== workingDir && !filePath.startsWith(workingDir + path.sep)) {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }

  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }

  return { fileId: Number(row.id), path: row.path, content };
}

module.exports = { listFiles, getProjectTree, getFile, getFileContent, requireProjectFile };
