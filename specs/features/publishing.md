# Feature: Publishing

> Estado: draft para revisión.

## Goal

Permitir que el usuario inicie una publicación multiplataforma mediante una sola acción, siempre que todas las plataformas seleccionadas sean válidas, y mostrar de forma independiente el progreso y resultado de cada plataforma.

## Terminology

- **Preflight validation:** validación final de todas las plataformas antes de iniciar cualquier publicación.
- **Ready:** la plataforma cumple todos los requisitos conocidos para comenzar.
- **Uploading:** el archivo se está transfiriendo hacia la plataforma o infraestructura necesaria.
- **Processing:** la plataforma recibió el contenido y está procesándolo o finalizando su publicación.
- **Published:** la plataforma confirmó éxito.
- **Failed:** la publicación no pudo completarse.
- **Unknown outcome:** no existe confirmación suficiente para afirmar éxito o fallo sin reconciliar estado.

## Requirements

### REQ-PUB-001 — Validación global

La aplicación debe validar todas las plataformas seleccionadas antes de iniciar cualquier publicación.

### REQ-PUB-002 — Bloqueo global por errores previos

Si alguna plataforma seleccionada no está lista, ninguna publicación debe comenzar.

### REQ-PUB-003 — Una sola acción de publicación

Cuando todas las plataformas estén listas, el usuario debe poder iniciar la publicación de todas las plataformas seleccionadas mediante una sola acción.

### REQ-PUB-004 — Consentimientos requeridos

Antes de iniciar la publicación, la aplicación debe obtener cualquier confirmación o consentimiento que una plataforma requiera para la acción.

### REQ-PUB-005 — Estado independiente

Cada plataforma seleccionada debe mantener su propio estado de publicación.

### REQ-PUB-006 — Progreso visible

La aplicación debe mostrar progreso cuantitativo cuando sea medible y, cuando no lo sea, al menos el estado actual de la plataforma.

### REQ-PUB-007 — Fallo parcial

El fallo de una plataforma no debe cancelar, reiniciar ni modificar una publicación que ya está en proceso o completada en otra plataforma.

### REQ-PUB-008 — Retry individual

La aplicación debe permitir reintentar únicamente una plataforma cuya publicación haya fallado.

### REQ-PUB-009 — No duplicar éxitos

Reintentar una plataforma fallida no debe volver a publicar contenido en plataformas que ya confirmaron éxito.

### REQ-PUB-010 — Error comprensible

Cuando una publicación falle, la aplicación debe mostrar un estado y un mensaje suficientemente útil para que el usuario entienda qué ocurrió o qué acción puede intentar.

### REQ-PUB-011 — Resumen final

La aplicación debe mostrar el resultado final de cada plataforma seleccionada.

## Approved reliability rules (2026-09-15)

- Los estados y batches se persisten y sobreviven al cierre de la aplicación.
- `UnknownOutcome` no es éxito ni fallo; nunca admite retry automático.
- Solo se reconcilia mediante mecanismos reales disponibles; sin certeza se bloquean
  acciones que puedan duplicar la publicación.
- Publicación confirmada + fallo secundario = `PublishedWithWarning`, no `Failed`.
  Si la operación secundaria es repetible independientemente, solo se reintenta esa.
- El diagrama siguiente describe únicamente el camino principal con resultado conocido.
  La pérdida de confirmación desde Uploading/Processing conduce a UnknownOutcome.

### Acceptance additions

- GIVEN un resultado remoto incierto, WHEN se solicita retry, THEN no se publica de
  nuevo y no se convierte a éxito/fallo sin evidencia real de reconciliación.
- GIVEN video publicado y thumbnail fallida, THEN PublishedWithWarning; WHEN la
  thumbnail admite retry independiente, THEN solo se repite la thumbnail.
- GIVEN estados persistidos, WHEN se reabre la aplicación, THEN se recuperan sin
  iniciar otra publicación.

## State Model

```text
Ready
  ↓
Uploading
  ↓
Processing
  ↓
Published

Uploading / Processing
  ↓
Failed
  ↓
Retry
```

Una integración puede omitir estados intermedios que no pueda observar de forma fiable.

La UI no debe inventar porcentajes de procesamiento remoto cuando la plataforma no los proporciona.

## Acceptance Criteria

### REQ-PUB-001 / REQ-PUB-002 — Validación global

#### Scenario: Todas las plataformas válidas

**GIVEN**  
el usuario seleccionó Instagram y YouTube

**AND**  
ambas plataformas se encuentran en estado `Ready`

**WHEN**  
el usuario inicia la acción de publicar

**THEN**  
la aplicación puede continuar al inicio de publicación

#### Scenario: Una plataforma tiene un error

**GIVEN**  
Instagram y TikTok están listos

**AND**  
YouTube tiene un campo obligatorio inválido o faltante

**WHEN**  
el usuario intenta publicar

**THEN**  
ninguna plataforma inicia la publicación

**AND**  
YouTube muestra el motivo por el que no está listo

**AND**  
Instagram y TikTok permanecen sin publicar

### REQ-PUB-003 — Una sola acción de publicación

#### Scenario: Iniciar publicación multiplataforma

**GIVEN**  
todas las plataformas seleccionadas están listas

**AND**  
se cumplieron los consentimientos necesarios

**WHEN**  
el usuario confirma `Publicar`

**THEN**  
la aplicación inicia el proceso de publicación para todas las plataformas seleccionadas

**AND**  
el usuario no necesita iniciar manualmente cada una por separado

### REQ-PUB-005 — Estado independiente

#### Scenario: Estados diferentes

**GIVEN**  
Instagram y YouTube iniciaron publicación

**WHEN**  
YouTube termina correctamente mientras Instagram continúa procesando

**THEN**  
YouTube muestra `Published`

**AND**  
Instagram mantiene su propio estado actual

### REQ-PUB-006 — Progreso visible

#### Scenario: Upload con progreso medible

**GIVEN**  
una plataforma permite medir los bytes transferidos

**WHEN**  
el archivo se está subiendo

**THEN**  
la aplicación muestra el progreso de transferencia disponible

#### Scenario: Procesamiento remoto sin porcentaje

**GIVEN**  
la plataforma recibió el archivo

**AND**  
solo expone un estado de procesamiento sin porcentaje

**WHEN**  
la aplicación consulta su estado

**THEN**  
muestra `Processing` u otro estado normalizado equivalente

**AND**  
no inventa un porcentaje de procesamiento

### REQ-PUB-007 — Fallo parcial

#### Scenario: Instagram falla y YouTube tiene éxito

**GIVEN**  
Instagram y YouTube iniciaron publicación

**WHEN**  
YouTube confirma publicación

**AND**  
Instagram falla

**THEN**  
YouTube permanece en `Published`

**AND**  
Instagram cambia a `Failed`

**AND**  
el fallo de Instagram no reinicia ni modifica YouTube

### REQ-PUB-008 / REQ-PUB-009 — Retry individual

#### Scenario: Reintentar únicamente Instagram

**GIVEN**  
YouTube está en `Published`

**AND**  
Instagram está en `Failed`

**WHEN**  
el usuario pulsa `Retry` en Instagram

**THEN**  
la aplicación vuelve a intentar únicamente Instagram

**AND**  
YouTube permanece en `Published`

**AND**  
YouTube no vuelve a subir ni publicar el video

#### Scenario: Retry exitoso

**GIVEN**  
Instagram está en `Failed`

**WHEN**  
el usuario reintenta Instagram

**AND**  
el nuevo intento termina correctamente

**THEN**  
Instagram cambia a `Published`

### REQ-PUB-010 — Error comprensible

#### Scenario: Error conocido

**GIVEN**  
una plataforma devuelve un error identificable

**WHEN**  
la publicación falla

**THEN**  
la aplicación muestra un mensaje comprensible asociado a esa plataforma

**AND**  
ofrece una acción de retry cuando tenga sentido

### REQ-PUB-011 — Resumen final

#### Scenario: Resultado mixto

**GIVEN**  
la publicación terminó en todas las plataformas seleccionadas

**WHEN**  
algunas tuvieron éxito y otras fallaron

**THEN**  
la aplicación muestra el resultado individual de cada plataforma

**AND**  
las plataformas fallidas mantienen su acción de retry

## Edge Cases

- La conexión a internet se interrumpe durante una subida.
- La aplicación pierde conexión después de que la plataforma recibió el contenido pero antes de recibir confirmación.
- La autorización de una plataforma expira entre la validación y el inicio real de publicación.
- Una plataforma acepta el upload pero falla durante procesamiento.
- Una plataforma tarda mucho más que las demás en confirmar publicación.
- El usuario cierra la aplicación mientras existen publicaciones en progreso.
- El resultado remoto es desconocido y un retry podría crear un duplicado.

## Open Questions

- ¿La V1 permitirá cancelar una publicación que ya comenzó?
- Resuelto: los estados sobreviven al cierre y reapertura de la aplicación.
- ¿Cuánto tiempo esperará la aplicación antes de considerar que una plataforma está tardando demasiado?
- ¿Qué UX tendrá el estado `Unknown outcome` para evitar duplicados?
- ¿Se añadirá un botón `Retry all failed` o únicamente retry individual en V1?
