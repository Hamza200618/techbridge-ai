'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const validateRequest = require('../middleware/validateRequest');
const { uploadSingle } = require('../middleware/upload');
const projectController = require('../controllers/projectController');
const analysisController = require('../controllers/analysisController');
const aiChatController = require('../controllers/aiChatController');
const aiDiagnosisController = require('../controllers/aiDiagnosisController');
const aiFixController = require('../controllers/aiFixController');
const changeController = require('../controllers/changeController');
const impactController = require('../controllers/impactController');
const rootCauseController = require('../controllers/rootCauseController');
const securityController = require('../controllers/securityController');
const validationController = require('../controllers/validationController');
const exportController = require('../controllers/exportController');
const {
  projectIdParams,
  projectFileParams,
  projectIssueParams,
  projectChangeParams,
  projectFindingParams,
  projectValidationRunParams,
  projectExportParams,
} = require('../validators/projectSchemas');
const { aiChatBody } = require('../validators/aiChatSchemas');

const router = express.Router();

// POST /api/projects/upload (docs/API_CONTRACT.md section 8.1)
// multipart/form-data, field "file". Authentication runs before multer so
// unauthenticated requests are rejected before any file is buffered.
router.post('/upload', authenticate, uploadSingle('file'), projectController.uploadProject);

// Project management (docs/API_CONTRACT.md section 9).
router.get('/', authenticate, projectController.listProjects);
router.get(
  '/:projectId',
  authenticate,
  validateRequest({ params: projectIdParams }),
  projectController.getProject,
);
router.delete(
  '/:projectId',
  authenticate,
  validateRequest({ params: projectIdParams }),
  projectController.deleteProject,
);

// Project files (docs/API_CONTRACT.md section 10).
router.get(
  '/:projectId/files',
  authenticate,
  validateRequest({ params: projectIdParams }),
  projectController.listProjectFiles,
);
router.get(
  '/:projectId/tree',
  authenticate,
  validateRequest({ params: projectIdParams }),
  projectController.getProjectTree,
);
router.get(
  '/:projectId/files/:fileId',
  authenticate,
  validateRequest({ params: projectFileParams }),
  projectController.getFile,
);
router.get(
  '/:projectId/files/:fileId/content',
  authenticate,
  validateRequest({ params: projectFileParams }),
  projectController.getFileContent,
);

// Analysis (docs/API_CONTRACT.md sections 11-13).
router.post(
  '/:projectId/analyze',
  authenticate,
  validateRequest({ params: projectIdParams }),
  analysisController.startAnalysis,
);
router.get(
  '/:projectId/analysis',
  authenticate,
  validateRequest({ params: projectIdParams }),
  analysisController.getAnalysisStatus,
);
router.get(
  '/:projectId/issues',
  authenticate,
  validateRequest({ params: projectIdParams }),
  analysisController.getIssues,
);
router.get(
  '/:projectId/security',
  authenticate,
  validateRequest({ params: projectIdParams }),
  securityController.getSecurityFindings,
);
router.get(
  '/:projectId/security/:findingId',
  authenticate,
  validateRequest({ params: projectFindingParams }),
  securityController.getSecurityFindingById,
);

// Project AI chat (docs/API_CONTRACT.md section 14.1).
router.post(
  '/:projectId/ai/chat',
  authenticate,
  validateRequest({ params: projectIdParams, body: aiChatBody }),
  aiChatController.projectChat,
);

// File AI chat (docs/API_CONTRACT.md section 15.1).
router.post(
  '/:projectId/files/:fileId/ai/chat',
  authenticate,
  validateRequest({ params: projectFileParams, body: aiChatBody }),
  aiChatController.fileChat,
);

// Issue AI diagnosis (docs/API_CONTRACT.md section 16.1).
router.post(
  '/:projectId/issues/:issueId/diagnose',
  authenticate,
  validateRequest({ params: projectIssueParams }),
  aiDiagnosisController.diagnoseIssue,
);

// Fix It: generate a proposed fix (docs/API_CONTRACT.md section 17.1).
router.post(
  '/:projectId/issues/:issueId/fix',
  authenticate,
  validateRequest({ params: projectIssueParams }),
  aiFixController.generateFix,
);

// Apply a proposed change to the working project (docs/API_CONTRACT.md
// section 18.1). The only endpoint that writes approved content into the
// working copy; the original upload stays immutable.
router.post(
  '/:projectId/changes/:changeId/apply',
  authenticate,
  validateRequest({ params: projectChangeParams }),
  changeController.applyChange,
);

// Reject a proposed change (docs/API_CONTRACT.md section 19.1) — never
// modifies project files.
router.post(
  '/:projectId/changes/:changeId/reject',
  authenticate,
  validateRequest({ params: projectChangeParams }),
  changeController.rejectChange,
);

// Project version history (docs/API_CONTRACT.md section 21.1).
router.get(
  '/:projectId/versions',
  authenticate,
  validateRequest({ params: projectIdParams }),
  changeController.getProjectVersions,
);

// File version history (docs/API_CONTRACT.md section 21.2).
router.get(
  '/:projectId/files/:fileId/versions',
  authenticate,
  validateRequest({ params: projectFileParams }),
  changeController.getFileVersions,
);

// Impact Analysis (docs/API_CONTRACT.md section 22.1).
router.get(
  '/:projectId/files/:fileId/impact',
  authenticate,
  validateRequest({ params: projectFileParams }),
  impactController.getFileImpact,
);

// Root Cause Analysis (docs/API_CONTRACT.md section 23.1).
router.get(
  '/:projectId/issues/:issueId/root-cause',
  authenticate,
  validateRequest({ params: projectIssueParams }),
  rootCauseController.getIssueRootCause,
);

// Validation (docs/API_CONTRACT.md section 24).
router.post(
  '/:projectId/validate',
  authenticate,
  validateRequest({ params: projectIdParams }),
  validationController.validateProject,
);
router.get(
  '/:projectId/validation',
  authenticate,
  validateRequest({ params: projectIdParams }),
  validationController.getValidationResults,
);
router.get(
  '/:projectId/validation/:runId',
  authenticate,
  validateRequest({ params: projectValidationRunParams }),
  validationController.getValidationRunById,
);

// Export working copy (docs/API_CONTRACT.md section 25). Controller already
// existed; routes were not mounted. Frontend download uses Bearer auth.
router.post(
  '/:projectId/export',
  authenticate,
  validateRequest({ params: projectIdParams }),
  exportController.exportProject,
);
router.get(
  '/:projectId/exports',
  authenticate,
  validateRequest({ params: projectIdParams }),
  exportController.getProjectExports,
);
router.get(
  '/:projectId/exports/:exportId/download',
  authenticate,
  validateRequest({ params: projectExportParams }),
  exportController.downloadExport,
);

module.exports = router;
