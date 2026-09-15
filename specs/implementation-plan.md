# PostOnce — Implementation Plan

## Phase 1 — Foundations (completed)
**Objective:** establish a runnable, testable modular-monolith foundation without platform integrations.
**Includes:** Next.js/TypeScript scaffold, module boundaries, environment validation, Drizzle identity-anchor/draft ownership schema (not auth), migrations setup, health endpoint, test setup and developer documentation.
**Main files:** `src/app`, `src/modules`, `src/db`, `src/config`, `drizzle.config.ts`, `vitest.config.ts`, `.env.example`.
**Verification:** typecheck, lint, production build, unit/health tests, migration generation/check, SQL migration/constraint tests, and HTTP smoke checks. CI runs PostgreSQL service integration tests.
**Depends on:** approved architecture and existing product specs.

## Phase 2 — Identity and connections (implemented and locally verified)
**Objective:** implement PostOnce authentication and secure platform connection records.
**Includes:** Better Auth integration, encrypted token storage, connection lifecycle, OAuth adapter contracts (no fake TikTok).
**Verification:** auth integration tests, authorization tests, token secrecy checks.
**Depends on:** Phase 1.

## Phase 3 — Drafts and media
**Objective:** create/recover drafts and process temporary media.
**Includes:** S3 storage, upload flow, FFmpeg/Sharp jobs, draft autosave and cover assets.
**Verification:** storage integration tests, media fixtures, responsive workflow checks.
**Depends on:** Phases 1–2.

## Phase 4 — Platform configuration and preflight
**Objective:** normalize shared fields while preserving platform differences.
**Includes:** independent Instagram/TikTok/YouTube adapters, capability mapping, validation and consent rules.
**Verification:** adapter contract tests and spec acceptance scenarios.
**Depends on:** Phases 2–3 and TikTok spike.

## Phase 5 — Durable publishing
**Objective:** publish independently with reliable durable jobs.
**Includes:** pg-boss, worker, idempotency, UnknownOutcome/reconciliation and secondary operations.
**Verification:** crash/recovery, retry, duplicate-prevention and partial-success tests.
**Depends on:** Phase 4.

## Phase 6 — V1 hardening
**Objective:** production readiness and release.
**Includes:** observability, security review, deployment, responsive UX polish and documentation.
**Verification:** full test suite, build, accessibility/security checks and release checklist.
**Depends on:** Phases 1–5.


## Scope boundaries and primary components

- Phase 1: no auth, worker, media or real/fake platform implementations. Initial schema
  must not decide account cardinality or draft deletion policy. Exit: repeatable checks,
  documented limitations, commits and push to official main, then stop for approval.
- Phase 2: `src/modules/users`, `src/modules/connections`, auth routes/migrations.
  Approved: Google-only login and one active connection per platform per user.
  See `phase-2.md` for scope, security and acceptance checks.
- Phase 3: `src/modules/drafts`, `src/modules/media`, storage infrastructure and draft UI.
  Resolve retention, quotas and blocking draft questions with the owner.
- Phase 4: `src/modules/platforms/{instagram,tiktok,youtube}`, configuration UI/preflight.
  Dedicated TikTok spike verifies real authorization, publication, reconciliation,
  restrictions and cost; no public publishing without consent. Ask unresolved defaults.
- Phase 5: `src/worker`, `src/infrastructure/jobs`, `src/modules/publishing`, migrations,
  batch/status UI. Ask cancellation and timeout UX questions before implementing them.
- Phase 6: deployment configuration, operations runbook, E2E tests and responsive UI.
  Pushing source to GitHub does not deploy the public service.
