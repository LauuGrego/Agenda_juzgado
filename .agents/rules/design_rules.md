---
trigger: always_on
---

# Design System & UI/UX Rules: Judicial Ops Calendar

**Contexto:** Juzgado de Paz (Agenda Única de Secretaría)
**Look & Feel:** Modern SaaS / Linear-style / Dark-mode ready / Polished Minimal

---

## 1. Principios Visuales y Filosofía UX

- **Aesthetic Standard (Linear / Raycast):** Interfaz moderna y minimalista. Uso estricto de bordes sutiles (`1px solid`), desenfoques de fondo (`backdrop-blur`) y sombras suaves (`shadow-sm` / `shadow-md`).
- **Cero Emojis:** Prohibido el uso de emojis en cualquier elemento de la interfaz (textos, etiquetas, botones o estados). Utilizar exclusivamente iconografía SVG lineal y sobria (`Lucide Icons` o similar, 14px a 16px, `stroke-width: 1.5`).
- **Anti-Legacy UI:** Prohibidos los grises pesados estilo software de escritorio antiguo, bordes dobles, gradientes estridentes y líneas de tabla duras.
- **Layout de Vista Única:** No incluir selectores de usuario, filtros por rol ni vistas multi-agenda. La composición visual asume una sola línea de trabajo centralizada.
- **Consistencia de Formas:** Radios de curvatura estándar:
  - Contenedores principales y modales: `rounded-xl` (12px)
  - Tarjetas de eventos, inputs y botones: `rounded-lg` (8px)
  - Badges y etiquetas de estado: `rounded-md` (6px) o `rounded-full`

---

## 2. Tokens de Color y Contraste

### Superficies y Fondo

- **Dark Mode (Default):**
  - Fondo base: `#09090B` (Zinc 950)
  - Superficie/Paneles: `#18181B` (Zinc 900)
  - Bordes y divisores: `rgba(255, 255, 255, 0.08)` o `#27272A`
- **Light Mode:**
  - Fondo base: `#F4F4F5` (Zinc 100) o `#FAFAFA`
  - Superficie/Paneles: `#FFFFFF`
  - Bordes y divisores: `#E4E4E7` (Zinc 200)
- **Acento Primario:** `#6366F1` (Indigo 500) para estados activos, foco y selecciones principales.

### Códigos de Color para Categorización (Tinted Glass Badges)

No usar colores planos plenos; aplicar variantes translúcidas con bajo relleno (10-15%) y bordes tenues:

- **Indigo Soft:** Audiencias y actos formales (`bg-indigo-500/10 text-indigo-400 border-indigo-500/20`)
- **Rose Soft:** Plazos urgentes o perentorios (`bg-rose-500/10 text-rose-400 border-rose-500/20`)
- **Amber Soft:** Despachos, firmas y revisiones (`bg-amber-500/10 text-amber-400 border-amber-500/20`)
- **Emerald Soft:** Conciliaciones y trámites completados (`bg-emerald-500/10 text-emerald-400 border-emerald-500/20`)
- **Muted Zinc:** Registros secundarios o archivados (`bg-zinc-500/10 text-zinc-400 border-zinc-500/20`)

---

## 3. Tipografía y Jerarquía Visual

- **Fuente de Lectura:** `Inter`, `Geist Sans` o `Plus Jakarta Sans`.
- **Fuente Monoespaciada (Datos Técnicos):** `Geist Mono` o `JetBrains Mono` con números tabulares (`font-feature-settings: "tnum"`) para expedientes, fechas y horarios.
- **Escala y Peso:**
  - Encabezados de vista: `text-sm font-semibold tracking-tight`
  - Cuerpo / Datos generales: `text-xs font-normal text-foreground`
  - Identificadores de expediente: `text-xs font-mono font-medium text-muted-foreground`
  - Rótulos de tiempo: `text-xs font-medium tabular-nums`

---

## 4. Estructura y Componentes UI

### Grilla de Tiempo y Calendario

- **Divisores Temporales:** Líneas punteadas y de muy bajo contraste (`border-dashed border-zinc-200/50 dark:border-zinc-800`).
- **Indicador de Hora Actual:** Línea viva y delgada con punto de anclaje iluminado (`bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]`).
- **Tarjetas de Eventos:**
  - Fondo con ligero contraste sobre la grilla y borde lateral izquierdo de color sólido (3px).
  - Padding interno ajustado (`p-2` o `p-2.5`) para maximizar la densidad visual.
  - Disposición interna clara: Hora (mono) + Código de Expediente + Descripción breve.

### Controles de Navegación y Vistas

- **Segmented Controls:** Píldoras flotantes (`rounded-lg` o `rounded-full`) con transición suave para cambiar entre granularidades temporales (Día / Semana / Mes).
- **Barras de Búsqueda e Inputs:** Diseño plano con borde sutil, icono SVG a la izquierda (`14px`) y placeholder discreto (`text-muted-foreground`).

### Superposiciones y Contenedores Deslizables

- **Paneles Laterales (Sheets/Drawers):** Superficie deslizante con fondo desenfocado (`backdrop-blur-md`) sobre la vista principal, manteniendo el contexto visual visible detrás.
- **Ventanas Flotantes y Menús Contextuales:** Bordes `1px`, sombras suaves (`shadow-lg`), esquinas `rounded-lg` y sin líneas de separación duras.

---

## 5. Microinteracciones y Estados Visuales

- **Transiciones:** Duración estándar de `150ms` a `200ms` con curva `ease-out` en hovers, aperturas de paneles y cambios de vista.
- **Hover States:** Elevación sutil (`scale-[1.01]` o cambio ligero de brillo/borde) sin saltos bruscos de layout.
- **Superposición / Conflictos Visuales:** Patrón de rayado diagonal translúcido (`bg-stripe`) para indicar bloques de tiempo con dos o más eventos superpuestos.
- **Notificaciones Flotantes (Toasts):** Ubicación inferior central, formato compacto, bordes sutiles y contraste limpio con icono SVG de confirmación.
