# Phase 5 — Durable publishing and deployment

## Runtime topology

PostOnce runs as three persistent Node services from the same release:

```text
HTTPS -> Next web (`npm start`) -> managed PostgreSQL <- worker (`npm run worker`)
                   |                       |
                   +---- private S3 ---- media (`npm run media:serve`)
```

The web process authenticates users, repeats preflight and creates a batch plus
pg-boss jobs in one PostgreSQL transaction. The worker is the only process that
executes publishing side effects. The media process owns FFmpeg/FFprobe work.
Closing or reloading the browser does not stop jobs. All three services use the
same `DATABASE_URL`, token-encryption keyring and S3 configuration. Production
does not require Docker Desktop or SeaweedFS.

Deploy managed PostgreSQL with verified TLS and private S3-compatible storage.
Build with `npm ci && npm run build`. As an explicit release step, run
`npm run db:migrate && npm run jobs:migrate` exactly once before starting the new
web and worker processes. Application startup does not create or migrate either
schema. Roll forward with reviewed migrations and take a database backup first.

The web command is `npm start`; the worker command is `npm run worker`. Web health
uses `/api/health/live` and `/api/health/ready`. The worker logs its ready message
only after all durable queues and handlers are available. The host should restart
either persistent process after a non-zero exit.

## Environment and HTTPS

Start from `.env.example`. `BETTER_AUTH_URL` must be the public HTTPS origin and
each registered OAuth redirect URI must use that same origin. The Google identity
login grant is separate from the YouTube publishing grant. Platform tokens remain
encrypted with `TOKEN_ENCRYPTION_KEYS`; rotate by adding a key version before
changing `TOKEN_ACTIVE_KEY_VERSION`.

`S3_ENDPOINT` is optional for AWS and required for another S3-compatible vendor.
The bucket remains private. Instagram and TikTok pull media through short-lived
signed URLs, so the production object-storage hostname/prefix must be reachable
by provider servers and registered or verified where required. SeaweedFS and its
development credentials are local-only.

## Durable state and duplicate avoidance

`PublishBatch`, `PlatformPublishAttempt` and `SecondaryOperation` remain the
authority independently of pg-boss retention. A partial unique database index
permits one `Pending`/`Publishing` batch per user. Each platform receives an
independent job and attempt history. Batch creation and initial queue inserts use
one PostgreSQL transaction through pg-boss's Drizzle adapter.

Before a remote request, the attempt records its request boundary. Provider
creation IDs and final IDs persist as soon as each response arrives. A worker
restart reconciles `Publishing` attempts and never repeats their publish action.
A response lost across a non-idempotent boundary becomes `UnknownOutcome`. That
state permits reconciliation only. Only the latest `Failed` attempt can create
one new attempt for that platform. There is no Retry All action.

YouTube thumbnail upload is a `SecondaryOperation`. A successful video plus a
failed thumbnail becomes `PublishedWithWarning`; retry creates another thumbnail
operation and never uploads the video again.

## Official API research (verified 2026-09-16)

- Meta's official Instagram collection documents polling a media container until
  `FINISHED` before `media_publish`:
  https://www.postman.com/meta/instagram/request/munmruq/get-ig-container-status
- TikTok Direct Post initializes a request, returns a `publish_id`, requires user
  metadata/consent, and supports verified `PULL_FROM_URL` sources:
  https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
- TikTok reconciliation uses the status endpoint and distinguishes processing,
  `PUBLISH_COMPLETE`, and `FAILED`:
  https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
- YouTube supports resumable `videos.insert`, owner-only processing status through
  `videos.list`, and a separate `thumbnails.set` operation:
  https://developers.google.com/youtube/v3/docs/videos/insert
  https://developers.google.com/youtube/v3/docs/videos/list
  https://developers.google.com/youtube/v3/docs/thumbnails/set
- pg-boss provides PostgreSQL durable delivery but still requires application
  idempotency around retried remote effects:
  https://github.com/timgit/pg-boss/blob/master/docs/readme.md

No test or CI job calls a social API. Provider clients accept an injected HTTP
transport and tests use deterministic responses at that boundary.
