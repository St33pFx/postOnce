# PostOnce — Specification Index

> Estado: especificación de producto V1 en revisión.
> Última revisión: 2026-09-14.

## Propósito

Esta carpeta contiene la especificación del producto antes de definir arquitectura, stack, tareas de implementación o código.

La intención es reducir decisiones implícitas antes de que un agente implemente el producto.

## Estructura

```text
specs/
├── README.md
├── product.md
├── features/
│   ├── account-connections.md
│   ├── create-post.md
│   ├── platform-configuration.md
│   └── publishing.md
└── research/
    └── platform-capabilities.md
```

## Estado de las specs

| Archivo | Estado | Propósito |
|---|---|---|
| `product.md` | Definido para V1 | Problema, objetivo, usuario, alcance y límites |
| `features/account-connections.md` | Draft para revisión | Conectar y mantener autorizadas las cuentas |
| `features/create-post.md` | Definido con preguntas abiertas | Preparar video, caption, plataformas y portada |
| `features/platform-configuration.md` | Draft basado en APIs verificadas | Mapear y validar opciones por plataforma |
| `features/publishing.md` | Draft para revisión | Validación final, publicación, estados, fallos y retry |
| `research/platform-capabilities.md` | Investigación verificada | Capacidades externas y restricciones actuales |

## Feature map de V1

```text
Account Connections
        ↓
Create Post
        ↓
Platform Configuration
        ↓
Publishing
```

`Analytics` pertenece a una fase posterior y no forma parte de V1.

## Regla de trabajo

1. Definir el comportamiento del producto.
2. Resolver las preguntas abiertas que bloqueen implementación.
3. Revisar consistencia entre specs.
4. Definir arquitectura y stack.
5. Crear plan técnico.
6. Dividir en tareas.
7. Implementar.
8. Verificar contra Acceptance Criteria.

## Archivos que todavía NO necesitamos

No se crea todavía:

- arquitectura técnica;
- esquema de base de datos;
- elección de framework;
- tareas de implementación;
- tests concretos;
- deployment;
- `constitution.md` o reglas de código.

Esos documentos se crearán cuando las specs funcionales estén aprobadas.
