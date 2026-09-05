'use strict';

const { pool } = require('../config/database');

// Data access for the existing `ai_conversations` and `ai_messages` tables
// (docs/API_CONTRACT.md sections 14-15). Rows cascade on user/project/
// conversation deletion (schema constraints), so this module never deletes.
//
// One conversation row is created per (user, project, chat scope); messages
// alternate user/assistant. The system prompt and its project context are
// rebuilt on every request (analysis data can change between requests), so
// no system message is ever persisted.

function encodeMetadata(metadata) {
  if (metadata === undefined || metadata === null) return null;
  return JSON.stringify(metadata);
}

function decodeMetadata(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function createConversation({ userId, projectId, conversationType, title = null, fileId = null }) {
  const [result] = await pool.query(
    `INSERT INTO ai_conversations (user_id, project_id, file_id, conversation_type, title)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, projectId, fileId, conversationType, title],
  );
  return result.insertId;
}

async function findById(conversationId) {
  const [rows] = await pool.query('SELECT * FROM ai_conversations WHERE id = ?', [conversationId]);
  return rows[0] || null;
}

// Conversation rows are touched when messages arrive so updated_at reflects
// the last activity. MySQL ignores no-op updates, so title is only written
// when it actually changes.
async function updateTitle(conversationId, title) {
  await pool.query('UPDATE ai_conversations SET title = ? WHERE id = ? AND (title IS NULL OR title <> ?)', [
    title,
    conversationId,
    title,
  ]);
}

async function createMessage({ conversationId, role, content, metadata = null }) {
  const [result] = await pool.query(
    'INSERT INTO ai_messages (conversation_id, role, content, metadata) VALUES (?, ?, ?, ?)',
    [conversationId, role, content, encodeMetadata(metadata)],
  );
  return result.insertId;
}

// The `limit` most recent messages of a conversation in chronological order.
// Callers cap the number of turns replayed to the provider.
async function findRecentMessages(conversationId, limit) {
  const [rows] = await pool.query(
    'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?',
    [conversationId, Number(limit)],
  );
  return rows.reverse();
}

async function countMessages(conversationId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM ai_messages WHERE conversation_id = ?',
    [conversationId],
  );
  return Number(rows[0].count);
}

module.exports = {
  createConversation,
  findById,
  updateTitle,
  createMessage,
  findRecentMessages,
  countMessages,
  decodeMetadata,
};
