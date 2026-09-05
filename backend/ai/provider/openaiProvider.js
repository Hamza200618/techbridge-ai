'use strict';

// OpenAI provider (docs/PROJECT_SPEC.md section 4, docs/TEAM_RULES.md
// section 12). All OpenAI-specific knowledge lives in this file — endpoint,
// model default, and the configured API key. The wire format is the OpenAI
// chat-completions protocol shared through aiProvider.js. Last provider in
// the default fallback chain.

const config = require('../../config/env');
const { createChatCompletionsProvider } = require('./aiProvider');

const provider = createChatCompletionsProvider({
  name: 'openai',
  url: 'https://api.openai.com/v1/chat/completions',
  apiKey: config.ai.providers.openai.apiKey,
  model: config.ai.providers.openai.model,
});

module.exports = provider;
