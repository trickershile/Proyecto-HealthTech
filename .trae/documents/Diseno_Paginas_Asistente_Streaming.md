# Diseño de páginas — Asistente en Streaming (desktop-first)

## Estilos globales (Design Tokens)
- Background: #0B1020 (principal) y #0F172A (superficie)
- Texto: #E5E7EB (primario), #94A3B8 (secundario)
- Acento: #22C55E (acción primaria), foco/outline #60A5FA
- Tipografía: Inter / system-ui
  - H1 28px/36, H2 20px/28, Body 16px/24, Small 13px/18
- Botones:
  - Primario: fondo acento, texto #0B1020; hover oscurecer 6–8%; disabled opacidad 40%
  - Secundario: borde 1px #334155; hover fondo #111C33
- Inputs/textarea:
  - Fondo #0F172A, borde #334155, foco con outline 2px #60A5FA
- Enlaces: #60A5FA con subrayado en hover

## Comportamiento responsivo
- Enfoque desktop-first.
- Breakpoints sugeridos:
  - Desktop ≥ 1024px
  - Tablet 768–1023px
  - Mobile < 768px
- Contenedor: max-width 1040px, centrado, padding 24px (desktop) / 16px (móvil).

---

## Página: Chat (/)

### Layout
- Sistema híbrido: CSS Grid para estructura general + Flexbox para alineación interna.
- Estructura principal (desktop):
  - Header fijo/estático arriba.
  - Main en una columna con “panel de salida” (asistente) y “panel de entrada” (usuario).
- Espaciado: escala 8px (8/16/24/32).

### Meta Information
- Title: “Asistente — Respuesta en tiempo real”
- Description: “Interfaz de chat responsiva con respuesta del asistente en streaming.”
- Open Graph:
  - og:title = “Asistente en tiempo real”
  - og:description = “Respuesta del asistente actualizada mientras se genera.”

### Page Structure
1. Header
2. Panel de salida (caja de texto del asistente)
3. Panel de entrada (textarea + botón enviar)
4. Zona de estado (streaming / finalizado / error)

### Secciones & Componentes

#### 1) Header
- Contenido:
  - Título de producto (izquierda).
  - Indicador de estado compacto (derecha): “Listo / Enviando / Recibiendo / Error”.
- Interacción:
  - El estado cambia automáticamente según el ciclo de streaming.

#### 2) Panel de salida — “Respuesta del asistente”
- Componente principal: caja de texto (tipo textarea/readonly o bloque preformateado) con scroll.
- Reglas:
  - Renderizar el texto conforme llegan los fragmentos (stream) sin parpadeo.
  - Mantener el cursor/scroll estable; si el usuario está al final, auto-scroll suave; si no, no forzar salto.
- Estados visuales:
  - Vacío: placeholder “Aquí verás la respuesta del asistente…”
  - Streaming: mostrar un subtítulo pequeño “Generando…”
  - Error: mensaje breve legible, manteniendo el último texto recibido si existe.

#### 3) Panel de entrada — “Tu mensaje”
- Textarea editable para el mensaje del usuario.
- Botón “Enviar” (primario).
- Interacciones:
  - Enter envía; Shift+Enter agrega salto de línea.
  - Mientras esté “Enviando/Recibiendo”, deshabilitar envío duplicado (o convertir a estado bloqueado).

#### 4) Zona de estado y error (inline)
- Debajo del panel de entrada:
  - Texto pequeño con el estado actual.
  - En caso de error: mostrar “Reintentar” (botón secundario) que reenvía el último mensaje.

### Accesibilidad
- Orden de tab lógico: entrada → enviar → (si existe) reintentar.
- Contraste AA en textos principales.
- Labels/aria-label en textarea y botones.

### Transiciones
- Transición de color en botones e inputs (150–200ms).
- Aparición/desaparición del bloque de error con fade (120–160ms).
