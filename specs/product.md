# Product Specification

> Producto provisional: PostOnce  
> Estado: V1 definida a nivel de producto.

## Problem

Publicar un mismo video corto en distintas plataformas como YouTube, Instagram y TikTok requiere repetir gran parte del proceso en cada una.

El usuario debe transferir o cargar el mismo archivo, volver a introducir información como el texto y los hashtags, configurar la portada y ajustar opciones específicas de cada plataforma.

Esto convierte una tarea que debería ser simple en un proceso repetitivo, fragmentado y que consume más tiempo del necesario.

## Goal

Permitir al usuario preparar y publicar un mismo contenido de video corto en múltiples plataformas desde un solo lugar, reduciendo la repetición de tareas y el tiempo necesario para completar el proceso de publicación.

## Target User

Creadores individuales que publican el mismo contenido de video corto en múltiples plataformas y buscan reducir el tiempo y las tareas repetitivas involucradas en ese proceso.

## V1 Scope

- Conectar las cuentas necesarias para publicar en las plataformas soportadas.
- Crear una publicación a partir de un video.
- Agregar un caption general reutilizable.
- Seleccionar múltiples plataformas de destino.
- Configurar las opciones específicas disponibles para cada plataforma.
- Configurar una portada general.
- Utilizar una portada diferente para una plataforma específica cuando sea necesario.
- Crear una portada seleccionando un frame del video.
- Agregar texto mediante un editor básico de portada.
- Cargar una imagen personalizada como portada.
- Validar todas las plataformas seleccionadas antes de iniciar cualquier publicación.
- Iniciar la publicación en todas las plataformas seleccionadas mediante una sola acción del usuario.
- Mostrar de manera independiente el estado de publicación de cada plataforma.
- Permitir reintentar únicamente las plataformas cuya publicación haya fallado.

## V1 Feature Set

### Feature 1 — Account Connections

Conectar y mantener autorizadas las cuentas de las plataformas necesarias para publicar.

### Feature 2 — Create Post

Preparar el contenido común de una publicación: video, caption, plataformas y portada.

### Feature 3 — Platform Configuration

Mostrar, mapear y validar la configuración específica de cada plataforma seleccionada.

### Feature 4 — Publishing

Validar la publicación completa, iniciar el envío y gestionar estados, fallos y reintentos por plataforma.

## Product Principles

- La información común se define una vez y se reutiliza siempre que la plataforma lo permita.
- Las diferencias entre plataformas se representan explícitamente y no se ocultan.
- La aplicación solo muestra capacidades que pueda ejecutar realmente mediante la integración disponible.
- Si falta información obligatoria para cualquier plataforma seleccionada, ninguna publicación comienza.
- Una vez iniciada la publicación, cada plataforma mantiene un estado independiente.
- Un fallo en una plataforma no debe cancelar ni modificar una publicación que ya tuvo éxito en otra.
- La aplicación no debe inventar equivalencias entre campos de plataformas diferentes.

## Out of Scope — V1

- Analytics y métricas de rendimiento.
- Scheduling o programación de publicaciones.
- Generación de captions mediante IA.
- Generación automática de hashtags mediante IA.
- Edición completa de video.
- Calendario editorial.
- Gestión de equipos, roles o múltiples usuarios.
- Recomendaciones automáticas de contenido o rendimiento.

## Supported Devices

PostOnce V1 será una aplicación web responsive.

Las funciones principales de V1 deben estar disponibles desde:

- computadoras de escritorio y laptops;
- iPad;
- iPhone.

La interfaz puede adaptarse al tamaño y método de entrada del dispositivo,
pero los workflows principales no deben depender de utilizar una computadora.
