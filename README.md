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

El proyecto se encuentra en fase de discovery y diseño. La especificación funcional se mantiene en `specs/` y debe aprobarse antes de definir arquitectura, seleccionar el stack tecnológico o comenzar la implementación.

## Spec-Driven Development

PostOnce es también un proyecto de aprendizaje de **Spec-Driven Development**. El objetivo es practicar un proceso en el que primero se define, revisa y valida el comportamiento esperado mediante especificaciones; después se diseña la arquitectura y se evalúan tecnologías; y únicamente entonces se implementa y verifica el producto contra sus requisitos y criterios de aceptación.

## Documentación

- `specs/constitution.md` — principios y reglas del proyecto
- `specs/README.md` — índice y flujo de trabajo de las especificaciones
- `specs/product.md` — propósito, alcance y límites de la V1
- `specs/features/` — especificaciones funcionales por feature
- `specs/research/platform-capabilities.md` — capacidades y restricciones investigadas de las plataformas

## Alcance actual

La V1 está orientada a una audiencia amplia. Esto no implica todavía una decisión sobre si PostOnce será una aplicación alojada centralmente, un proyecto open source desplegable por cada usuario o un modelo híbrido. Esa decisión se resolverá durante el diseño de arquitectura.

No forman parte de la V1 analytics, scheduling, generación de captions o hashtags mediante IA, edición completa de video, calendario editorial ni gestión de equipos, roles u organizaciones.

## Reglas de colaboración

- No publicar secretos, tokens, credenciales ni archivos sensibles.
- No modificar el historial publicado ni hacer force push.
- Mantener los cambios pequeños y verificables por fases.
- Consultar la documentación oficial y actual para capacidades de APIs externas.
- No implementar capacidades que la integración real no pueda ejecutar.
