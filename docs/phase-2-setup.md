# Phase 2 — configuración y límites verificables

## Google Sign-In real

1. Crear/seleccionar un proyecto en Google Cloud, configurar la pantalla de consentimiento.
2. Crear un OAuth client de tipo **Web application** para el login de PostOnce.
3. Registrar exactamente `http://localhost:3000/api/auth/callback/google` en desarrollo
   y `https://TU-DOMINIO/api/auth/callback/google` en producción.
4. Configurar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL` (solo origen)
   y `BETTER_AUTH_SECRET` (aleatorio, mínimo 32 caracteres) fuera de Git.
5. En modo Testing de Google, registrar los usuarios de prueba y respetar sus restricciones.
6. Configurar PostgreSQL, ejecutar `npm run db:migrate`, iniciar la app y visitar `/login`.
7. Verificar manualmente login, cierre de sesión, segunda sesión/dispositivo y rechazo
   de callback no registrado. Esta prueba externa no se sustituye por fixtures.

El login pide exclusivamente `openid email profile`, `access_type=online`, sin
`include_granted_scopes=true`. No solicita scopes de YouTube ni crea una conexión de canal.
Se recomienda un client OAuth separado para futuras conexiones YouTube. No reutilizar
tokens, estado o consentimiento del login. Los tokens de login se descartan al persistir
la cuenta; Better Auth solo conserva identidad y sesiones. No email/password ni linking.

## Secretos y cifrado

`TOKEN_ENCRYPTION_KEYS` contiene un objeto JSON de versión a clave base64 de 32 bytes:
`{"k1":"<base64 de 32 bytes aleatorios>"}`. `TOKEN_ACTIVE_KEY_VERSION=k1`.
Generar con un gestor de secretos o `node:crypto.randomBytes(32)`; no copiar claves de tests.
Guardar en el secret manager del hosting, nunca en DB, logs, capturas ni Git.

Los tokens de plataformas usan AES-256-GCM con nonce aleatorio de 12 bytes y tag de 16.
AAD liga usuario, plataforma e identidad remota. El envelope incluye formato y versión
de clave, no la clave. Rotación: añadir k2 conservando k1, hacer k2 activa; al escribir
se usa k2. Para retirar k1 hay que re-cifrar/verificar todos sus envelopes y contemplar
backups. No hay job automático de rotación en esta fase. Perder una clave impide recuperar
tokens. Un proceso/secret manager comprometido sigue pudiendo descifrarlos.

Sesiones: 7 días, renovación a partir de 1 día, persistidas en PostgreSQL y cookie firmada
HttpOnly, SameSite=Lax, Secure en HTTPS, sin cookie-cache de sesión. Logout revoca la
sesión del dispositivo actual, no las demás. Cookies con clave y firma son responsabilidad
de Better Auth; los tokens de sesión no son tokens de plataformas.

## Conexiones y prepared content

- `/account` y `/api/connections` consultan únicamente el usuario de la sesión; no toman userId del cliente.
- DELETE requiere sesión, Origin exacto y ownership; desconecta localmente y elimina el
  envelope, conservando historia. Revocación remota depende del adapter real futuro;
  el usuario puede revocar permisos también en el proveedor.
- `ConnectionService.acceptGrant` es un contrato interno para grants ya verificados;
  no existe endpoint público para inyectar tokens/remote IDs. No usar con datos del navegador.
- `ConnectionAdapter` define authorize/exchange/revoke, sin implementaciones ficticias.
  Instagram, TikTok y YouTube muestran la disponibilidad real: OAuth aún no integrado.
- El índice parcial de PostgreSQL garantiza un slot activo por usuario/plataforma.
  `active` identifica el slot vigente, incluso desconectado; `status` determina disponibilidad.
  Sustituir identidad desactiva el registro anterior y descarta sus tokens, no su historial.
- Reconexión incrementa revisión e invalida bindings. Cambio de ID no retargetea el draft;
  requiere confirmación contra ID/revisión vigente. La confirmación NO limpia revalidación.
  Una futura validación de plataforma/preflight debe revisar estado, expiración y revisión.
- `draft_connection_bindings` solo implementa identidad/consentimiento, no editor ni media.
  FK compuestas protegen ownership de draft y conexión. No se implementa publicación.

## Seguridad HTTP y tests

Se expone solo sign-in Google redirect, callback Google, get-session y sign-out de Better
Auth. No endpoint de recuperar access tokens, linking o passwords. POST exige Origin
exacto también sin cookies. Better Auth valida estado, cookie, redirect y OAuth; no se
deshabilitan CSRF/origin checks. El wrapper rechaza scopes/idTokens/proveedores inyectados.
Errores de recursos/autenticación se redactan, no se registran requests, tokens ni perfiles.
Logger de Better Auth desactivado para evitar mensajes upstream con información sensible.
La observabilidad sanitizada más completa corresponde a hardening.

Tests usan Better Auth real + PostgreSQL embebido con fixtures SOLO en tests, incluyendo
cookies firmadas, sesiones persistentes/expiradas, logout, callback con state inválido,
scopes, CSRF, ownership, cardinalidad, cifrado, manipulación y cambio de identidad.
CI conserva todos los checks Phase 1 y prueba constraints contra PostgreSQL 17 real.
No se afirma haber completado consentimiento/callback contra Google sin credenciales.

`npm run smoke` también verifica `/login`, la redirección anónima de `/account` y
que `/api/connections` no entregue datos privados. Por defecto espera 503 sin
configuración; con identidad configurada usar `EXPECT_CONNECTIONS_STATUS=401`.

Auditoría de recuperación: cuatro alertas moderadas de la cadena Drizzle Kit →
esbuild-kit → esbuild (GHSA-67mh-4wv8-2f99), sin altas ni críticas. También aparecen
con `npm audit --omit=dev`, porque Better Auth declara Drizzle Kit como peer opcional.
La ruta afectada es el servidor de desarrollo de esbuild, que la aplicación no usa;
no exponer Drizzle Studio/esbuild serve. npm propone un downgrade incompatible a
Drizzle Kit 0.18.1; se conserva la versión fijada y el seguimiento upstream de Phase 1.

## Migraciones

- `0001_tense_bromley.sql`: esquema estándar Better Auth, enlace único a dominio,
  conexiones versionadas, índice parcial y bindings de identidad.
- `0002_smart_tempest.sql`: FK compuesta para ownership del draft. El SQL generado
  necesitó reordenarse para crear la unicidad referenciada antes de la FK; tests detectaron
  el error. No se modificó la migración de Phase 1.

## Verificación de recuperación — 2026-09-15

Se conservó la implementación de la sesión interrumpida. Pasaron lint, typecheck,
48 tests en 9 archivos, build de producción, `db:check` y `db:generate` sin cambios.
PostgreSQL 17.10 real y desechable verificó aplicación repetida de migraciones,
FK, guardas de borrado, cardinalidad, ownership compuesto de bindings y rollback.
Los smoke tests de producción pasaron sin configuración y con configuración de
identidad de prueba (sin consentimiento Google): página, login, health, redirect
anónimo y respuestas privadas 503/401 sin datos. Se revisaron secretos y archivos
no trackeados; se eliminó `specs/New Text Document.txt`, copia accidental de la
constitución. No se descartó trabajo existente ni se inició Phase 3.

## Dependencias externas pendientes

Para integrar cada plataforma se necesitan client/app registrado, redirect URI, scopes,
elegibilidad y eventuales auditorías. TikTok requiere primero el spike aprobado; no se
decidió Direct Post. No se implementaron flujos concretos ni se inventaron credenciales.
Antes de ese trabajo se debe consultar documentación oficial actual de cada proveedor.

No continuar a Phase 3 sin aprobación. La retención de media/quotas siguen sin decidirse.
