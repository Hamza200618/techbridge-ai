'use strict';

// Maps a `users` table row (database/schema.sql) to the public API user
// shape defined in docs/API_CONTRACT.md (section 6).
//
// SECURITY: this is the single place that builds user objects for API
// responses — password_hash is never included.
function toPublicUser(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.full_name, // API contract uses `name`; the table column is `full_name`
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { toPublicUser };
