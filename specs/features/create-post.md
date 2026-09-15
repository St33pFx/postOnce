# Feature: Create Post

## Goal

Permitir al usuario preparar el contenido necesario para una publicación de video corto desde un solo lugar, incluyendo el video, caption y portada, reutilizando la información común entre plataformas y permitiendo configuraciones específicas cuando sean necesarias.

## Terminology

- **Caption general:** texto principal de la publicación que se reutiliza por defecto en las plataformas seleccionadas que admitan un campo compatible.
- **Caption específico:** texto que reemplaza al caption general únicamente para una plataforma.
- **Portada general:** portada utilizada por defecto en las plataformas seleccionadas que admitan una portada personalizada.
- **Portada específica:** portada que reemplaza a la portada general únicamente para una plataforma.
- **Override:** configuración específica de una plataforma que sustituye temporalmente un valor general.
- **Plataforma seleccionada:** plataforma que forma parte de la publicación actual y cuya configuración participa en la validación previa a publicar.

## Requirements

### REQ-CP-001 — Cargar video

La aplicación debe permitir al usuario cargar un archivo de video compatible para crear una publicación.

### REQ-CP-002 — Caption general

La aplicación debe permitir al usuario agregar un caption general que será reutilizado por defecto en las plataformas seleccionadas que admitan un campo compatible.

### REQ-CP-003 — Caption específico por plataforma

La aplicación debe permitir al usuario reemplazar el caption general por un caption específico para una plataforma cuando lo requiera.

### REQ-CP-004 — Portada general

La aplicación debe permitir al usuario configurar una portada general para la publicación.

### REQ-CP-005 — Portada específica por plataforma

La aplicación debe permitir al usuario configurar una portada específica para una plataforma sin modificar la portada general ni las portadas de las demás plataformas.

### REQ-CP-006 — Seleccionar frame como portada

La aplicación debe permitir al usuario seleccionar un frame del video cargado para utilizarlo como portada.

### REQ-CP-007 — Mini editor de portada

La aplicación debe proporcionar un editor básico de portada que permita agregar texto, modificar su estilo y tamaño, cambiar su posición y eliminarlo dentro del área editable de la portada.

### REQ-CP-008 — Selección de plataformas

La aplicación debe permitir al usuario seleccionar y deseleccionar una o más plataformas de destino antes de publicar.

### REQ-CP-009 — Configuración independiente por plataforma

La aplicación debe permitir configurar de manera independiente las opciones específicas disponibles para cada plataforma seleccionada.

### REQ-CP-010 — Cargar imagen local como portada

La aplicación debe permitir al usuario cargar una imagen local compatible para utilizarla como portada de la publicación.

### REQ-CP-011 — Reemplazar video

La aplicación debe permitir al usuario reemplazar el video cargado antes de iniciar la publicación.

## State Rules

- Los captions específicos configurados para una plataforma se conservarán durante la publicación actual aunque el usuario desactive temporalmente su override.
- Las portadas específicas configuradas para una plataforma se conservarán durante la publicación actual aunque el usuario desactive temporalmente su override.
- Desmarcar una plataforma no debe modificar la configuración de las demás plataformas seleccionadas.
- Una plataforma desmarcada deja de participar en la validación de la publicación.
- Reemplazar el video invalida cualquier portada generada a partir de frames del video anterior.
- Reemplazar el video no debe borrar automáticamente captions, plataformas seleccionadas ni configuraciones que no dependan del archivo de video.
- Las opciones específicas mostradas para una plataforma deben corresponder únicamente a capacidades que la integración pueda ejecutar realmente.
- Las fuentes de portada disponibles en la V1 son: imagen local compatible o frame del video cargado. El mini editor puede aplicarse sobre una portada válida generada por cualquiera de esas fuentes.

## Acceptance Criteria

### REQ-CP-001 — Cargar video

#### Scenario: Cargar un video válido

**GIVEN**  
el usuario se encuentra creando una nueva publicación

**WHEN**  
el usuario selecciona un archivo de video

**AND**  
el archivo utiliza un formato compatible

**AND**  
la aplicación puede leer correctamente el archivo

**THEN**  
el video se carga en la publicación

**AND**  
la aplicación muestra que el archivo fue cargado correctamente

#### Scenario: Formato de video no compatible

**GIVEN**  
el usuario se encuentra creando una nueva publicación

**WHEN**  
el usuario selecciona un archivo de video

**AND**  
el formato del archivo no es compatible con la aplicación

**THEN**  
la aplicación rechaza el archivo seleccionado

**AND**  
muestra un mensaje indicando que el formato no es compatible

**AND**  
el video no se agrega a la publicación

#### Scenario: Archivo de video ilegible

**GIVEN**  
el usuario se encuentra creando una nueva publicación

**WHEN**  
el usuario selecciona un archivo de video con un formato compatible

**AND**  
la aplicación no puede leer correctamente el contenido del archivo

**THEN**  
la aplicación rechaza el archivo seleccionado

**AND**  
muestra un mensaje indicando que el video no puede ser procesado

**AND**  
el video no se agrega a la publicación

**AND**  
el usuario puede seleccionar otro archivo

### REQ-CP-002 — Caption general

#### Scenario: Agregar un caption general

**GIVEN**  
el usuario se encuentra creando una nueva publicación

**AND**  
ha seleccionado una o más plataformas de destino

**WHEN**  
el usuario introduce texto en el campo de caption general

**THEN**  
la aplicación guarda el caption como parte de la publicación

**AND**  
el caption general se utiliza por defecto en todas las plataformas seleccionadas que admitan un campo compatible

#### Scenario: Modificar el caption general

**GIVEN**  
el usuario ya ha introducido un caption general

**AND**  
una o más plataformas continúan utilizando dicho caption

**WHEN**  
el usuario modifica el contenido del caption general

**THEN**  
la aplicación guarda el nuevo contenido

**AND**  
las plataformas que continúen utilizando el caption general reflejan la versión actualizada

#### Scenario: Seleccionar una nueva plataforma después de escribir el caption

**GIVEN**  
el usuario ya ha introducido un caption general

**AND**  
una o más plataformas están seleccionadas

**WHEN**  
el usuario selecciona una nueva plataforma que admite un campo compatible

**THEN**  
la nueva plataforma utiliza por defecto el caption general existente

### REQ-CP-003 — Caption específico por plataforma

#### Scenario: Activar un caption específico para una plataforma

**GIVEN**  
el usuario ha introducido un caption general

**AND**  
ha seleccionado dos o más plataformas de destino

**WHEN**  
el usuario activa la opción para utilizar un caption específico en una plataforma compatible

**THEN**  
la aplicación permite editar un caption independiente para esa plataforma

**AND**  
las demás plataformas continúan utilizando el caption general

#### Scenario: Guardar un caption específico

**GIVEN**  
una plataforma tiene activado el caption específico

**WHEN**  
el usuario introduce un caption diferente al general

**THEN**  
la aplicación guarda ese caption únicamente para esa plataforma

**AND**  
el caption general permanece sin cambios

**AND**  
las demás plataformas continúan utilizando el caption general salvo que tengan su propio override

#### Scenario: Modificar el caption general cuando existe un override

**GIVEN**  
una plataforma utiliza un caption específico

**AND**  
otra plataforma continúa utilizando el caption general

**WHEN**  
el usuario modifica el caption general

**THEN**  
las plataformas sin override reflejan el nuevo caption general

**AND**  
el caption específico permanece sin cambios

#### Scenario: Desactivar un caption específico

**GIVEN**  
una plataforma utiliza un caption específico

**WHEN**  
el usuario desactiva el override de caption para esa plataforma

**THEN**  
la plataforma vuelve a utilizar el caption general

**AND**  
las demás plataformas no modifican su configuración

#### Scenario: Reactivar un caption específico

**GIVEN**  
el usuario había configurado un caption específico para una plataforma

**AND**  
desactivó temporalmente su override durante la publicación actual

**WHEN**  
vuelve a activar el caption específico

**THEN**  
la aplicación restaura el último caption específico utilizado para esa plataforma durante la publicación actual

### REQ-CP-004 — Portada general

#### Scenario: Configurar una portada general

**GIVEN**  
el usuario se encuentra preparando una publicación

**AND**  
ha seleccionado una o más plataformas de destino

**WHEN**  
el usuario configura una portada general válida

**THEN**  
la aplicación guarda la portada como parte de la publicación

**AND**  
la portada general se utiliza por defecto en todas las plataformas seleccionadas que admitan una portada personalizada

#### Scenario: Cambiar la portada general

**GIVEN**  
el usuario ya ha configurado una portada general

**AND**  
una o más plataformas utilizan dicha portada

**WHEN**  
el usuario reemplaza la portada general por otra portada válida

**THEN**  
la aplicación guarda la nueva portada

**AND**  
todas las plataformas que continúen utilizando la portada general reflejan la nueva portada

**AND**  
las plataformas con un override de portada mantienen su portada específica

### REQ-CP-005 — Portada específica por plataforma

#### Scenario: Activar una portada específica

**GIVEN**  
el usuario ha configurado una portada general

**AND**  
ha seleccionado dos o más plataformas de destino

**WHEN**  
el usuario activa la opción para utilizar una portada específica en una plataforma que admite portada personalizada

**THEN**  
la aplicación permite configurar una portada independiente para esa plataforma

**AND**  
las demás plataformas continúan utilizando la portada general salvo que tengan su propio override

#### Scenario: Guardar una portada específica

**GIVEN**  
una plataforma tiene activada la opción de portada específica

**WHEN**  
el usuario configura una portada diferente a la general

**THEN**  
la aplicación guarda esa portada únicamente para esa plataforma

**AND**  
la portada general permanece sin cambios

**AND**  
las demás plataformas mantienen su portada actual

#### Scenario: Cambiar la portada general cuando existe un override

**GIVEN**  
una plataforma utiliza una portada específica

**AND**  
otra plataforma utiliza la portada general

**WHEN**  
el usuario reemplaza la portada general

**THEN**  
las plataformas sin override utilizan la nueva portada general

**AND**  
la portada específica permanece sin cambios

#### Scenario: Desactivar una portada específica

**GIVEN**  
una plataforma utiliza una portada específica

**WHEN**  
el usuario desactiva el override de portada para esa plataforma

**THEN**  
la plataforma vuelve a utilizar la portada general

**AND**  
las demás plataformas mantienen su configuración actual

#### Scenario: Reactivar una portada específica

**GIVEN**  
el usuario había configurado una portada específica para una plataforma

**AND**  
desactivó temporalmente su override durante la publicación actual

**WHEN**  
vuelve a activar la portada específica

**THEN**  
la aplicación restaura la última portada específica utilizada para esa plataforma durante la publicación actual

### REQ-CP-006 — Seleccionar frame como portada

#### Scenario: Seleccionar un frame del video

**GIVEN**  
el usuario ha cargado un video válido

**WHEN**  
el usuario abre la opción para seleccionar un frame como portada

**AND**  
elige un frame del video

**THEN**  
la aplicación utiliza ese frame como portada

**AND**  
muestra una vista previa de la portada seleccionada

#### Scenario: Cambiar el frame seleccionado

**GIVEN**  
el usuario ya ha seleccionado un frame como portada

**WHEN**  
selecciona un frame diferente del mismo video

**THEN**  
la aplicación reemplaza la portada anterior por el nuevo frame

**AND**  
la vista previa refleja el nuevo frame seleccionado

#### Scenario: El video cambia después de seleccionar un frame

**GIVEN**  
el usuario seleccionó un frame del video actual como portada

**WHEN**  
reemplaza el video de la publicación por otro archivo

**THEN**  
la aplicación invalida la portada generada desde el video anterior

**AND**  
solicita al usuario seleccionar una nueva portada o un nuevo frame

### REQ-CP-007 — Mini editor de portada

#### Scenario: Agregar texto a la portada

**GIVEN**  
el usuario ha configurado una portada válida

**WHEN**  
el usuario agrega un bloque de texto desde el editor de portada

**THEN**  
la aplicación muestra el texto sobre la portada

**AND**  
el texto puede ser editado antes de finalizar la configuración

#### Scenario: Cambiar la posición del texto

**GIVEN**  
la portada contiene un bloque de texto

**WHEN**  
el usuario desplaza el texto dentro del área editable de la portada

**THEN**  
la aplicación actualiza su posición

**AND**  
la vista previa refleja la nueva ubicación

#### Scenario: Cambiar el estilo del texto

**GIVEN**  
la portada contiene un bloque de texto

**WHEN**  
el usuario modifica una opción de estilo disponible

**THEN**  
la aplicación actualiza la apariencia del texto

**AND**  
la vista previa refleja el estilo seleccionado

#### Scenario: Modificar el tamaño del texto

**GIVEN**  
la portada contiene un bloque de texto

**WHEN**  
el usuario cambia el tamaño del texto

**THEN**  
la aplicación actualiza su tamaño

**AND**  
mantiene el texto dentro del área editable de la portada

#### Scenario: Eliminar texto de la portada

**GIVEN**  
la portada contiene un bloque de texto

**WHEN**  
el usuario elimina dicho bloque

**THEN**  
el texto deja de formar parte de la portada

**AND**  
la imagen base de la portada permanece sin cambios

### REQ-CP-008 — Selección de plataformas

#### Scenario: Seleccionar una plataforma

**GIVEN**  
el usuario se encuentra preparando una publicación

**WHEN**  
selecciona una plataforma disponible

**THEN**  
la plataforma se agrega a la publicación

**AND**  
la aplicación muestra sus opciones de configuración correspondientes

#### Scenario: Seleccionar múltiples plataformas

**GIVEN**  
el usuario se encuentra preparando una publicación

**WHEN**  
selecciona dos o más plataformas disponibles

**THEN**  
todas las plataformas seleccionadas se agregan a la publicación

**AND**  
cada una muestra su propia sección de configuración

#### Scenario: Desmarcar una plataforma

**GIVEN**  
el usuario ya ha seleccionado una plataforma

**WHEN**  
la desmarca

**THEN**  
la plataforma deja de formar parte de la publicación

**AND**  
su configuración deja de participar en la validación de la publicación

**AND**  
las demás plataformas seleccionadas permanecen sin cambios

### REQ-CP-009 — Configuración independiente por plataforma

#### Scenario: Mostrar opciones específicas de una plataforma

**GIVEN**  
el usuario ha seleccionado una plataforma de destino

**WHEN**  
la plataforma se agrega a la publicación

**THEN**  
la aplicación muestra las opciones de configuración disponibles para esa plataforma

**AND**  
las opciones mostradas corresponden únicamente a capacidades que la integración pueda ejecutar realmente

#### Scenario: Modificar una opción específica

**GIVEN**  
el usuario ha seleccionado dos o más plataformas

**AND**  
cada plataforma muestra su propia configuración

**WHEN**  
el usuario modifica una opción específica de una plataforma

**THEN**  
el cambio se aplica únicamente a esa plataforma

**AND**  
la configuración de las demás plataformas permanece sin cambios

#### Scenario: Mantener configuraciones independientes

**GIVEN**  
el usuario ha configurado opciones diferentes para varias plataformas

**WHEN**  
continúa editando la publicación

**THEN**  
la aplicación conserva la configuración independiente de cada plataforma

**AND**  
ninguna configuración específica sobrescribe automáticamente la de otra plataforma

#### Scenario: Opción no disponible para una plataforma

**GIVEN**  
una función de publicación no está disponible o no puede ser controlada mediante la integración de una plataforma

**WHEN**  
el usuario configura dicha plataforma

**THEN**  
la aplicación no presenta esa función como una opción utilizable

**AND**  
no simula ni promete una capacidad que la integración no puede ejecutar

### REQ-CP-010 — Cargar imagen local como portada

#### Scenario: Cargar una imagen válida como portada

**GIVEN**  
el usuario se encuentra preparando una publicación

**WHEN**  
selecciona una imagen local compatible

**THEN**  
la aplicación carga la imagen como portada

**AND**  
muestra una vista previa de la portada seleccionada

#### Scenario: Reemplazar una portada cargada

**GIVEN**  
el usuario ya ha cargado una imagen como portada

**WHEN**  
selecciona otra imagen compatible

**THEN**  
la nueva imagen reemplaza la portada anterior

**AND**  
la vista previa refleja la nueva portada

#### Scenario: Formato de imagen no compatible

**GIVEN**  
el usuario se encuentra preparando una publicación

**WHEN**  
selecciona una imagen en un formato no compatible

**THEN**  
la aplicación rechaza la imagen

**AND**  
muestra un mensaje indicando que el formato no es compatible

**AND**  
la portada anterior, si existe, permanece sin cambios

#### Scenario: Imagen ilegible o corrupta

**GIVEN**  
el usuario selecciona una imagen con un formato compatible

**WHEN**  
la aplicación no puede leer correctamente el archivo

**THEN**  
la aplicación rechaza la imagen

**AND**  
muestra un mensaje indicando que la imagen no puede ser procesada

**AND**  
la portada anterior, si existe, permanece sin cambios

**AND**  
el usuario puede seleccionar otro archivo

### REQ-CP-011 — Reemplazar video

#### Scenario: Reemplazar el video cargado

**GIVEN**  
el usuario ha cargado un video válido

**AND**  
todavía no ha iniciado la publicación

**WHEN**  
selecciona otro archivo de video válido

**THEN**  
la aplicación reemplaza el video anterior por el nuevo archivo

**AND**  
conserva captions, plataformas seleccionadas y configuraciones que no dependan del video anterior

#### Scenario: Reemplazar el video cuando existe una portada basada en un frame

**GIVEN**  
el usuario utiliza un frame del video actual como portada

**WHEN**  
reemplaza el video por otro archivo válido

**THEN**  
la aplicación reemplaza el video

**AND**  
invalida cualquier portada generada a partir de frames del video anterior

**AND**  
solicita al usuario configurar una nueva portada para las ubicaciones afectadas

#### Scenario: Intentar reemplazar el video con un archivo inválido

**GIVEN**  
el usuario ya tiene un video válido cargado

**WHEN**  
intenta reemplazarlo por un archivo no compatible o ilegible

**THEN**  
la aplicación rechaza el nuevo archivo

**AND**  
mantiene el video válido anterior sin cambios

## Edge Cases

Los siguientes casos todavía requieren una decisión explícita antes de considerarse completamente especificados:

- El archivo de video original deja de estar disponible mientras la publicación sigue abierta.
- El usuario configura una plataforma, la desmarca y posteriormente vuelve a seleccionarla.
- El usuario cierra la aplicación antes de publicar y posteriormente vuelve a abrirla.
- Una plataforma seleccionada cambia sus capacidades disponibles después de que el usuario ya había configurado la publicación.

## Open Questions

- ¿Qué formatos de video serán compatibles en la V1?
- ¿La aplicación tendrá límites internos de tamaño, resolución o duración además de los límites impuestos por cada plataforma?
- ¿La aplicación conservará una copia del archivo de video o trabajará únicamente con una referencia al archivo local?
- ¿Qué formatos de imagen serán compatibles para las portadas?
- ¿La aplicación tendrá límites internos de tamaño o resolución para las imágenes de portada?
- ¿El caption general será opcional o la V1 requerirá introducirlo antes de publicar?
- ¿Qué estilos tipográficos estarán disponibles en el editor de portada de la V1?
- ¿La publicación se guardará automáticamente como draft mientras el usuario trabaja?
- ¿Qué ocurrirá si el usuario cierra la aplicación antes de publicar?
- ¿Las configuraciones de una plataforma desmarcada se conservarán si el usuario vuelve a seleccionarla durante la misma publicación?

## Deferred to Platform Configuration

Las siguientes decisiones no pertenecen a `Create Post` y deberán resolverse en la especificación de configuración por plataforma:

- Requisitos obligatorios específicos de Instagram, TikTok, YouTube u otras plataformas.
- Límites de duración, tamaño, resolución, relación de aspecto o codec impuestos por cada plataforma.
- Diferencias entre caption, title, description y otros campos específicos.
- Disponibilidad real de opciones de publicación mediante las APIs o integraciones de cada plataforma.
- Comportamiento de la validación cuando un video es válido para unas plataformas seleccionadas pero no para otras.
