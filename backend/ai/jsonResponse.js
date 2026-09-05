'use strict';

// Shared extraction of a JSON object from a provider response. The provider
// layer has no JSON response mode, so models are instructed to answer with
// JSON only; this helper tolerates surrounding prose and markdown fences and
// returns the parsed object, or null when no complete JSON object is found.
// Callers validate the domain shape and map null to their controlled error.

function extractJsonObject(rawText) {
  let candidate = String(rawText || '').trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) candidate = fenced[1].trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

module.exports = { extractJsonObject };
