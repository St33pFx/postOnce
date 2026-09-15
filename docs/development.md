# Desarrollo — Phase 1

Requisitos: Node.js 24 y npm. Versiones exactas en package-lock.json; usar `npm ci`.
En PowerShell con scripts restringidos, usar `npm.cmd` en lugar de `npm`.

```sh
npm ci
npm run check
npm run dev
```

La página inicial es informativa: no ofrece login, upload ni publicación.
Sin base de datos la página y `/api/health/live` funcionan; `/api/health/ready`
responde 503. Liveness no demuestra disponibilidad de PostgreSQL.

## PostgreSQL local

```sh
docker compose up -d
# Copiar .env.example a .env (PowerShell: Copy-Item .env.example .env)
npm run db:migrate
npm run dev
```

Compose solo es infraestructura de desarrollo, no un modelo de distribución self-hosted.
El puerto está limitado a loopback y el volumen conserva los datos. No borrar el
volumen salvo que se desee perderlos. Nunca utilizar las credenciales de ejemplo en producción.
`DATABASE_URL` solo acepta protocolo PostgreSQL, host y nombre de DB, sin query string.
Controlar TLS con `DATABASE_SSL=verify-full`; producción no permite desactivarlo.
Para certificados privados, configurar una CA confiable a nivel Node/hosting; no
desactivar la verificación. Ninguna variable secreta debe usar prefijo NEXT_PUBLIC_.

## Migraciones y tests

- `npm run db:generate`: genera SQL/snapshot/journal desde el esquema; revisar y commitear juntos.
- `npm run db:check`: consistencia del journal de migraciones.
- `npm run db:migrate`: aplica migraciones, carga `.env`, cierra conexiones; nunca hace schema push.
- `npm test`: 25 pruebas de configuración, health, políticas y SQL con PGlite.
- `npm run test:postgres`: requiere `TEST_DATABASE_URL` apuntando a una DB desechable.
  Aplica migraciones dos veces y comprueba persistencia, FK, eliminación protegida y rollback.
  No ejecutarlo contra producción: agrega el esquema de la app aunque los fixtures se revierten.
- `npm run check`: lint, tipos, tests, journal y build optimizado.
- `npm start` y, en otra terminal, `npm run smoke`: página y health por HTTP.
  Por defecto espera readiness 503 sin configuración. Con DB migrada, usar
  `EXPECT_READY_STATUS=200` en el entorno. `SMOKE_URL` permite cambiar host/puerto.

CI ejecuta checks y una integración con PostgreSQL 17 real. PGlite ejecuta PostgreSQL
embebido pero no valida TCP/TLS ni comportamiento de un servidor multi-proceso.
No hay endpoints CRUD: la FK de ownership no sustituye autorización por usuario.
`updated_at` se inicializa al insertar; la futura escritura de drafts deberá actualizarlo.
No se ha decidido eliminación de usuario: la FK falla cerrada y no borra drafts en cascada.

## Decisiones de herramientas / riesgos

- ESLint 10 + TypeScript ESLint y plugin oficial de Next: evita ESLint 9 fuera de
  soporte y plugins heredados de eslint-config-next que no declaran soporte para 10.
  Las reglas React hooks/accesibilidad se ampliarán con la UI interactiva; esta fase no usa hooks.
- Auditoría de instalación: cuatro alertas moderadas en la cadena de desarrollo
  drizzle-kit → esbuild-kit → esbuild (GHSA-67mh-4wv8-2f99). Afectan al servidor de
  desarrollo de esbuild, que aquí no se inicia. No son cuatro fallos independientes.
  No se aplicó `audit fix --force` ni un downgrade incompatible de Drizzle. No exponer
  Drizzle Studio/esbuild serve; reevaluar actualización upstream antes de ampliar tooling.
- Better Auth y pg-boss están seleccionados pero todavía no instalados: no hay passwords,
  cola propia ni retries remotos. Revalidar sus APIs/advisories antes de integrarlos.
- No hay licencia de distribución seleccionada todavía; publicar código en GitHub no
  sustituye otorgar una licencia open source. Resolver con el propietario antes del lanzamiento.

## Límite de la fase

No se verifican OAuth real, FFmpeg/Sharp, S3, aislamiento de usuarios mediante sesiones,
reconciliación remota ni recuperación de workers: no están implementados.
No es una V1 desplegable al público con funcionalidades de publicación.
