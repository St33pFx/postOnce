# Feature: Platform Configuration

> Aclaración aprobada 2026-09-15: las reglas de TikTok Direct Post son condicionales a elegir ese mecanismo. TikTok sigue siendo obligatorio; el spike verificará las capacidades reales antes de ofrecer controles.

> Estado: draft para revisión.  
> Base factual: `../research/platform-capabilities.md`, verificada el 2026-09-14.

## Goal

Permitir al usuario configurar correctamente cada plataforma seleccionada utilizando únicamente opciones que la integración de esa plataforma pueda ejecutar realmente.

La aplicación reutiliza información general cuando sea compatible, pero muestra y valida por separado los campos y opciones específicas de cada plataforma.

## V1 Platforms

- Instagram Reels
- TikTok
- YouTube Shorts

## Terminology

- **General value:** valor proveniente de `Create Post`.
- **Platform mapping:** forma en que un valor general se traduce a un campo real de una plataforma.
- **Platform override:** valor específico que reemplaza al valor general únicamente para una plataforma.
- **Capability:** opción que la integración puede ejecutar realmente.
- **Platform validation:** comprobación de requisitos y límites aplicables a una plataforma concreta.
- **Unavailable capability:** opción que puede existir en la app oficial de una plataforma pero no está disponible mediante nuestra integración.

## Mapping Rules

### Caption general

```text
Caption general
├── Instagram Reels → caption
├── TikTok          → title (video caption)
└── YouTube Shorts  → description
```

Los hashtags permanecen dentro del texto y no se gestionan como una entidad separada en V1.

### Portada general

La aplicación intenta reutilizar la portada general únicamente cuando la plataforma admite el tipo de portada seleccionado.

- Instagram puede utilizar un frame del Reel o una imagen de cover compatible.
- TikTok Direct Post permite seleccionar un frame del video; el esquema revisado no ofrece una imagen de cover arbitraria.
- YouTube permite una miniatura personalizada; un frame elegido por el usuario puede convertirse en imagen y utilizarse como miniatura.

La aplicación no debe fingir que una portada incompatible se aplicará a una plataforma.

## Platform Capability Matrix

| Capability | Instagram Reels | TikTok | YouTube Shorts |
|---|---|---|---|
| Video publishing | Yes | Yes | Yes |
| General caption mapping | `caption` | `title` (caption) | `description` |
| Separate title | No verified Reel field | No separate video title/caption pair | Yes |
| Separate description | No verified Reel field | No separate video description | Yes |
| Custom image cover | Yes | Not documented for video Direct Post | Yes |
| Frame as cover | Yes | Yes | App-generated thumbnail |
| Privacy selection | No per-post field verified | Required | Required |
| Share to feed | Yes | N/A | N/A |
| Comments toggle | Not in V1 until verified | Yes | Not in V1 |
| Duet toggle | N/A | Yes | N/A |
| Stitch toggle | N/A | Yes | N/A |
| AI disclosure | Not in V1 until verified | Yes | Supported |
| Made for kids | N/A | N/A | Supported |

## Requirements

### REQ-PC-001 — Configuración por plataforma seleccionada

La aplicación debe mostrar una sección de configuración independiente para cada plataforma seleccionada.

### REQ-PC-002 — Solo capacidades ejecutables

La aplicación debe mostrar como configurables únicamente capacidades que la integración pueda ejecutar para esa plataforma.

### REQ-PC-003 — Herencia del caption general

La aplicación debe mapear el caption general al campo compatible de cada plataforma seleccionada según las reglas de esta spec.

### REQ-PC-004 — Override de texto

La aplicación debe permitir un override de texto por plataforma cuando el campo correspondiente sea compatible.

### REQ-PC-005 — Validación específica

La aplicación debe validar los campos obligatorios y límites aplicables de cada plataforma seleccionada antes de declararla lista para publicar.

### REQ-PC-006 — Cuenta conectada y elegible

Una plataforma debe considerarse lista únicamente cuando exista una conexión válida y una cuenta elegible para publicar.

### REQ-PC-007 — Instagram Reels

La configuración de Instagram debe soportar en V1 únicamente las capacidades verificadas que decidamos exponer: caption, portada compatible y `share_to_feed`.

### REQ-PC-008 — TikTok Creator Info

La aplicación debe consultar la información actual del creador necesaria para configurar Direct Post antes de validar una publicación de TikTok.

### REQ-PC-009 — TikTok privacy

La aplicación debe requerir que el usuario seleccione manualmente una opción de privacidad permitida por su cuenta de TikTok.

### REQ-PC-010 — TikTok interactions

La aplicación debe mostrar las opciones de comentarios, Duet y Stitch de acuerdo con la disponibilidad devuelta para la cuenta y sin asumir que están habilitadas.

### REQ-PC-011 — TikTok cover

La aplicación debe permitir seleccionar un frame compatible del video como cover de TikTok.

### REQ-PC-012 — YouTube metadata

La configuración de YouTube debe permitir establecer título, descripción y privacidad.

### REQ-PC-013 — YouTube title constraints

La aplicación debe validar que el título de YouTube no exceda el límite admitido por la plataforma.

### REQ-PC-014 — YouTube thumbnail

La aplicación debe permitir usar una miniatura compatible de YouTube, ya sea cargada por el usuario o generada a partir de un frame del video.

### REQ-PC-015 — YouTube Shorts eligibility

Cuando el usuario selecciona YouTube Shorts, la aplicación debe comprobar que el video cumple los criterios conocidos necesarios para ser tratado como Short.

## Platform Rules

### Instagram Reels

#### V1 exposed options

- Caption heredado o específico.
- Portada compatible.
- `share_to_feed`.

#### Not exposed until verified

- Upload at highest quality.
- Translate Reel.
- Share to Threads.
- Share to Facebook.
- Trial Reel.
- Tag people / collaborators.
- Cualquier otra opción visible en la app oficial que no tenga soporte verificado para nuestra integración.

#### Eligibility

La cuenta debe ser compatible con el flujo oficial de publicación de Instagram utilizado por la aplicación.

### TikTok

#### V1 exposed options

- Caption heredado o específico.
- Privacy.
- Allow comments.
- Allow Duet.
- Allow Stitch.
- Video cover frame.
- AI-generated disclosure cuando corresponda.

#### Privacy

- No debe existir un valor seleccionado automáticamente.
- Las opciones deben provenir de la información actual del creador.

#### Interaction controls

La UI puede expresarlos de forma positiva (`Allow comments`, etc.) aunque la API utilice flags `disable_*`.

La aplicación debe transformar correctamente el valor sin cambiar el significado elegido por el usuario.

### YouTube Shorts

#### V1 exposed options

- Title.
- Description heredada del caption general o editada específicamente.
- Privacy.
- Thumbnail.
- Made for kids, si decidimos exponerlo en V1.
- Synthetic-media disclosure, si corresponde.

#### Title

- Campo específico de YouTube.
- Máximo 100 caracteres.
- No debe confundirse con el caption general.

#### Description

El caption general se utiliza como valor inicial de la description, salvo que exista un override de YouTube.

#### Privacy

Debe permitir:

- Public.
- Private.
- Unlisted.

#### Shorts eligibility

Para la V1, la validación debe contemplar las reglas actuales de clasificación de Shorts: video cuadrado o vertical y duración máxima de 3 minutos.

## Acceptance Criteria

### REQ-PC-001 — Configuración por plataforma seleccionada

#### Scenario: Mostrar secciones independientes

**GIVEN**  
el usuario seleccionó Instagram, TikTok y YouTube

**WHEN**  
abre la configuración de plataformas

**THEN**  
la aplicación muestra una sección independiente para cada plataforma

**AND**  
los cambios en una sección no modifican las otras salvo valores generales compartidos explícitamente

### REQ-PC-002 — Solo capacidades ejecutables

#### Scenario: Opción no soportada

**GIVEN**  
una opción existe en la aplicación oficial de una plataforma

**AND**  
nuestra integración no puede ejecutarla

**WHEN**  
el usuario configura esa plataforma

**THEN**  
la aplicación no presenta esa opción como utilizable

### REQ-PC-003 — Herencia del caption general

#### Scenario: Mapear caption general

**GIVEN**  
el usuario escribió un caption general

**AND**  
seleccionó Instagram, TikTok y YouTube

**WHEN**  
se generan las configuraciones iniciales de plataforma

**THEN**  
Instagram utiliza el valor como `caption`

**AND**  
TikTok utiliza el valor como caption de video en su campo `title`

**AND**  
YouTube utiliza el valor como `description`

### REQ-PC-004 — Override de texto

#### Scenario: Override de una plataforma

**GIVEN**  
varias plataformas utilizan el caption general

**WHEN**  
el usuario crea un override de texto para una plataforma

**THEN**  
el nuevo valor se aplica únicamente a esa plataforma

**AND**  
el caption general y las demás plataformas permanecen sin cambios

### REQ-PC-005 — Validación específica

#### Scenario: Una plataforma no es válida

**GIVEN**  
Instagram y TikTok cumplen sus requisitos

**AND**  
YouTube tiene un error de configuración

**WHEN**  
la aplicación ejecuta la validación previa

**THEN**  
YouTube se marca como no listo

**AND**  
se identifica el campo o requisito que debe corregirse

### REQ-PC-006 — Cuenta conectada y elegible

#### Scenario: Plataforma no conectada

**GIVEN**  
el usuario seleccionó una plataforma

**AND**  
no existe una autorización válida

**WHEN**  
la aplicación valida su configuración

**THEN**  
la plataforma se marca como no lista

**AND**  
se indica que debe conectarse o reconectarse

### REQ-PC-007 — Instagram Reels

#### Scenario: Configuración V1 de Instagram

**GIVEN**  
Instagram está conectado y seleccionado

**WHEN**  
el usuario abre su configuración

**THEN**  
la aplicación muestra únicamente las opciones de Instagram soportadas por V1 y verificadas para la integración

### REQ-PC-008 — TikTok Creator Info

#### Scenario: Actualizar capacidades de TikTok

**GIVEN**  
TikTok está conectado y seleccionado

**WHEN**  
la aplicación prepara su configuración para publicación

**THEN**  
consulta la información actual necesaria del creador

**AND**  
utiliza esa información para privacidad, interacciones y límites dinámicos

### REQ-PC-009 — TikTok privacy

#### Scenario: Privacidad sin selección

**GIVEN**  
TikTok está seleccionado

**AND**  
el usuario aún no eligió privacidad

**WHEN**  
la aplicación valida TikTok

**THEN**  
TikTok se marca como no listo

**AND**  
se solicita elegir una opción permitida

### REQ-PC-010 — TikTok interactions

#### Scenario: Interacción no disponible

**GIVEN**  
la información del creador indica que Duet no está disponible

**WHEN**  
se muestra la configuración de TikTok

**THEN**  
la opción de Duet no puede activarse

**AND**  
la UI comunica que esa capacidad no está disponible para la cuenta

### REQ-PC-011 — TikTok cover

#### Scenario: Elegir frame de TikTok

**GIVEN**  
TikTok está seleccionado

**AND**  
existe un video válido

**WHEN**  
el usuario elige un frame compatible como cover

**THEN**  
la configuración de TikTok conserva la posición temporal de ese frame para la publicación

### REQ-PC-012 — YouTube metadata

#### Scenario: Configurar YouTube

**GIVEN**  
YouTube está conectado y seleccionado

**WHEN**  
el usuario abre su configuración

**THEN**  
puede establecer title, description y privacy

#### Scenario: Mostrar opciones avanzadas de YouTube

**GIVEN**
YouTube está seleccionado

**WHEN**
el usuario pulsa «Más opciones»

**THEN**
se muestran las declaraciones requeridas

**AND**
al pulsar «Menos opciones» vuelven a ocultarse

### REQ-PC-013 — YouTube title constraints

#### Scenario: Título demasiado largo

**GIVEN**  
YouTube está seleccionado

**WHEN**  
el título supera 100 caracteres

**THEN**  
YouTube se marca como no listo

**AND**  
la aplicación indica el límite que debe corregirse

### REQ-PC-014 — YouTube thumbnail

#### Scenario: Frame como thumbnail

**GIVEN**  
el usuario seleccionó un frame del video para YouTube

**WHEN**  
se prepara la miniatura de YouTube

**THEN**  
la aplicación puede convertir ese frame en una imagen compatible para utilizarla como thumbnail

#### Scenario: Portada editada como thumbnail de YouTube

**GIVEN**
YouTube está seleccionado

**AND**
la portada general contiene una composición editada

**WHEN**
se prepara el thumbnail de YouTube

**THEN**
YouTube recibe la imagen renderizada correspondiente al CoverState actual

**AND**
no recibe el frame o imagen base sin las ediciones.

### REQ-PC-015 — YouTube Shorts eligibility

#### Scenario: Video no elegible como Short

**GIVEN**  
YouTube Shorts está seleccionado

**WHEN**  
el video no cumple los criterios actuales de duración o relación de aspecto

**THEN**  
YouTube Shorts se marca como no listo

**AND**  
la aplicación indica qué criterio no se cumple

## Cross-platform Validation Rules

- La configuración de una plataforma nunca convierte automáticamente a otra plataforma en válida.
- Un valor general puede heredarse, pero cada plataforma se valida de forma independiente.
- Una capacidad no soportada no debe producir un control falso en la UI.
- Los límites dinámicos obtenidos de una plataforma tienen prioridad sobre defaults internos cuando corresponda.
- El resultado de esta feature es un conjunto de plataformas en estado `Ready` o `Not Ready`.
- `Publishing` decide si puede comenzar la publicación global.

## Open Questions

- ¿El título de YouTube debe iniciar vacío o se mostrará una sugerencia derivada del caption general?
- Si el usuario utiliza una imagen personalizada como portada general, ¿qué UX queremos para TikTok, que solo expone frame de video en el Direct Post schema revisado?
- ¿Expondremos `Made for kids` en la V1 o utilizaremos otra estrategia compatible con los requisitos de YouTube?
- ¿Expondremos la declaración de contenido sintético/IA de YouTube y TikTok en la V1?
- ¿Qué flujo de autenticación de Instagram utilizaremos finalmente y qué capacidades adicionales permite ese flujo?
- ¿Necesitamos `share_to_feed` activado o desactivado por defecto en Instagram, o debe requerir elección explícita?
