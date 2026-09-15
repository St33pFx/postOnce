# PostOnce Constitution

## 1. Product Intent

PostOnce debe reducir el trabajo repetitivo necesario para publicar
un mismo video corto en múltiples plataformas.

Las decisiones técnicas y de producto deben priorizar este objetivo.

## 2. Supported Devices

PostOnce V1 debe funcionar como una aplicación web responsive.

Las funciones principales deben estar disponibles desde:

- PC y laptops
- iPad
- iPhone

La interfaz puede adaptarse al tamaño de pantalla y método de entrada,
pero las capacidades principales no deben depender de un dispositivo específico.

## 3. Specification First

Antes de implementar una feature:

1. Debe existir una intención suficientemente definida.
2. Los comportamientos importantes deben estar especificados.
3. Las ambigüedades relevantes deben resolverse o quedar explícitamente
   documentadas como preguntas abiertas.

El agente no debe inventar silenciosamente decisiones de producto.

## 4. External Platform Grounding

Las capacidades de Instagram, TikTok, YouTube u otros servicios externos
no deben asumirse.

Las decisiones relacionadas con APIs externas deben basarse en:

1. documentación oficial actual;
2. capacidades verificadas;
3. restricciones conocidas de la integración utilizada.

Una opción presente en la aplicación oficial de una plataforma no implica
que esté disponible mediante su API.

## 5. No Fake Capabilities

La aplicación no debe mostrar controles que aparenten funcionar cuando
la integración no pueda ejecutar realmente esa acción.

Las capacidades no soportadas deben omitirse o marcarse explícitamente
como no disponibles.

## 6. Cross-Platform Independence

Cada plataforma debe tratarse como una integración independiente.

Un cambio, fallo o reintento de una plataforma no debe alterar
innecesariamente el estado de las demás.

La lógica específica de una plataforma no debe propagarse por todo
el sistema si puede mantenerse aislada.

## 7. Shared Values, Explicit Differences

La aplicación debe reutilizar valores generales cuando las plataformas
sean compatibles.

Las diferencias entre plataformas deben representarse explícitamente.

No deben inventarse equivalencias entre campos diferentes únicamente
para simplificar la implementación.

## 8. Security

Credenciales, secretos y tokens de plataformas externas no deben
exponerse innecesariamente al cliente.

La aplicación debe utilizar los mecanismos oficiales de autorización.

Nunca debe solicitar al usuario las contraseñas de sus cuentas externas.

## 9. Reliability

La aplicación debe asumir que:

- las redes pueden fallar;
- los uploads pueden interrumpirse;
- las APIs externas pueden devolver errores;
- una plataforma puede tardar en procesar contenido;
- puede existir éxito parcial entre plataformas.

El sistema debe evitar duplicar publicaciones cuando el resultado
de una operación anterior sea incierto.

## 10. User Feedback

Las operaciones largas deben comunicar su estado al usuario.

No deben mostrarse porcentajes, estados o resultados inventados
cuando no puedan medirse realmente.

Los errores deben indicar, cuando sea posible:

- qué falló;
- en qué plataforma;
- qué puede hacer el usuario.

## 11. Scope Discipline

La implementación de V1 debe limitarse al scope definido.

El agente puede proponer mejoras fuera de alcance, pero no debe
implementarlas sin aprobación explícita.

Analytics, scheduling, AI features y otras funciones fuera de V1
no deben añadirse incidentalmente.

## 12. Technology Selection

La tecnología no está predeterminada.

Antes de comenzar la implementación, el agente debe recomendar
un stack técnico basándose en las specs del proyecto.

La recomendación debe:

- explicar las necesidades que intenta resolver;
- comparar alternativas razonables;
- justificar cada componente importante;
- identificar trade-offs;
- evitar complejidad innecesaria;
- favorecer tecnologías estables y mantenibles;
- considerar ejecución responsive en PC, iPad e iPhone;
- considerar uploads de archivos grandes;
- considerar OAuth y APIs externas;
- considerar procesamiento de imágenes/video cuando sea necesario.

El agente no debe comenzar la implementación hasta que el stack
y la arquitectura hayan sido aprobados.

## 13. Architecture Before Implementation

Una vez aprobado el stack, debe existir un diseño técnico suficiente
para explicar al menos:

- cliente;
- backend;
- almacenamiento temporal;
- persistencia;
- autenticación/autorización;
- manejo de tokens;
- integraciones por plataforma;
- procesamiento de video/portadas;
- jobs de publicación;
- manejo de errores y retry.

No es necesario sobredocumentar componentes triviales.

## 14. Verification

Una feature no se considera terminada únicamente porque compile
o se vea correctamente.

Debe verificarse contra los Requirements y Acceptance Criteria
correspondientes.

Si implementación y spec entran en conflicto, el agente debe detenerse
y señalar la discrepancia en lugar de cambiar silenciosamente
el comportamiento.
