'use strict';

// Groq provider (docs/PROJECT_SPEC.md section 4, docs/TEAM_RULES.md section
// 12). All Groq-specific knowledge lives in this file — endpoint, model
// default, and the configured API key. The wire format itself is the OpenAI
// chat-completions protocol shared through aiProvider.js, so Groq and OpenAI
// never drift apart. First provider in the default fallback chain.

const config = require('../../config/env');
const { createChatCompletionsProvider } = require('./aiProvider');

const provider = createChatCompletionsProvider({
  name: 'groq',
  url: 'https://api.groq.com/openai/v1/chat/completions',
  apiKey: config.ai.providers.groq.apiKey,
  model: config.ai.providers.groq.model,
});

module.exports = provider;
