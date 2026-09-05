'use strict';

const config = require('../../config/env');
const projectService = require('../../services/projectService');
const projectFileService = require('../../services/projectFileService');
const conversationRepository = require('../../repositories/conversationRepository');
const aiProvider = require('../provider'); // public surface only (TEAM_RULES §12)
const contextBuilder = require('../context'); // public surface only
const { buildProjectChatSystemPrompt } = require('../prompts/projectChatPrompt');
const { buildFileChatSystemPrompt } = require('../prompts/fileChatPrompt');
const { deriveConversationTitle } = require('../conversationTitle');
const ApiError = require('../../utils/apiError');
const { logger } = require('../../utils/logger');

// AI chat (docs/API_CONTRACT.md sections 14-15, docs/ARCHITECTURE.md
// section 16):
//
//   ownership → conversation (create or reuse) → save user message →
//   build focused context → provider manager (Groq → Gemini → OpenAI
//   fallback) → save assistant message → respond.
//
// The provider manager is the only component that talks to AI providers; it
// is called through its public module so its fallback chain stays the single
// source of provider selection. The context builder is provider-independent
// and bounded — the uploaded project is never sent as a whole. Chat never
// writes to project files: the working copy is only ever read (by the
// context builder), and nothing in this flow produces file modifications.

// A conversation is reusable only when it belongs to this user, this project
// and exactly the expected scope (type + file binding). Foreign, missing or
// mismatched conversations all answer 404 so existence is never leaked.
function matchesConversationScope(conversation, userId, projectId, scope) {
  return Boolean(conversation)
    && Number(conversation.user_id) === Number(userId)
    && Number(conversation.project_id) === Number(projectId)
    && conversation.conversation_type === scope.conversationType
    && Number(conversation.file_id || 0) === Number(scope.fileId || 0);
}

async function loadConversation(userId, projectId, conversationId, scope) {
  const conversation = await conversationRepository.findById(conversationId);
  if (!matchesConversationScope(conversation, userId, projectId, scope)) {
    throw new ApiError(404, 'CONVERSATION_NOT_FOUND', 'Conversation was not found.');
  }
  return conversation;
}

// One conversation turn shared by every chat scope. The user message is
// persisted before the provider is contacted (real user input survives
// provider outages), capped history replays for multi-turn coherence, the
// provider manager applies the fallback chain, and the assistant reply is
// persisted with provenance metadata (provider/model/usage; never API keys —
// none exist outside the provider layer).
async function runConversationTurn(conversation, message, systemPrompt, context, logLabel, logMeta) {
  const userMessageId = await conversationRepository.createMessage({
    conversationId: conversation.id,
    role: 'user',
    content: message,
  });

  // Prior turns (capped; the current message is excluded and re-appended
  // last). Only user/assistant rows replay.
  const history = (await conversationRepository.findRecentMessages(
    conversation.id,
    config.ai.chat.historyMessages + 1,
  ))
    .filter((row) => Number(row.id) !== Number(userMessageId))
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => ({ role: row.role, content: row.content }));

  // System prompt + history + current question.
  const providerMessages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  let response;
  try {
    response = await aiProvider.generateResponse(providerMessages, {
      temperature: config.ai.chat.temperature,
      maxTokens: config.ai.chat.maxTokens,
    });
  } catch (error) {
    if (error instanceof aiProvider.AllProvidersFailedError) {
      // One controlled error for the whole chain (docs/API_CONTRACT.md §30).
      throw new ApiError(503, 'AI_ALL_PROVIDERS_FAILED', 'AI providers are currently unavailable. Please try again later.');
    }
    if (error instanceof aiProvider.InvalidRequestError) {
      // Defensive: caller-side malformed request — no provider was called.
      throw new ApiError(400, 'VALIDATION_ERROR', 'The chat request could not be processed.');
    }
    throw error;
  }

  await conversationRepository.createMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: response.content,
    metadata: {
      provider: response.provider,
      model: response.model,
      finishReason: response.finishReason || null,
      usage: response.usage || null,
      context: {
        estimatedTokens: context.estimatedTokens,
        truncated: context.truncated,
      },
    },
  });

  logger.info(logLabel, {
    ...logMeta,
    conversationId: conversation.id,
    provider: response.provider,
    contextChars: context.totalChars,
    historyMessages: history.length,
  });

  // Response shape per docs/API_CONTRACT.md sections 14.1 and 15.1.
  return {
    conversationId: Number(conversation.id),
    message: {
      role: 'assistant',
      content: response.content,
    },
  };
}

// Project-wide chat (docs/API_CONTRACT.md section 14.1).
async function chatAboutProject(userId, projectId, { conversationId, message }) {
  // 1-2. Ownership: missing and foreign projects both answer 404.
  const project = await projectService.getOwnedProject(userId, projectId);

  // 3. Create or reuse the project conversation (scope: project).
  const conversation = conversationId
    ? await loadConversation(userId, project.id, conversationId, { conversationType: 'project' })
    : {
      id: await conversationRepository.createConversation({
        userId,
        projectId: project.id,
        conversationType: 'project',
        title: deriveConversationTitle(message),
      }),
    };

  // 5. Focused, bounded project context — rebuilt per request so it always
  // reflects the latest analysis.
  const context = await contextBuilder.buildProjectContext(project.id);

  // 4, 6-9. Persist, run the provider chain, persist the reply, respond.
  return runConversationTurn(
    conversation,
    message,
    buildProjectChatSystemPrompt(project, context),
    context,
    'Project chat completed',
    { projectId: project.id },
  );
}

// File-level chat (docs/API_CONTRACT.md section 15.1): the same flow scoped
// to one selected file — the context focuses on that file (source excerpt,
// issues, security findings, relationships, dependencies), never the whole
// project.
async function chatAboutFile(userId, projectId, fileId, { conversationId, message }) {
  // 1-2. Ownership: missing and foreign projects both answer 404.
  const project = await projectService.getOwnedProject(userId, projectId);

  // 3. The selected file must belong to the owned project.
  const file = await projectFileService.requireProjectFile(project.id, fileId);

  // 4. Create or reuse the file conversation (scope: file).
  const conversation = conversationId
    ? await loadConversation(userId, project.id, conversationId, { conversationType: 'file', fileId: file.id })
    : {
      id: await conversationRepository.createConversation({
        userId,
        projectId: project.id,
        conversationType: 'file',
        fileId: file.id,
        title: deriveConversationTitle(message),
      }),
    };

  // 5-7. Focused, bounded file context — rebuilt per request so it always
  // reflects the latest analysis.
  const context = await contextBuilder.buildFileContext(project.id, file.id);

  // 8-11. Persist, run the provider chain, persist the reply, respond.
  return runConversationTurn(
    conversation,
    message,
    buildFileChatSystemPrompt(project, file, context),
    context,
    'File chat completed',
    { projectId: project.id, fileId: file.id },
  );
}

module.exports = { chatAboutProject, chatAboutFile };
