'use strict';

const crypto = require('crypto');

// Content hashing for file versioning (docs/PROJECT_SPEC.md section 5,
// docs/API_CONTRACT.md section 31: use existing schema). SHA-256 over the
// UTF-8 content so any byte change flips the hash. The returned string is
// prefixed with the algorithm name so it is self-describing.

function hashContent(content) {
  if (content === null || content === undefined) {
    return null;
  }
  const digest = crypto.createHash('sha256').update(String(content), 'utf8').digest('hex');
  return `sha256:${digest}`;
}

// project_files.content_hash is written by the analyzer's discovery as bare
// sha256 hex (analyzer/discovery/fileDiscovery.js). Change-apply must store
// the same format so the column stays comparable across analyzer runs and
// applied changes - use this helper for column writes and hashContent for
// API payloads.
function storageHash(content) {
  if (content === null || content === undefined) {
    return null;
  }
  return crypto.createHash('sha256').update(String(content), 'utf8').digest('hex');
}

module.exports = { hashContent, storageHash };
