'use strict';

// Public surface of the AI provider layer (docs/TEAM_RULES.md section 12).
// The rest of the backend requires this module — never groqProvider,
// geminiProvider or openaiProvider directly:
//
//   const ai = require('../ai/provider');
//   const response = await ai.generateResponse(messages, options);
//
// Error mapping for future services:
//   InvalidRequestError    → ApiError 400 VALIDATION_ERROR
//   AllProvidersFailedError→ ApiError 503 AI_ALL_PROVIDERS_FAILED
//   (docs/API_CONTRACT.md section 30)

const providerManager = require('./aiProviderManager');
const {
  InvalidRequestError,
  ProviderError,
  AllProvidersFailedError,
} = require('./providerError');

module.exports = {
  generateResponse: providerManager.generateResponse,
  getProviderChain: providerManager.getProviderChain,
  InvalidRequestError,
  ProviderError,
  AllProvidersFailedError,
};
