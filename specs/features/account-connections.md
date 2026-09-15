# Feature: Account Connections

> Estado: draft para revisión.

## Goal

Permitir al usuario autorizar las cuentas necesarias para publicar contenido en las plataformas soportadas sin compartir sus contraseñas con la aplicación.

## V1 Platforms

- Instagram Reels
- TikTok
- YouTube Shorts

## V1 Constraints

Decisiones aprobadas para Phase 2:
- PostOnce es multiusuario; cada usuario tiene como máximo una cuenta activa por plataforma.
- El login de PostOnce es Google Sign-In mediante Better Auth, solo identidad; no solicita scopes de YouTube.
- Las cuentas OAuth de plataformas son independientes del proveedor de login.
- Una reconexión con otro remote account ID conserva la identidad/historial anterior;
  los destinos preparados requieren confirmación explícita y revalidación antes de utilizarla.

- La aplicación utilizará los mecanismos oficiales de autorización de cada plataforma.
- La aplicación no solicitará la contraseña de Instagram, TikTok o YouTube.
- Una plataforma no podrá utilizarse para publicar mientras su autorización no sea válida.
- Las restricciones de tipo de cuenta o auditoría impuestas por una plataforma deben mostrarse al usuario y no ocultarse.

## Requirements

### REQ-AC-001 — Estado de conexión

La aplicación debe mostrar si cada plataforma de V1 se encuentra conectada, desconectada o requiere reconexión.

### REQ-AC-002 — Conectar plataforma

La aplicación debe permitir iniciar el flujo oficial de autorización de una plataforma.

### REQ-AC-003 — Permisos suficientes

La aplicación debe solicitar únicamente los permisos necesarios para ejecutar las capacidades de V1 y debe detectar cuando faltan permisos necesarios para publicar.

### REQ-AC-004 — Autorización inválida

La aplicación debe detectar una autorización expirada, revocada o insuficiente antes de intentar publicar.

### REQ-AC-005 — Reconectar plataforma

La aplicación debe permitir volver a autorizar una plataforma cuya conexión ya no sea válida.

### REQ-AC-006 — Desconectar plataforma

La aplicación debe permitir al usuario desconectar una cuenta vinculada.

### REQ-AC-007 — Elegibilidad de cuenta

La aplicación debe impedir que una cuenta no compatible con la API de publicación sea presentada como lista para publicar.

## Platform Rules

### Instagram

- La integración de publicación oficial está destinada a cuentas profesionales compatibles.
- Una cuenta no elegible debe mostrarse como no disponible para publicación hasta que cumpla los requisitos de la plataforma.

### TikTok

- TikTok es obligatorio; el mecanismo real se decide en un technical spike, no necesariamente Direct Post.
- Si se elige Direct Post, la cuenta debe autorizar su scope requerido. Otra integración real debe verificar sus mecanismos oficiales y permisos, sin simular conexión o éxito.
- Las capacidades disponibles pueden depender de la cuenta y deben consultarse mediante la información actual del creador antes de publicar.

### YouTube

- La cuenta debe autorizar un scope que permita subir videos.
- Las restricciones de proyectos API no verificados deben tratarse como una restricción externa y no como un error del usuario.

## Acceptance Criteria

### REQ-AC-001 — Estado de conexión

#### Scenario: Plataforma desconectada

**GIVEN**  
el usuario todavía no ha autorizado una plataforma

**WHEN**  
abre la sección de conexiones

**THEN**  
la plataforma aparece como desconectada

**AND**  
se ofrece una acción para conectarla

#### Scenario: Plataforma conectada

**GIVEN**  
el usuario autorizó correctamente una plataforma

**AND**  
la autorización continúa siendo válida

**WHEN**  
abre la sección de conexiones

**THEN**  
la plataforma aparece como conectada

### REQ-AC-002 — Conectar plataforma

#### Scenario: Autorizar correctamente

**GIVEN**  
una plataforma está desconectada

**WHEN**  
el usuario inicia y completa correctamente su flujo oficial de autorización

**THEN**  
la aplicación registra la plataforma como conectada

**AND**  
puede utilizarse en `Create Post` si la cuenta también es elegible

### REQ-AC-003 — Permisos suficientes

#### Scenario: Faltan permisos

**GIVEN**  
la plataforma está autorizada

**AND**  
la autorización no incluye permisos necesarios para publicar

**WHEN**  
la aplicación verifica la conexión

**THEN**  
la plataforma no se considera lista para publicar

**AND**  
la aplicación indica que se requiere una nueva autorización

### REQ-AC-004 — Autorización inválida

#### Scenario: Token revocado o expirado

**GIVEN**  
una plataforma estaba conectada

**WHEN**  
la aplicación detecta que su autorización dejó de ser válida

**THEN**  
la plataforma cambia al estado `Requiere reconexión`

**AND**  
no se intenta publicar con esa autorización

### REQ-AC-005 — Reconectar plataforma

#### Scenario: Reconexión correcta

**GIVEN**  
una plataforma requiere reconexión

**WHEN**  
el usuario completa de nuevo el flujo oficial de autorización

**THEN**  
la plataforma vuelve al estado conectado si los permisos son suficientes

### REQ-AC-006 — Desconectar plataforma

#### Scenario: Desconectar una cuenta

**GIVEN**  
una plataforma está conectada

**WHEN**  
el usuario confirma que desea desconectarla

**THEN**  
la aplicación elimina su conexión activa

**AND**  
la plataforma deja de estar disponible como destino de publicación

### REQ-AC-007 — Elegibilidad de cuenta

#### Scenario: Cuenta no compatible

**GIVEN**  
el usuario completa la autorización

**AND**  
la cuenta no cumple los requisitos de publicación de la plataforma

**WHEN**  
la aplicación comprueba su elegibilidad

**THEN**  
la cuenta no aparece como lista para publicar

**AND**  
se muestra el motivo conocido de la incompatibilidad

## Open Questions

- Resuelto: una cuenta activa por plataforma por usuario, garantizada en PostgreSQL.
- ¿Dónde se mostrará la administración de cuentas: pantalla propia, Settings o dentro de Create Post?
- ¿Qué información mínima de la cuenta se mostrará para identificarla: nombre, username, avatar o canal?
- Resuelto en Phase 2: AES-256-GCM con AAD por usuario/plataforma/identidad y claves versionadas fuera de PostgreSQL; ver `../phase-2.md` y `../../docs/phase-2-setup.md`.
