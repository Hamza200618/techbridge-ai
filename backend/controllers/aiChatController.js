'use strict';

const aiChatService = require('../ai/chat/aiChatService');
const apiResponse = require('../utils/apiResponse');

// POST /api/projects/:projectId/ai/chat (docs/API_CONTRACT.md section 14.1)
async function projectChat(req, res, next) {
  try {
    const result = await aiChatService.chatAboutProject(req.user.id, req.params.projectId, {
      conversationId: req.body.conversationId,
      message: req.body.message,
    });
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

// POST /api/projects/:projectId/files/:fileId/ai/chat (docs/API_CONTRACT.md section 15.1)
async function fileChat(req, res, next) {
  try {
    const result = await aiChatService.chatAboutFile(req.user.id, req.params.projectId, req.params.fileId, {
      conversationId: req.body.conversationId,
      message: req.body.message,
    });
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { projectChat, fileChat };
