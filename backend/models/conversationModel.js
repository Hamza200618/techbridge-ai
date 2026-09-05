'use strict';

// Maps ai_conversations / ai_messages rows to public API shapes
// (docs/API_CONTRACT.md sections 14-15). DB snake_case → API camelCase.
// Internal columns (user_id, file_id) stay internal — responses only carry
// the conversation scope the endpoint is about.

function toPublicConversation(row) {
  if (!row) return null;
  return {
    conversationId: Number(row.id),
    projectId: Number(row.project_id),
    conversationType: row.conversation_type,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublicMessage(row, { includeMetadata = false } = {}) {
  if (!row) return null;
  const message = {
    messageId: Number(row.id),
    conversationId: Number(row.conversation_id),
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
  if (includeMetadata) {
    message.metadata = row.metadata === null || row.metadata === undefined
      ? null
      : JSON.parse(row.metadata);
  }
  return message;
}

module.exports = { toPublicConversation, toPublicMessage };
