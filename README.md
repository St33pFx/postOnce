# PostOnce

PostOnce es una aplicación web responsive para preparar y publicar un mismo video corto en múltiples plataformas desde un solo lugar.

La V1 contempla:

- Instagram Reels
- TikTok
- YouTube Shorts
- Conexión de cuentas mediante los mecanismos oficiales de cada plataforma
- Caption general y configuraciones específicas por plataforma
- Portadas generales y específicas
- Selección de frames y un editor básico de portada
- Validación previa antes de publicar
- Estados independientes por plataforma
- Retry individual para destinos fallidos
- Autosave y recuperación de drafts desde distintos dispositivos

## Estado del proyecto

La arquitectura y el stack de V1 están aprobados. El desarrollo se ejecuta por fases según `specs/implementation-plan.md`; la especificación funcional se mantiene en `specs/`.

## Spec-Driven Development

PostOnce es también un proyecto de aprendizaje de **Spec-Driven Development**. El objetivo es practicar un proceso en el que primero se define, revisa y valida el comportamiento esperado mediante especificaciones; después se diseña la arquitectura y se evalúan tecnologías; y únicamente entonces se implementa y verifica el producto contra sus requisitos y criterios de aceptación.

## Documentación

- `specs/constitution.md` — principios y reglas del proyecto
- `specs/README.md` — índice y flujo de trabajo de las especificaciones
- `specs/product.md` — propósito, alcance y límites de la V1
- `specs/features/` — especificaciones funcionales por feature
- `specs/research/platform-capabilities.md` — capacidades y restricciones investigadas de las plataformas
- `specs/architecture.md` — arquitectura aprobada y decisiones de jobs/auth
- `specs/implementation-plan.md` — fases y verificaciones
- `docs/development.md` — instalación, migraciones y checks
- `docs/phase-2-setup.md` — Google Sign-In, secretos, conexiones y configuración externa

## Alcance actual

V1 es una aplicación centralmente alojada y accesible públicamente. El código es open source; self-hosting queda para una etapa posterior.

No forman parte de la V1 analytics, scheduling, generación de captions o hashtags mediante IA, edición completa de video, calendario editorial ni gestión de equipos, roles u organizaciones.

## Reglas de colaboración

- No publicar secretos, tokens, credenciales ni archivos sensibles.
- No modificar el historial publicado ni hacer force push.
- Mantener los cambios pequeños y verificables por fases.
- Consultar la documentación oficial y actual para capacidades de APIs externas.
- No implementar capacidades que la integración real no pueda ejecutar.
## Desarrollo local

En Windows PowerShell:

```powershell
npm install
copy .env.local.example .env.local
npm run dev:local
```

El comando comprueba Docker Desktop, levanta PostgreSQL 17 y SeaweedFS 4.28,
aplica migraciones y arranca Next.js. Abre `http://localhost:3000`, entra en
`/login` y pulsa **Entrar en modo local** (marcado **Solo desarrollo**). La
sesión usa las tablas y cookie reales de Better Auth y redirige a `/drafts`.
Este flujo sólo existe con `NODE_ENV=development`, `POSTONCE_DEV_LOGIN=1` y
host loopback. Para detener los servicios: `npm run dev:local:down`.
