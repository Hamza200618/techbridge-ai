'use strict';

const config = require('../../config/env');
const projectService = require('../../services/projectService');
const issueRepository = require('../../repositories/issueRepository');
const conversationRepository = require('../../repositories/conversationRepository');
const aiProvider = require('../provider'); // public surface only (TEAM_RULES §12)
const contextBuilder = require('../context'); // public surface only
const { buildIssueDiagnosisSystemPrompt } = require('../prompts/issueDiagnosisPrompt');
const { deriveConversationTitle } = require('../conversationTitle');
const { extractJsonObject } = require('../jsonResponse');
const ApiError = require('../../utils/apiError');
const { logger } = require('../../utils/logger');

// AI-powered issue diagnosis (docs/API_CONTRACT.md section 16.1,
// docs/PROJECT_SPEC.md section 4.5, docs/ARCHITECTURE.md section 18):
//
//   ownership → issue (project-scoped) → focused issue context →
//   provider manager (Groq → Gemini → OpenAI fallback) → structured
//   diagnosis → persisted to existing tables → response.
//
// The diagnosis strictly separates observed evidence (quoted from the
// analyzer's stored facts) from AI inference, never modifies project files
// and never applies fixes. The analyzer owns analysis_issues (ARCHITECTURE
// section 25: keep analyzer logic separate from AI logic), so the AI output
// is persisted as a `diagnosis`-scoped conversation in the existing
// ai_conversations / ai_messages tables — no new tables, no schema changes.
// file_id stays NULL on those conversations: a re-analysis replaces
// project_files rows and its ON DELETE CASCADE would wipe a bound
// conversation, while a NULL-bound diagnosis survives as the audit record.

function malformedDiagnosisResponse() {
  return new ApiError(502, 'AI_PROVIDER_FAILED', 'The AI provider returned an unusable diagnosis. Please try again.');
}

function requireTextField(value) {
  if (typeof value !== 'string') throw malformedDiagnosisResponse();
  const text = value.trim();
  if (text.length === 0) throw malformedDiagnosisResponse();
  return text;
}

function normalizeEvidence(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    return text.length > 0 ? [text] : [];
  }
  if (!Array.isArray(value)) throw malformedDiagnosisResponse();
  return value
    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function normalizeConfidence(value) {
  const numeric = typeof value === 'number'
    ? value
    : (typeof value === 'string' && value.trim().length > 0 ? Number(value) : NaN);
  if (!Number.isFinite(numeric)) throw malformedDiagnosisResponse();
  // Clamp onto the documented 0..1 scale (a model answering "91" means 91%).
  return Math.min(1, Math.max(0, numeric));
}

// Extracts and validates the structured diagnosis from the provider's
// content (problem / evidence / rootCause / suggestedSolution / confidence —
// docs/API_CONTRACT.md section 16.1).
function parseDiagnosis(rawContent) {
  const parsed = extractJsonObject(rawContent);
  if (!parsed) throw malformedDiagnosisResponse();

  return {
    problem: requireTextField(parsed.problem),
    evidence: normalizeEvidence(parsed.evidence),
    rootCause: requireTextField(parsed.rootCause),
    suggestedSolution: requireTextField(parsed.suggestedSolution),
    confidence: normalizeConfidence(parsed.confidence),
  };
}

// One diagnosis generation, reusable by the diagnosis endpoint and by the
// Fix It flow (docs/ARCHITECTURE.md section 18: Issue → Diagnosis → Context
// Builder → AI Provider Manager). Ownership and issue lookup stay with the
// callers; this produces the structured diagnosis and persists it as a
// `diagnosis`-scoped conversation, returning it with the conversation id so
// a generated fix can link back to it (code_changes.conversation_id).
async function generateDiagnosis(userId, project, issue) {
  // Focused issue context (TEAM_RULES section 17 "For issue diagnosis"):
  // issue, evidence, affected file, related files, dependencies and the
  // relationships around the affected file — rebuilt from the latest
  // analysis, never the whole project.
  const context = await contextBuilder.buildIssueContext(project.id, issue.id);

  const userMessage = `Diagnose issue #${issue.id}: ${issue.title}`;
  const providerMessages = [
    { role: 'system', content: buildIssueDiagnosisSystemPrompt(project, issue, context) },
    { role: 'user', content: userMessage },
  ];

  // 4. Provider manager applies the Groq → Gemini → OpenAI fallback chain.
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
      throw new ApiError(400, 'VALIDATION_ERROR', 'The diagnosis request could not be processed.');
    }
    throw error;
  }

  // 5. Structured diagnosis. Unusable provider output is a controlled
  // upstream failure — nothing is persisted for a failed generation.
  const diagnosis = parseDiagnosis(response.content);

  // 6. Persist the completed diagnosis exchange in the existing
  // conversation tables (conversation scope: diagnosis). The structured
  // result lives in the assistant message metadata so it can be retrieved
  // without re-generation; provenance (provider/model/usage) is recorded
  // alongside it — never API keys, which exist only in the provider layer.
  const conversationId = await conversationRepository.createConversation({
    userId,
    projectId: project.id,
    conversationType: 'diagnosis',
    title: deriveConversationTitle(`Diagnosis: ${issue.title}`),
  });
  await conversationRepository.createMessage({
    conversationId,
    role: 'user',
    content: userMessage,
  });
  await conversationRepository.createMessage({
    conversationId,
    role: 'assistant',
    content: response.content,
    metadata: {
      provider: response.provider,
      model: response.model,
      finishReason: response.finishReason || null,
      usage: response.usage || null,
      issueId: Number(issue.id),
      issueType: issue.issue_type,
      severity: issue.severity,
      filePath: issue.file_path || null,
      context: {
        estimatedTokens: context.estimatedTokens,
        truncated: context.truncated,
      },
      diagnosis,
    },
  });

  logger.info('Issue diagnosis completed', {
    projectId: project.id,
    issueId: issue.id,
    conversationId,
    provider: response.provider,
    contextChars: context.totalChars,
  });

  return { diagnosis, conversationId };
}

// POST /api/projects/:projectId/issues/:issueId/diagnose entry point
// (docs/API_CONTRACT.md section 16.1).
async function diagnoseIssue(userId, projectId, issueId) {
  // 1-2. Ownership: missing and foreign projects both answer 404.
  const project = await projectService.getOwnedProject(userId, projectId);

  // The issue must belong to the owned project — an issue id from another
  // project is simply not found.
  const issue = await issueRepository.findById(project.id, issueId);
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Issue was not found.');
  }

  const { diagnosis } = await generateDiagnosis(userId, project, issue);

  // Response shape per docs/API_CONTRACT.md section 16.1.
  return { diagnosis };
}

module.exports = { diagnoseIssue, generateDiagnosis };
