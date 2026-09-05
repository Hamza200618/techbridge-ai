'use strict';

const projectService = require('../services/projectService');
const projectFileService = require('../services/projectFileService');
const apiResponse = require('../utils/apiResponse');

// POST /api/projects/upload
// multipart/form-data, field "file". req.user comes from the authenticate
// middleware; req.file from the upload middleware (docs/API_CONTRACT.md
// section 8.1).
async function uploadProject(req, res, next) {
  try {
    const project = await projectService.uploadProject(req.user.id, req.file);
    return apiResponse.success(res, { project }, 201);
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects (docs/API_CONTRACT.md section 9.1)
async function listProjects(req, res, next) {
  try {
    const projects = await projectService.listProjects(req.user.id);
    return apiResponse.success(res, { projects });
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId (docs/API_CONTRACT.md section 9.2)
async function getProject(req, res, next) {
  try {
    const project = await projectService.getProject(req.user.id, req.params.projectId);
    return apiResponse.success(res, { project });
  } catch (error) {
    return next(error);
  }
}

// DELETE /api/projects/:projectId (docs/API_CONTRACT.md section 9.3)
async function deleteProject(req, res, next) {
  try {
    await projectService.deleteProject(req.user.id, req.params.projectId);
    return apiResponse.success(res, { message: 'Project deleted successfully.' });
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/files (docs/API_CONTRACT.md section 10.1)
async function listProjectFiles(req, res, next) {
  try {
    const files = await projectFileService.listFiles(req.user.id, req.params.projectId);
    return apiResponse.success(res, { files });
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/tree (docs/API_CONTRACT.md section 10.2)
async function getProjectTree(req, res, next) {
  try {
    const tree = await projectFileService.getProjectTree(req.user.id, req.params.projectId);
    return apiResponse.success(res, { tree });
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/files/:fileId (docs/API_CONTRACT.md section 10.3)
async function getFile(req, res, next) {
  try {
    const file = await projectFileService.getFile(req.user.id, req.params.projectId, req.params.fileId);
    return apiResponse.success(res, { file });
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/files/:fileId/content (docs/API_CONTRACT.md section 10.4)
async function getFileContent(req, res, next) {
  try {
    const content = await projectFileService.getFileContent(
      req.user.id,
      req.params.projectId,
      req.params.fileId,
    );
    return apiResponse.success(res, content);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadProject,
  listProjects,
  getProject,
  deleteProject,
  listProjectFiles,
  getProjectTree,
  getFile,
  getFileContent,
};
