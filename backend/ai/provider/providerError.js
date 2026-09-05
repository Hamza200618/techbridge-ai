'use strict';

// Error model for the AI provider layer (docs/PROJECT_SPEC.md section 4.1,
// docs/API_CONTRACT.md section 30).
//
// The orchestrator needs to know whether a failure is fallback-worthy, and
// the answer is expressed through the error TYPE, not a flag:
//
//   InvalidRequestError  — the CALLER sent a malformed request (bad message
//                          shape, bad options). No provider was contacted,
//                          so no provider can fix it: never fall back
//                          ("should not blindly fallback for every possible
//                          programming/request error").
//
//   ProviderError        — a provider-side failure after a provider was
//                          actually contacted: timeout, rate limit, quota,
//                          network failure, service unavailable, invalid API
//                          key, or any other provider API error. Always
//                          fallback-worthy.
//
//   AllProvidersFailedError — the entire fallback chain failed. The single
//                          controlled error the manager surfaces; the AI
//                          service layer maps it to the API error code
//                          AI_ALL_PROVIDERS_FAILED (HTTP 503).
//
// Error messages in this layer must be safe to log: they never contain API
// key values (providers redact their own key before constructing errors).

class InvalidRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidRequestError';
    Error.captureStackTrace(this, InvalidRequestError);
  }
}

// code is one of: TIMEOUT, RATE_LIMIT, QUOTA_EXCEEDED, NETWORK_ERROR,
// SERVICE_UNAVAILABLE, INVALID_API_KEY, PROVIDER_ERROR, NOT_CONFIGURED.
class ProviderError extends Error {
  constructor(provider, code, message, httpStatus = null) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.httpStatus = httpStatus;
    Error.captureStackTrace(this, ProviderError);
  }
}

// failures: [{ provider, code, message }] — one safe entry per provider
// that was tried (no API keys, no URLs, no raw stack traces).
class AllProvidersFailedError extends Error {
  constructor(failures) {
    super('All AI providers failed to generate a response.');
    this.name = 'AllProvidersFailedError';
    this.failures = failures;
    Error.captureStackTrace(this, AllProvidersFailedError);
  }
}

// Normalizes anything a provider threw into a ProviderError so the manager
// can fall back instead of crashing ("Never crash the server because one
// provider failed"). InvalidRequestError passes through unchanged — it is
// caller-side and must not trigger fallback.
function toProviderError(provider, error) {
  if (error instanceof ProviderError || error instanceof InvalidRequestError) {
    return error;
  }
  const detail = error instanceof Error && error.message
    ? String(error.message).slice(0, 300)
    : 'Unknown failure.';
  return new ProviderError(provider, 'PROVIDER_ERROR', `Unexpected provider failure: ${detail}`);
}

module.exports = {
  InvalidRequestError,
  ProviderError,
  AllProvidersFailedError,
  toProviderError,
};
