'use strict';

// Shared conversation-title derivation for the AI services (chat scopes and
// one-shot diagnosis both persist into ai_conversations). Titles are plain
// single-line strings capped well below the ai_conversations.title column
// limit (varchar(500)), so any message- or issue-derived title fits.

const MAX_TITLE_CHARS = 120;

function deriveConversationTitle(message) {
  const singleLine = String(message).replace(/\s+/g, ' ').trim();
  return singleLine.slice(0, MAX_TITLE_CHARS);
}

module.exports = { deriveConversationTitle };
