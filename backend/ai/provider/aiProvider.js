'use strict';

const config = require('../../config/env');
const { ProviderError, InvalidRequestError } = require('./providerError');

// ── AIProvider contract (docs/ARCHITECTURE.md sections 12-13) ─────────────
//
// Every provider implements the same interface:
//
//   name             'groq' | 'gemini' | 'openai'
//   isConfigured()   → true when the provider has an API key and can serve
//                      requests. The manager skips unconfigured providers.
//   generateResponse(messages, options) → Promise<ProviderResponse>
//
// messages: [{ role: 'system' | 'user' | 'assistant', content: string }]
//           A system message may only appear once, as the first message
//           (Gemini models it out of band; the rule is shared so callers
//           get one uniform contract).
// options:  { temperature?: number (0..2), maxTokens?: positive integer }
//
// ProviderResponse (normalized — identical shape for every provider):
//   { provider, model, content, finishReason?, usage? }
//     usage: { promptTokens, completionTokens, totalTokens }
//
// Providers throw ProviderError for provider-side failures and
// InvalidRequestError for malformed caller input. They never touch the
// database, never log API keys, and never log request URLs (Groq/OpenAI
// keys travel in headers, the Gemini key in a header too — never in a URL).

const VALID_ROLES = new Set(['system', 'user', 'assistant']);
const MAX_MESSAGE_COUNT = 200;
const MAX_MESSAGE_CHARS = 200000;
const MAX_MAX_TOKENS = 100000;

// Validates and normalizes the messages argument. Throws
// InvalidRequestError (no fallback — the request never reaches a provider).
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new InvalidRequestError('messages must be a non-empty array.');
  }
  if (messages.length > MAX_MESSAGE_COUNT) {
    throw new InvalidRequestError(`messages must contain at most ${MAX_MESSAGE_COUNT} entries.`);
  }
  return messages.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new InvalidRequestError(`messages[${index}] must be an object.`);
    }
    if (!VALID_ROLES.has(message.role)) {
      throw new InvalidRequestError(
        `messages[${index}].role must be one of: ${[...VALID_ROLES].join(', ')}.`,
      );
    }
    if (message.role === 'system' && index !== 0) {
      throw new InvalidRequestError('A system message is only allowed as the first message.');
    }
    if (typeof message.content !== 'string' || message.content.trim() === '') {
      throw new InvalidRequestError(`messages[${index}].content must be a non-empty string.`);
    }
    if (message.content.length > MAX_MESSAGE_CHARS) {
      throw new InvalidRequestError(`messages[${index}].content exceeds ${MAX_MESSAGE_CHARS} characters.`);
    }
    return { role: message.role, content: message.content };
  });
}

// Validates and normalizes the options argument (unknown keys are ignored
// for forward compatibility).
function validateOptions(options) {
  if (options === undefined || options === null) {
    return {};
  }
  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new InvalidRequestError('options must be an object.');
  }
  const normalized = {};
  if (options.temperature !== undefined) {
    if (
      typeof options.temperature !== 'number'
      || !Number.isFinite(options.temperature)
      || options.temperature < 0
      || options.temperature > 2
    ) {
      throw new InvalidRequestError('options.temperature must be a number between 0 and 2.');
    }
    normalized.temperature = options.temperature;
  }
  if (options.maxTokens !== undefined) {
    if (!Number.isInteger(options.maxTokens) || options.maxTokens <= 0 || options.maxTokens > MAX_MAX_TOKENS) {
      throw new InvalidRequestError(`options.maxTokens must be an integer between 1 and ${MAX_MAX_TOKENS}.`);
    }
    normalized.maxTokens = options.maxTokens;
  }
  return normalized;
}

// POSTs a JSON body with a hard timeout. Returns { status, json } — json is
// null when the body is not parsable (proxies sometimes answer HTML errors).
// Network failures and timeouts are ProviderErrors, which makes them
// fallback-worthy for the manager.
async function fetchJson(fetchImpl, url, { provider, headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderError(provider, 'TIMEOUT', `Request timed out after ${timeoutMs}ms.`);
    }
    throw new ProviderError(provider, 'NETWORK_ERROR', 'Could not reach the AI provider.');
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

// Best-effort error message extraction from an OpenAI-style error body
// ({ error: { message } }) or a plain { message } body.
function extractErrorMessage(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.error && typeof json.error.message === 'string') return json.error.message;
  if (typeof json.message === 'string') return json.message;
  return null;
}

// Replaces every occurrence of the given secret values in a string.
// Defense in depth: if a provider ever echoes a key back in an error
// message, the stored/logged message contains '[Redacted]' instead.
function redactSecrets(text, secrets) {
  let output = String(text);
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) {
      output = output.split(secret).join('[Redacted]');
    }
  }
  return output;
}

// Maps an HTTP status (plus provider message) onto a ProviderError code.
// Shared by the OpenAI-compatible providers; Gemini adds its own status
// string handling on top.
function classifyHttpError(provider, status, message) {
  if (status === 429) {
    return /quota|billing|exceeded your current|insufficient/i.test(message)
      ? new ProviderError(provider, 'QUOTA_EXCEEDED', message, status)
      : new ProviderError(provider, 'RATE_LIMIT', message, status);
  }
  if (status === 401 || status === 403) {
    return new ProviderError(provider, 'INVALID_API_KEY', message, status);
  }
  if (status === 408) {
    return new ProviderError(provider, 'TIMEOUT', message, status);
  }
  if (status === 502 || status === 503 || status === 504) {
    return new ProviderError(provider, 'SERVICE_UNAVAILABLE', message, status);
  }
  return new ProviderError(provider, 'PROVIDER_ERROR', message, status);
}

// Factory for providers that speak the OpenAI chat-completions wire format
// (Groq and OpenAI — docs/TEAM_RULES.md section 11: one implementation, no
// duplicates). Everything provider-specific is injected: name, endpoint,
// key, model. Tests inject fetchImpl for fully offline verification.
function createChatCompletionsProvider({
  name,
  url,
  apiKey,
  model,
  timeoutMs = config.ai.timeoutMs,
  fetchImpl = fetch,
}) {
  const isConfigured = () => Boolean(apiKey);

  async function generateResponse(messages, options) {
    const validMessages = validateMessages(messages);
    const validOptions = validateOptions(options);
    if (!apiKey) {
      throw new ProviderError(name, 'NOT_CONFIGURED', 'Provider API key is not configured.');
    }

    const body = { model, messages: validMessages };
    if (validOptions.temperature !== undefined) body.temperature = validOptions.temperature;
    if (validOptions.maxTokens !== undefined) body.max_tokens = validOptions.maxTokens;

    const { status, json } = await fetchJson(fetchImpl, url, {
      provider: name,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      timeoutMs,
    });

    if (status !== 200) {
      const message = redactSecrets(
        extractErrorMessage(json) || `Provider responded with HTTP ${status}.`,
        [apiKey],
      );
      throw classifyHttpError(name, status, message);
    }

    const choice = json && Array.isArray(json.choices) ? json.choices[0] : null;
    const content = choice && choice.message && typeof choice.message.content === 'string'
      ? choice.message.content
      : null;
    if (!content) {
      throw new ProviderError(name, 'PROVIDER_ERROR', 'Provider returned an empty response.', status);
    }
    return {
      provider: name,
      model,
      content,
      finishReason: choice && choice.finish_reason ? String(choice.finish_reason) : undefined,
      usage: json.usage
        ? {
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
        }
        : undefined,
    };
  }

  return { name, isConfigured, generateResponse };
}

module.exports = {
  validateMessages,
  validateOptions,
  fetchJson,
  extractErrorMessage,
  redactSecrets,
  classifyHttpError,
  createChatCompletionsProvider,
};
