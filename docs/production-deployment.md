# PostOnce production deployment

This repository is prepared for two persistent Railway services from the same
commit, plus Railway PostgreSQL and a private Cloudflare R2 bucket. No Docker,
local filesystem, local SeaweedFS, or Redis is required.

## Railway services

Configure the web service to use `/railway.web.toml` as its Railway Config as
Code file. It runs the build `npm ci && npm run build`, executes the two
migrations once as the pre-deploy command, starts with `npm start`, and checks
`/api/health/live`. Configure the worker service to use
`/railway.worker.toml`; it builds with `npm ci` and starts with `npm run worker`.
The worker has no public domain or healthcheck requirement. Both services must
use the same repository and production environment variables.

The web pre-deploy command is intentionally on one service only:

```text
npm run db:migrate
npm run jobs:migrate
```

Do not add either migration command to `startCommand`, and do not configure it
on the worker. Railway runs pre-deploy commands before the new web deployment
is made live, with the service environment available. `DATABASE_URL` must be
the Railway PostgreSQL reference variable; `DATABASE_SSL=verify-full` is
required in production.

Use the HTTPS domain Railway assigns to the web service as the initial public
origin. Set `BETTER_AUTH_URL` to that exact origin and use it for every OAuth
redirect URI below. The worker does not need a domain.

## Variables shared by web and worker

Set these as server-only Railway variables on both services:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=verify-full
TOKEN_ENCRYPTION_KEYS=<JSON key-version map containing a random 32-byte base64 key>
TOKEN_ACTIVE_KEY_VERSION=k1

S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=<private R2 bucket name>
S3_ACCESS_KEY_ID=<R2 API token access key>
S3_SECRET_ACCESS_KEY=<R2 API token secret>
S3_FORCE_PATH_STYLE=false
S3_ENFORCE_PUBLIC_ACCESS_BLOCK=true

BETTER_AUTH_URL=https://<railway-web-domain>
BETTER_AUTH_SECRET=<random server-only secret>
GOOGLE_CLIENT_ID=<Google OAuth client id>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>

INSTAGRAM_CLIENT_ID=<Meta app id>
INSTAGRAM_CLIENT_SECRET=<Meta app secret>
INSTAGRAM_OAUTH_REDIRECT_URI=https://<railway-web-domain>/api/connections/instagram/callback
TIKTOK_CLIENT_KEY=<TikTok app key>
TIKTOK_CLIENT_SECRET=<TikTok app secret>
TIKTOK_OAUTH_REDIRECT_URI=https://<railway-web-domain>/api/connections/tiktok/callback
YOUTUBE_CLIENT_ID=<Google YouTube OAuth client id>
YOUTUBE_CLIENT_SECRET=<Google YouTube OAuth client secret>
YOUTUBE_OAUTH_REDIRECT_URI=https://<railway-web-domain>/api/connections/youtube/callback

MEDIA_SERVICE_URL=<HTTPS URL of the private media processor>
MEDIA_SERVICE_SECRET=<matching server-only shared secret>
```

Do not commit any value for these variables. `GOOGLE_*` is the PostOnce login
client; YouTube publishing uses its separate `YOUTUBE_*` client.

## Cloudflare R2 handoff

Create one private bucket and one R2 API token scoped to that bucket. The token
needs object read, write, list, and delete access for the PostOnce bucket. Set
the R2 S3 endpoint with the account ID and use region `auto`. Keep public access
disabled. Configure bucket CORS for the Railway web origin with `PUT`, `GET`,
and `HEAD`, allow `Content-Type` and `*` request headers as required by the
browser upload, and expose `ETag`.

PostOnce uses short-lived signed URLs for upload parts and reads. The upload
part presign deliberately does not send AWS `ChecksumSHA256`; R2 does not
support that `UploadPart` request parameter. The SHA-256 value remains stored
in the application database for resumability and is checked again during media
processing.

## Verification after provisioning

After Railway and R2 values exist, verify:

```text
GET https://<railway-web-domain>/api/health/live      -> 200
GET https://<railway-web-domain>/api/health/ready     -> 200 with database: ok
```

The worker log must contain `PostOnce publishing worker ready.`. Upload one
small test asset through the web UI and verify the media URL is signed and the
object is not publicly readable. Then configure OAuth callback URLs in the
Google, Meta, TikTok, and YouTube consoles using the Railway HTTPS origin.
