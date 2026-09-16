# PostOnce production deployment

PostOnce runs as three persistent Railway services from the same repository, plus Railway PostgreSQL and a private Cloudflare R2 bucket:

```text
HTTPS -> postonce-web -> PostgreSQL <- postonce-worker
                    \-> postonce-media -> private R2
```

Railway Config as Code files are intentionally not used. Railway's current Dashboard flow is the supported path for new services. Create all three code services in the same Railway project and environment, from the `main` branch.

## Railway services

Create these services and set their commands in each service's Settings:

| Service | Build command | Start command | Public networking |
| --- | --- | --- | --- |
| `postonce-web` | `npm ci && npm run build` | `npm start` | Generate HTTPS domain |
| `postonce-worker` | `npm ci` | `npm run worker` | No domain |
| `postonce-media` | `npm ci` | `npm run media:serve` | No public domain |

For `postonce-media`, add `RAILPACK_DEPLOY_APT_PACKAGES=... ffmpeg`. The `...` preserves Railpack's generated packages and `ffmpeg` supplies both `ffmpeg` and `ffprobe` at runtime. The media process listens on `0.0.0.0` and uses Railway's `PORT`; `MEDIA_SERVICE_PORT` remains an optional development override.

Only `postonce-web` runs migrations. Set its pre-deploy command in the Railway Dashboard to:

```text
npm run db:migrate && npm run jobs:migrate
```

Do not put migrations in any start command or on worker/media. Set the web healthcheck path to `/api/health/live`, with a timeout of at least 120 seconds. Set restart policy to `Always` for all three services. The worker must remain a persistent process; it is not a cron job.

## Private networking and PostgreSQL TLS

Add a Railway PostgreSQL service in the same project/environment and reference its connection string from each service:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=verify-full
```

Railway private DNS names use the `.railway.internal` suffix. PostOnce keeps TLS enabled for every production connection. For exactly that reserved suffix, the Node PostgreSQL client permits the Railway internal certificate chain while the WireGuard private network supplies transport encryption. Any public or external hostname still requires `rejectUnauthorized: true`. The application does not accept query parameters in `DATABASE_URL` and does not use `sslmode`.

## Variables shared by all three services

Set these as server-only Railway variables on web, worker, and media:

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

MEDIA_SERVICE_SECRET=<same random server-only secret on web and media>
```

Set `PORT=4010` on `postonce-media` so its private port is stable. Set these on
web and worker:

```text
MEDIA_SERVICE_URL=http://postonce-media.railway.internal:4010
```

The media service uses `PORT=4010` as its stable private listener value. If Railway assigns a different port instead, set `PORT` and use that same port in `MEDIA_SERVICE_URL`. Private Railway traffic uses `http://` because the service-to-service WireGuard network is encrypted; do not generate a public media domain. Every media endpoint remains bearer-authenticated and rejects requests without `MEDIA_SERVICE_SECRET`.

Web-only identity and OAuth variables:

```text
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
```

Do not commit any value for these variables. `GOOGLE_*` is the PostOnce login client; YouTube publishing uses its separate `YOUTUBE_*` client.

## Cloudflare R2

Create one private bucket and one R2 API token scoped to that bucket. The token needs object read, write, list, and delete access. Use the account endpoint and region `auto`; keep public access disabled. Configure bucket CORS for the web origin with `PUT`, `GET`, and `HEAD`, allow `Content-Type` and upload headers, and expose `ETag`.

PostOnce uses short-lived signed URLs for upload parts and reads. The upload part presign deliberately does not send AWS `ChecksumSHA256`; R2 does not support that `UploadPart` request parameter. The SHA-256 value remains stored in the application database for resumability and is checked during processing.

## Verification after provisioning

```text
GET https://<railway-web-domain>/api/health/live  -> 200
GET https://<railway-web-domain>/api/health/ready -> 200 with database: ok
```

The worker log must contain `PostOnce publishing worker ready.`. The media log must contain `Media service ready on 4010`. Upload a small test asset through the web UI, verify the returned media URL is signed, and confirm the object is not publicly readable. Then register OAuth callback URLs in Google, Meta, TikTok, and YouTube using the Railway HTTPS origin.
