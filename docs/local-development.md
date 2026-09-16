# Local development

Requires Node.js 24 and Docker Desktop running Linux containers. In Windows
PowerShell with restricted execution policy, use `npm.cmd` instead of `npm`.

```powershell
Copy-Item .env.local.example .env.local
npm.cmd run dev:local
```

Preserve any existing `.env.local` before replacing it. The example contains
development-only credentials and does not require Google OAuth. The launcher
explicitly loads `.env.local`, starts PostgreSQL 17 and SeaweedFS 4.28, waits for
Compose health and authenticated S3 readiness, applies migrations, configures
private storage/CORS/lifecycle, and runs Next at http://localhost:3000 in the
foreground. Ctrl+C stops Next. Infrastructure and its volumes remain available;
`npm run dev:local:down` stops containers without removing stored data.

Open **Iniciar sesión → Entrar en modo local**. Better Auth creates or reuses
**PostOnce Local Dev**, persists a real session and signs its HTTP-only cookie.
Refresh, `/account`, and returning to `/drafts` preserve the session. The local
endpoint requires development mode, the explicit local-login flag, and matching
loopback Host/Origin. It is unavailable in production.

`npm run storage:setup` and `npm run db:migrate` also load `.env.local` explicitly.
Exported environment values take precedence. The exact S3 credential variables
are `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`; the local example matches
`scripts/seaweedfs-dev.json`. SeaweedFS uses authenticated S3 access and path-style
URLs. Its development configuration skips the AWS-specific public-access-block
API. Production credentials, HTTPS requirements and secure session cookies are
unchanged.

## Verification on Windows, 2026-09-16

- `npm run check`: passed, including 117 tests and production build.
- `npm run test:postgres`: passed against an isolated PostgreSQL 17 database.
- `npm run test:browser`: 12 passed with SeaweedFS 4.28, including the complete
  local-login flow on desktop, iPad and iPhone without Google credentials.
- `npm run smoke`: passed against local Next with readiness 200 and anonymous
  connections status 401; also passed against the production build with readiness
  503 and connections 503 for deliberately invalid production configuration.
  Production `/api/dev/login` returned 404.
- Chrome manual verification: login POST 303, drafts GET 200, refresh authenticated,
  account 200, and return to drafts 200.
- Next child lifecycle verification: stays running, handles the launcher's IPC
  shutdown signal, exits 0 and releases port 3000 on Windows.
- Launcher regression tests cover environment loading, health/migration/storage
  ordering, foreground lifetime, shutdown dispatch and failure propagation.

**Outstanding gate:** this verification environment has no Docker executable or
Docker Desktop. Copying the example and invoking `npm run dev:local` therefore
stops at the Docker prerequisite. The integration and manual checks above used
native PostgreSQL 17 and SeaweedFS 4.28 processes; they do not establish that the
Compose startup gate passed. Local Development Experience must not be marked
fully green until the exact Docker-backed command is verified.
