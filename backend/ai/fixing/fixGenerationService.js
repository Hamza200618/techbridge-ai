'use strict';

const fs = require('fs/promises');
const path = require('path');

const config = require('../../config/env');
const projectService = require('../../services/projectService');
const projectFileService = require('../../services/projectFileService');
const issueRepository = require('../../repositories/issueRepository');
const codeChangeRepository = require('../../repositories/codeChangeRepository');
const projectStorage = require('../../storage/projectStorage');
const aiProvider = require('../provider'); // public surface only (TEAM_RULES §12)
const contextBuilder = require('../context'); // public surface only
const { generateDiagnosis } = require('../diagnosis/aiDiagnosisService');
const { buildFixProposalSystemPrompt } = require('../prompts/fixProposalPrompt');
const { generateUnifiedDiff } = require('./diffGenerator');
const { extractJsonObject } = require('../jsonResponse');
const { toPublicChange } = require('../../models/codeChangeModel');
const ApiError = require('../../utils/apiError');
const { logger } = require('../../utils/logger');

// Fix It — proposed fix generation (docs/API_CONTRACT.md section 17.1,
// docs/PROJECT_SPEC.md section 4.6, docs/ARCHITECTURE.md section 18):
//
//   Issue → Diagnosis → Relevant Context → AI Provider Manager →
//   Proposed Fix → Proposed Code → Diff → code_changes (status: proposed)
//
// Safety rules (docs/TEAM_RULES.md sections 18-19): nothing in this flow
// writes to the working copy — the file is only ever READ here — and the
// original upload is never touched at all. Applying or rejecting is a
// separate, explicit user action on the stored change.
//
// The AI proposes search/replace edits instead of full file content, and the
// server applies them to the real current content. This keeps the proposal
// honest: parts of the file the AI never saw are preserved byte-for-byte,
// and the proposed content and diff always describe a real, deterministic
// transformation of the actual file.

const MAX_EDITS = 20;
const MAX_DESCRIPTION_CHARS = 4000;

function unusableFixProposal() {
  return new ApiError(502, 'AI_PROVIDER_FAILED', 'The AI provider returned an unusable fix proposal. Please try again.');
}

// Reads the current content of the affected file from the working copy.
// Same containment discipline as the file-content API (docs/API_CONTRACT.md
// section 33): the stored path is only trusted after re-resolving it inside
// the working directory. Read-only — this is the only filesystem access of
// the whole flow.
async function readWorkingFileContent(project, file) {
  if (Number(file.is_binary)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Binary files cannot be fixed.');
  }
  if (Number(file.size_bytes) > config.files.maxContentBytes) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `File is too large to fix (limit: ${config.files.maxContentMb} MB).`,
    );
  }
  if (!project.working_path) {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }

  const workingDir = projectStorage.fromStoredPath(project.working_path);
  const filePath = path.resolve(workingDir, String(file.path));
  if (filePath !== workingDir && !filePath.startsWith(workingDir + path.sep)) {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }

  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    throw new ApiError(404, 'FILE_NOT_FOUND', 'File was not found.');
  }
}

// Validates the provider's fix proposal: a non-empty proposedSolution plus
// 1..MAX_EDITS edits of { search (non-empty string), replace (string) }.
// Unknown extra fields are ignored.
function parseFixProposal(rawContent) {
  const parsed = extractJsonObject(rawContent);
  if (!parsed) throw unusableFixProposal();

  const proposedSolution = typeof parsed.proposedSolution === 'string' ? parsed.proposedSolution.trim() : '';
  if (proposedSolution.length === 0) throw unusableFixProposal();

  if (!Array.isArray(parsed.edits) || parsed.edits.length === 0 || parsed.edits.length > MAX_EDITS) {
    throw unusableFixProposal();
  }
  const edits = [];
  for (const edit of parsed.edits) {
    if (edit === null || typeof edit !== 'object' || Array.isArray(edit)) throw unusableFixProposal();
    if (typeof edit.search !== 'string' || edit.search.length === 0) throw unusableFixProposal();
    if (typeof edit.replace !== 'string') throw unusableFixProposal();
    edits.push({ search: edit.search, replace: edit.replace });
  }

  return { proposedSolution: proposedSolution.slice(0, MAX_DESCRIPTION_CHARS), edits };
}

// Applies the AI's search/replace edits to the real current content, in
// order: each edit replaces the FIRST occurrence of its search text in the
// current content, so later edits can build on earlier ones. Every edit must
// match — a partially applied multi-edit patch could corrupt the file, so a
// single miss rejects the whole proposal (returns null).
function applyEdits(originalContent, edits) {
  let content = originalContent;
  for (const edit of edits) {
    const index = content.indexOf(edit.search);
    if (index === -1) return null;
    content = content.slice(0, index) + edit.replace + content.slice(index + edit.search.length);
  }
  return content;
}

async function generateFix(userId, projectId, issueId) {
  // 1-2. Ownership: missing and foreign projects both answer 404.
  const project = await projectService.getOwnedProject(userId, projectId);

  // The issue must belong to the owned project.
  const issue = await issueRepository.findById(project.id, issueId);
  if (!issue) {
    throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Issue was not found.');
  }
  // code_changes is bound to a file; issues without an affected file cannot
  // produce a code fix.
  if (!issue.file_id) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The issue is not attached to a specific file, so no code fix can be proposed.');
  }
  const file = await projectFileService.requireProjectFile(project.id, issue.file_id);

  // Read the real current content up front — binary/oversized/missing files
  // fail fast, before any provider is contacted.
  const originalContent = await readWorkingFileContent(project, file);

  // 3. Diagnosis (Issue → Diagnosis): a fresh structured diagnosis drives
  // the fix and is persisted as its own `diagnosis` conversation, which the
  // stored change links back to.
  const { diagnosis, conversationId } = await generateDiagnosis(userId, project, issue);

  // 4. Relevant context (Context Builder): focused on the affected file —
  // its source, issues, relationships and dependencies.
  const context = await contextBuilder.buildFileContext(project.id, file.id);

  // 5. AI proposed fix through the provider manager (Groq → Gemini →
  // OpenAI fallback).
  const providerMessages = [
    { role: 'system', content: buildFixProposalSystemPrompt(project, issue, file, diagnosis, context) },
    { role: 'user', content: `Propose a fix for issue #${issue.id}: ${issue.title}` },
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
      throw new ApiError(400, 'VALIDATION_ERROR', 'The fix request could not be processed.');
    }
    throw error;
  }

  // 6. Proposed code: parse the edits and apply them server-side to the
  // real content. Unusable output or a non-matching edit rejects the whole
  // proposal — nothing is stored for a failed generation.
  const proposal = parseFixProposal(response.content);
  const newContent = applyEdits(originalContent, proposal.edits);
  if (newContent === null || newContent === originalContent) {
    throw unusableFixProposal();
  }

  // 7. Readable diff, always computed from the real before/after content.
  const diff = generateUnifiedDiff(originalContent, newContent, file.path);

  // 8. Store the proposed change (status: proposed). The working project is
  // NOT modified — the user explicitly applies or rejects later.
  const changeId = await codeChangeRepository.createChange({
    projectId: project.id,
    fileId: file.id,
    conversationId,
    issueId: issue.id,
    changeType: 'ai_fix',
    description: proposal.proposedSolution,
    oldContent: originalContent,
    newContent,
    diffContent: diff,
    status: 'proposed',
    createdBy: userId,
  });

  logger.info('Fix proposal generated', {
    projectId: project.id,
    issueId: issue.id,
    fileId: file.id,
    changeId,
    conversationId,
    provider: response.provider,
    edits: proposal.edits.length,
  });

  // 9. Response shape per docs/API_CONTRACT.md section 17.1.
  const row = await codeChangeRepository.findById(changeId);
  return { change: toPublicChange(row) };
}

module.exports = { generateFix };
