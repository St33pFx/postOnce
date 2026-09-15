# PostOnce — Technical Architecture (V1)

## Approved baseline

PostOnce V1 is a centrally hosted public web application; its source is open on GitHub, but self-hosting is not the primary distribution model. The stack is Next.js, React, TypeScript and Node.js, with PostgreSQL + Drizzle ORM, S3-compatible object storage, FFmpeg/Sharp, and a separate Node worker. PostgreSQL-backed persistent jobs are preferred; Redis and microservices are out of scope for V1.

## Modular monolith

The Next.js application owns HTTP/UI, authentication, domain orchestration and platform-independent persistence. Modules are organized around `users`, `drafts`, `connections`, `publishing` and `platforms`. A separate worker process consumes durable publication jobs. Platform adapters implement a common contract for Instagram, TikTok and YouTube; TikTok remains mandatory but intentionally has no fake implementation until a technical spike selects a real mechanism.

## Data and media

PostgreSQL stores users, drafts, connections, batches, per-platform publication attempts, normalized states and durable jobs. Tokens are server-only and encrypted at rest. Temporary video/thumbnail files live in S3-compatible storage and are referenced by object keys, not exposed as arbitrary local paths. FFmpeg handles video/frame work and Sharp handles image work.

## Reliability and states

Jobs are durable and recoverable after worker crashes. Unknown remote outcomes are first-class: the system never assumes success/failure, does not auto-retry, and only reconciles through real platform mechanisms. Actions that could duplicate a publication are blocked while outcome is unknown. Secondary operations (for example thumbnails) have independent status and retry; a successful publication with a secondary failure is `PublishedWithWarning`.

## Authentication

PostOnce identity is distinct from connected platform accounts. Before production auth implementation, the selected maintained option is Better Auth (server-side, TypeScript/Node-compatible, database-backed and avoiding hand-built password authentication); its current API/security compatibility must be rechecked during the auth milestone. Platform OAuth is handled only by adapters/connections.

## Background jobs decision

Selected: pg-boss. See the comparison and reliability constraints below. No custom queue.

## TikTok technical spike

The adapter boundary supports Direct Post, a real external provider, n8n backed by a real integration, or another verified mechanism. No success is simulated and no unsupported custom TikTok cover is advertised.

## Technical decisions — verified 2026-09-15

Registry metadata was consulted using `npm view <package> version time.modified engines`.
Versions are evaluation snapshots; auth/job dependencies are installed in their milestones.

| Jobs option | Evaluation |
|---|---|
| pg-boss 12.32.0 (updated September 14) | PostgreSQL locking, retry/backoff, delayed jobs, expiration/recovery, queue policies and transactional enqueue with Drizzle support. Selected for its Node API and transaction integration. |
| Graphile Worker 0.18.0 (updated September 8) | Maintained PostgreSQL/Node alternative with SQL enqueue, locking, retries, cron and job keys. Viable, but no clear advantage for this domain over pg-boss. |
| Custom PostgreSQL queue | Rejected: no requirement justifies implementing locking, leases, recovery and scheduling ourselves. |

**Decision: pg-boss**, integrated in Phase 5. Internal scheduling for maintenance is
not user-facing publication scheduling. Queue guarantees cannot provide exactly-once
remote side effects. Persist an attempt boundary BEFORE remote requests. On crash or
redelivery, do not repeat an unconfirmed publication request; classify/reconcile
UnknownOutcome using real evidence. Disable automatic retry of publication side
effects; safe maintenance jobs may retry. Batch creation and enqueue must be atomic
(shared transaction), verified in Phase 5. No queue or worker is implemented in Phase 1.

| Auth option | Evaluation |
|---|---|
| Better Auth 1.7.5 (updated September 14) | Selected: maintained Next.js integration and Drizzle/PostgreSQL adapter, library-managed sessions and credentials. Keeps identity data within the central service. |
| Auth.js / next-auth 4.24.15; v5 beta | Established OAuth/session alternative; stable v4 and beta v5 split adds migration choices without a clear benefit for this new project. |
| Managed external identity | Viable, but adds a provider/data boundary not required for this baseline. |

Phase 2 product approval selects Google-only sign-in, with no YouTube scopes, and one
active platform account per platform per user. See `phase-2.md`. No password hashing
or password endpoints are hand-built; auth tables follow Better Auth's standard schema.
The initial `postonce_users` anchor is distinct from future auth-library tables and
from platform accounts. Recheck security advisories and APIs before installing auth.

Primary references consulted: npm registry metadata and package READMEs; official
Better Auth Next.js/Drizzle docs and Graphile Worker documentation (see URLs below).
- https://github.com/timgit/pg-boss
- https://pgboss.io/
- https://worker.graphile.org/docs
- https://better-auth.com/docs/integrations/next
- https://better-auth.com/docs/adapters/drizzle
- https://registry.npmjs.org/pg-boss/latest
- https://registry.npmjs.org/graphile-worker/latest
- https://registry.npmjs.org/better-auth/latest
- https://registry.npmjs.org/next-auth/latest

## Security and runtime boundaries

Only server/worker code accesses PostgreSQL or secrets. Browser code must not import
persistence. Environment errors expose names, never values. No unprotected domain
endpoints are delivered in Phase 1. Production uses HTTPS and verified database TLS;
loopback PostgreSQL may omit TLS in local development. Hosting secrets never enter Git.
Platform tokens will use authenticated encryption with versioned keys outside the DB;
rotation, encryption and per-user authorization are Phase 2 requirements.

S3 buckets remain private; short-lived signed access is owner-authorized. Worker media
processing is bounded and outside HTTP requests. Retention, quotas and upload limits
remain product questions for Phase 3. Logs must redact credentials and user content.

Phase 1 stored identity anchors and draft ownership/caption only. Connections, media,
batches, attempts and secondary-operation tables are added with their workflows to
avoid freezing unresolved account cardinality or deletion behavior. No auth, media,
publishing or fake adapters are exposed. Liveness reports the web process only;
readiness checks DB and expected schema without leaking details. Production migrations
are an explicit release step, never implicit in web-process startup.

Phase 2 now implements Better Auth 1.7.5 with its official Drizzle adapter, login-token
minimization, persistent sessions, owner-scoped connections and versioned AES-GCM
platform-token envelopes. No platform OAuth adapter is implemented yet. Draft identity
bindings are required for approved reconnection invalidation, not media/publishing scope.
See `docs/phase-2-setup.md` for trust boundaries and external verification limits.
