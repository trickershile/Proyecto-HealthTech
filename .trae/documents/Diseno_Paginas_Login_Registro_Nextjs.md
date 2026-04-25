# Diseño de páginas (Desktop-first) — Auth con roles

## Global Styles (tokens)
- Layout base: contenedor centrado `max-width: 1120px`, padding lateral 24px.
- Grid/espaciado: escala 4/8/12/16/24/32.
- Tipografía: base 16px; H1 32–36px; H2 24px; body 16px; helper 13–14px.
- Colores:
  - Fondo: `#0B1220` (oscuro) o `#FFFFFF` (claro) según tema existente.
  - Texto primario: `#E5E7EB` (oscuro) / `#111827` (claro).
  - Primario (CTA): `#2563EB`.
  - Error: `#DC2626`.
  - Borde/surface: `#1F2937`.
- Botones:
  - Primary: sólido; hover +6% brillo; disabled 60% opacidad.
  - Secondary: borde; hover fondo sutil.
- Inputs:
  - Altura 44px; borde 1px; foco con outline 2px (primario).
  - Errores debajo del campo (texto pequeño en rojo).

## Página: Inicio (/)
### Meta Information
- Title: "Inicio | HealthTech"
- Description: "Accede o crea tu cuenta para continuar."
- Open Graph: `og:title`, `og:description`, `og:type=website`

### Layout
- Flexbox vertical (columna) + secciones apiladas.
- Encabezado fijo opcional (navbar simple) y cuerpo centrado.

### Page Structure
1) Header/Nav
2) Hero / Estado de sesión
3) Tarjetas de acciones (Login/Registro o Logout)
4) Bloque “Tu rol” (solo autenticado)

### Sections & Components
- Navbar (top):
  - Izquierda: nombre del producto.
  - Derecha: botón “Login” y “Registro” si no autenticado; “Cerrar sesión” si autenticado.
- Hero:
  - Título: “Bienvenido/a”.
  - Subtítulo: guía rápida según estado.
- Estado de sesión:
  - Si no autenticado: texto “No has iniciado sesión”.
  - Si autenticado: email + badge de rol (Admin/Alumno/Paciente).
- Role-based UI (sin nuevas rutas):
  - Admin: panel compacto con acciones (p.ej. “Gestionar roles” como componente/tabla embebida futura).
  - Alumno/Paciente: bloque de información (p.ej. “Tu perfil”).

## Página: Login (/login)
### Meta Information
- Title: "Login | HealthTech"
- Description: "Inicia sesión con tu email y contraseña."
- Open Graph: `og:title`, `og:description`

### Layout
- CSS Grid 2 columnas (desktop):
  - Col 1: explicación/beneficios.
  - Col 2: card de formulario.
- Responsive: en <768px, apilar columnas.

### Page Structure
1) Header minimal (volver a Inicio)
2) Grid (Info + Form Card)

### Sections & Components
- Link superior: “← Volver al inicio”.
- Info panel:
  - Texto breve: “Acceso seguro con roles”.
  - Lista: “Admin / Alumno / Paciente”.
- Form Card:
  - Campos: Email, Password.
  - Botón primary: “Entrar”.
  - Estados:
    - Loading en submit.
    - Error banner cuando credenciales inválidas.
  - Links:
    - “¿No tienes cuenta? Regístrate” → /registro.
- Post-login behavior:
  - Tras éxito: obtener `profiles.role` y redirigir a `/` (o mostrar mensaje y volver automáticamente), manteniendo UI adaptada al rol.

## Página: Registro (/registro)
### Meta Information
- Title: "Registro | HealthTech"
- Description: "Crea una cuenta en minutos."
- Open Graph: `og:title`, `og:description`

### Layout
- Una columna centrada con card de formulario (desktop) + panel lateral opcional (igual que login si se quiere consistencia).

### Page Structure
1) Header minimal (volver a Inicio)
2) Form Card
3) Mensaje de confirmación

### Sections & Components
- Form Card:
  - Campos: Email, Password, Confirm Password.
  - Validaciones:
    - Email requerido y formato.
    - Password mínimo (según política de Auth).
    - Confirmación coincide.
  - Botón primary: “Crear cuenta”.
  - Estado éxito:
    - Mostrar texto: “Tu perfil se crea automáticamente.”
    - Si confirmación de email está activa: “Revisa tu correo para confirmar”.
- Link inferior: “¿Ya tienes cuenta? Inicia sesión” → /login.
