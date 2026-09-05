'use strict';

const config = require('../config/env');

// Shared body schema for the AI chat endpoints (docs/API_CONTRACT.md
// sections 14-15): project and file chat accept the same message plus an
// optional continuation conversation. The message cap comes from
// configuration so chat traffic stays bounded without code changes.

const aiChatBody = {
  message: {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: config.ai.chat.maxMessageChars,
    // Whitespace-only messages are rejected before anything is persisted.
    custom: (value) => value.trim().length > 0 || 'message must not be blank.',
  },
  // Optional: continue an existing conversation; omitted on the first turn.
  conversationId: { type: 'id', required: false },
};

module.exports = { aiChatBody };
