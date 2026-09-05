'use strict';

const config = require('../../config/env');
const { logger } = require('../../utils/logger');
const groqProvider = require('./groqProvider');
const geminiProvider = require('./geminiProvider');
const openaiProvider = require('./openaiProvider');
const {
  InvalidRequestError,
  AllProvidersFailedError,
  toProviderError,
} = require('./providerError');
const { validateMessages, validateOptions } = require('./aiProvider');

// AI provider manager — the only component that chooses an AI provider
// (docs/ARCHITECTURE.md section 12, docs/TEAM_RULES.md sections 12-13).
//
// Fallback chain: Groq → Gemini → OpenAI. AI_PRIMARY_PROVIDER moves its
// provider to the front; with the default "groq" the chain matches the
// required order exactly. Providers without an API key are skipped.
//
// Fallback policy:
//   - ProviderError (timeout, rate limit, quota, network, unavailable,
//     invalid key, provider API error) → log safely, try the next provider.
//   - InvalidRequestError (caller-side malformed request) → rethrow
//     immediately; no provider can fix the request, so falling back would
//     just send the same broken request elsewhere.
//   - Unexpected exceptions inside a provider → wrapped as PROVIDER_ERROR
//     and treated like any provider failure (never crash the server).
//   - Every provider failing → one controlled AllProvidersFailedError.
//
// Logging (docs/TEAM_RULES.md section 28): provider name, error code, HTTP
// status and the (pre-redacted) provider message only — never API keys,
// never request URLs, never headers.

const DEFAULT_ORDER = ['groq', 'gemini', 'openai'];

function createProviderManager({
  providers,
  primaryProvider = config.ai.primaryProvider,
  logger: log = logger,
} = {}) {
  const known = new Set(DEFAULT_ORDER);
  let primary = String(primaryProvider || 'groq').trim().toLowerCase();
  if (!known.has(primary)) {
    log.warn('Unknown AI_PRIMARY_PROVIDER — using the default fallback order', {
      primaryProvider,
      fallbackOrder: DEFAULT_ORDER,
    });
    primary = 'groq';
  }
  const order = [primary, ...DEFAULT_ORDER.filter((name) => name !== primary)];

  // Configured providers in fallback order (names only — no keys, no URLs).
  function getProviderChain() {
    return order.filter((name) => providers[name] && providers[name].isConfigured());
  }

  async function generateResponse(messages, options) {
    // Caller-side validation happens before any provider is contacted.
    // InvalidRequestError propagates without fallback attempts.
    const validMessages = validateMessages(messages);
    const validOptions = validateOptions(options);

    const chain = getProviderChain();
    if (chain.length === 0) {
      // Controlled error for invalid configuration (TEAM_RULES.md section 27,
      // Test 5) — the backend keeps running; only this request fails.
      log.error('AI request rejected: no AI provider is configured');
      throw new AllProvidersFailedError([
        { provider: null, code: 'NOT_CONFIGURED', message: 'No AI provider is configured.' },
      ]);
    }

    const failures = [];
    for (let index = 0; index < chain.length; index += 1) {
      const name = chain[index];
      const nextProvider = index + 1 < chain.length ? chain[index + 1] : null;
      try {
        const response = await providers[name].generateResponse(validMessages, validOptions);
        if (failures.length > 0) {
          log.info('AI request succeeded after fallback', {
            provider: name,
            failedProviders: failures.map((failure) => failure.provider),
          });
        }
        return response;
      } catch (error) {
        if (error instanceof InvalidRequestError) {
          // Defensive: providers re-validate, but a caller-side problem must
          // never be answered by trying another provider.
          throw error;
        }
        const providerError = toProviderError(name, error);
        failures.push({
          provider: name,
          code: providerError.code,
          message: providerError.message,
        });
        log.warn('AI provider failed', {
          provider: name,
          code: providerError.code,
          httpStatus: providerError.httpStatus,
          message: providerError.message,
          willFallbackTo: nextProvider,
        });
      }
    }

    log.error('All AI providers failed', {
      attempted: failures.map((failure) => failure.provider),
      failures,
    });
    throw new AllProvidersFailedError(failures);
  }

  return { generateResponse, getProviderChain };
}

// Default manager wired with the real providers and configuration. The rest
// of the backend uses this instance (through ai/provider/index.js) and never
// the individual providers.
const defaultManager = createProviderManager({
  providers: {
    groq: groqProvider,
    gemini: geminiProvider,
    openai: openaiProvider,
  },
});

module.exports = {
  generateResponse: defaultManager.generateResponse,
  getProviderChain: defaultManager.getProviderChain,
  createProviderManager,
};
