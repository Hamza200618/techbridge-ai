'use strict';

const config = require('../../config/env');
const {
  validateMessages,
  validateOptions,
  fetchJson,
  redactSecrets,
} = require('./aiProvider');
const { ProviderError } = require('./providerError');

// Gemini provider (docs/PROJECT_SPEC.md section 4, docs/TEAM_RULES.md
// section 12). All Gemini-specific knowledge lives in this file:
//
//   - generateContent endpoint shape (contents / systemInstruction /
//     generationConfig instead of OpenAI-style messages)
//   - assistant messages map to the "model" role
//   - the API key travels in the x-goog-api-key header — never in the URL —
//     so it cannot leak through request logging
//   - error bodies carry googleapis status strings (RESOURCE_EXHAUSTED,
//     UNAVAILABLE, ...) in addition to HTTP codes
//
// Middle provider in the default fallback chain.

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function createGeminiProvider({
  apiKey = config.ai.providers.gemini.apiKey,
  model = config.ai.providers.gemini.model,
  timeoutMs = config.ai.timeoutMs,
  fetchImpl = fetch,
} = {}) {
  const isConfigured = () => Boolean(apiKey);

  // Converts the uniform AIProvider message list into the Gemini payload.
  function toGeminiPayload(messages, options) {
    const payload = { contents: [] };
    for (const message of messages) {
      if (message.role === 'system') {
        // Gemini models the system prompt out of band (validateMessages
        // guarantees it can only be the single first message).
        payload.systemInstruction = { parts: [{ text: message.content }] };
      } else {
        payload.contents.push({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        });
      }
    }
    const generationConfig = {};
    if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
    if (options.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens;
    if (Object.keys(generationConfig).length > 0) {
      payload.generationConfig = generationConfig;
    }
    return payload;
  }

  // Gemini error classification: HTTP status first, then the googleapis
  // status string for the cases the HTTP code alone cannot distinguish.
  function classifyGeminiError(status, json) {
    const apiStatus = json && json.error && typeof json.error.status === 'string'
      ? json.error.status
      : '';
    const message = redactSecrets(
      (json && json.error && typeof json.error.message === 'string' && json.error.message)
        || `Provider responded with HTTP ${status}.`,
      [apiKey],
    );
    if (status === 429) {
      return /quota/i.test(message)
        ? new ProviderError('gemini', 'QUOTA_EXCEEDED', message, status)
        : new ProviderError('gemini', 'RATE_LIMIT', message, status);
    }
    if (status === 401 || status === 403) {
      return new ProviderError('gemini', 'INVALID_API_KEY', message, status);
    }
    if (status === 400 && /api key not valid/i.test(message)) {
      return new ProviderError('gemini', 'INVALID_API_KEY', message, status);
    }
    if (status === 408) {
      return new ProviderError('gemini', 'TIMEOUT', message, status);
    }
    if (status === 502 || status === 503 || status === 504 || apiStatus === 'UNAVAILABLE') {
      return new ProviderError('gemini', 'SERVICE_UNAVAILABLE', message, status);
    }
    return new ProviderError('gemini', 'PROVIDER_ERROR', message, status);
  }

  async function generateResponse(messages, options) {
    const validMessages = validateMessages(messages);
    const validOptions = validateOptions(options);
    if (!apiKey) {
      throw new ProviderError('gemini', 'NOT_CONFIGURED', 'Provider API key is not configured.');
    }

    const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`;
    const { status, json } = await fetchJson(fetchImpl, url, {
      provider: 'gemini',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: toGeminiPayload(validMessages, validOptions),
      timeoutMs,
    });

    if (status !== 200) {
      throw classifyGeminiError(status, json);
    }

    const candidate = json && Array.isArray(json.candidates) ? json.candidates[0] : null;
    const parts = candidate && candidate.content && Array.isArray(candidate.content.parts)
      ? candidate.content.parts
      : [];
    const content = parts
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');
    if (!content) {
      throw new ProviderError('gemini', 'PROVIDER_ERROR', 'Provider returned an empty response.', status);
    }
    return {
      provider: 'gemini',
      model,
      content,
      finishReason: candidate && candidate.finishReason ? String(candidate.finishReason) : undefined,
      usage: json.usageMetadata
        ? {
          promptTokens: json.usageMetadata.promptTokenCount,
          completionTokens: json.usageMetadata.candidatesTokenCount,
          totalTokens: json.usageMetadata.totalTokenCount,
        }
        : undefined,
    };
  }

  return { name: 'gemini', isConfigured, generateResponse };
}

const provider = createGeminiProvider();

// The default instance is wired into the provider manager; the factory is
// exported for offline tests.
module.exports = provider;
module.exports.createGeminiProvider = createGeminiProvider;
