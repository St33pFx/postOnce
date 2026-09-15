# Phase 2 — Identity and Connections

Approved product decisions: Google-only PostOnce login using Better Auth; login
scopes must never authorize YouTube. One active connection per user/platform.
Reconnecting a different remote identity preserves history and requires explicit
confirmation for previously prepared content, which must also be revalidated.

## Implementation sequence

1. Real Better Auth/Drizzle identity, persistent sessions, Google redirect login,
   logout, protected pages/API and domain identity mapping.
2. Versioned AES-256-GCM token vault and owner-scoped connection lifecycle with
   database-enforced cardinality, immutable remote identity and revision checks.
3. Security/integration tests, documentation, full checks, commits, push and CI.

Platform OAuth adapters are not yet configured/implemented. No connect button may
pretend to connect. Provider-authenticated grants enter only via a server contract;
there is no HTTP endpoint accepting arbitrary account IDs/tokens from the browser.
Google OAuth login is implemented using current official documentation; real Google
credentials and redirect registration remain external setup, not fake test values.

Prepared-content bindings contain the exact connection identity and a revision.
Changing remote identity marks bindings for revalidation; confirmation is scoped to
owner + draft + platform + current connection/revision and never edits history.
No media, batches, attempts or publishing job tables are added.

Security checks: session/cookie expiration, logout invalidation, OAuth state/PKCE,
callback origin validation, CSRF, owner isolation, unique active slots, authenticated
encryption with AAD, wrong keys/tampering, redacted responses/logging.

Official sources verified 2026-09-15:
- https://better-auth.com/docs/authentication/google
- https://better-auth.com/docs/concepts/session-management
- https://better-auth.com/docs/concepts/security
- https://better-auth.com/docs/adapters/drizzle
- https://developers.google.com/identity/openid-connect/openid-connect

Stop after Phase 2; no Phase 3 implementation.
