# Estándar de diseño — App Producción

Contrato único para que **todas** las pantallas se vean iguales. Usar **solo** tokens y
componentes del Design System. Regla de oro: si dudás, copiá el patrón de una pantalla
de Concreto (`app/(protected)/concreto/*`), que ya cumple este estándar.

## 1. Marco de página (obligatorio en TODA pantalla)

```tsx
import { PageShell, PageHeader } from '@/components/layout/Page';

<PageShell>                                  {/* p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in */}
  <PageHeader
    title="Título"
    subtitle="12 elementos"                  {/* opcional, texto o nodo */}
    actions={<Button>Acción</Button>}         {/* opcional */}
  />
  {/* filtros → contenido */}
</PageShell>
```

- Listados/tablas → `<PageShell>` (1600px). Formularios/detalle → `<PageShell width="narrow">` (1200px).
- Detalle con "Volver": `<PageHeader back={<Button variant="ghost" size="sm" icon={<Icon name="back"/>} onClick={...}>Volver</Button>} title=... />`.
- **Prohibido**: `p-8`, `max-w-4xl`, `<h1 className="text-2xl/3xl">`, headers a mano. Todo va por `PageShell`/`PageHeader`.

## 2. Tipografía (tokens DS — nunca Tailwind default)

| Uso | Clase | px |
|---|---|---|
| Título de página | `text-heading font-bold` | 32 |
| Subtítulo de sección | `text-sub font-bold` | 24 |
| Sub-sección | `text-sub-sm font-semibold` | 20 |
| Cuerpo | `text-body` | 16 |
| Etiquetas / celdas | `text-sm` | 14 |
| Auxiliar / meta | `text-body-sm` o `text-xs` | 12 |

Prohibido: `text-3xl/2xl/xl/lg/base`. Peso: `font-semibold` o `font-bold` (no `font-medium`).

## 3. Color (paleta DS)

- Texto: `text-black`, `text-ds-gray-500` (secundario), `text-ds-gray-400` (meta), `text-ds-gray-300` (placeholder/—).
- Marca: `text-brand` / `bg-brand`. Peligro: `text-ds-red` / `bg-ds-red`. Alerta: `text-ds-yellow`.
- Superficies: `bg-white` (cards), `bg-ds-bg` (fondo), `bg-ds-gray-100` (chips/inactivo).
- Bordes: `border-ds-gray-200`. Prohibido: `gray-*`, `red-500`, `blue-*`, hex sueltos.

## 4. Componentes (usar SIEMPRE estos; no reinventar)

- **Botones** → `@/components/ui/Button` (`variant`: primary | secondary | outline | ghost | danger; `size`: sm | md). Nunca `<button>` crudo para acciones (sí para íconos inline sutiles).
- **Tablas/listados** → `@/components/ui/DataTable` (trae búsqueda, export, columnas, skeleton). Para tablas simples: `@/components/ui/Table`.
- **Filtros** → pills segmentados `@/app/(protected)/concreto/_components/Pills` para baja cardinalidad (estado, planta, tipo); `@/components/ui/Combobox` para alta cardinalidad; `@/components/ui/DatePicker` para fechas. Barra de filtros: `<div className="space-y-3">` (pills apilados) o grid `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3` (combobox/date).
- **Formularios** → `@/components/ui/Input` (+ `Select`), `Combobox`, `DatePicker`. Labels arriba, `space-y-4`.
- **Modales** → `@/components/ui/Modal`. Confirmaciones → `useConfirm()` de `@/components/ui/Confirm`.
- **Badges/estados** → `@/components/ui/Badge` (variant green | yellow | blue | gray | red | black, `dot`).
- **Toasts** → `useToast()` de `@/components/ui/Toast`.
- **Íconos** → `@/components/ds/Icon/Icon` (`size` sm | md | lg, `color="currentColor"`).

## 5. Cards / contenedores

```
bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5
```
Radios: `rounded-ds` (8) chico · `rounded-ds-lg` (16) card · `rounded-full` (chips/pills). Sombras: `shadow-ds-01/02/03`.

## 6. Estados de carga y vacío (obligatorios)

- **Carga**: `DataTable` con `loading` (ya pinta skeleton). Fuera de tabla: `@/components/ui/Skeleton` con la forma del contenido (nunca spinner suelto ni pantalla en blanco).
- **Vacío**: card centrada `bg-white rounded-ds-lg border border-ds-gray-200 p-10 text-center text-ds-gray-400` con mensaje claro.

## 7. Espaciado

- Entre bloques de una página: `space-y-5` (lo da `PageShell`).
- Dentro de una sección/card: `space-y-4`. Grids de filtros/tarjetas: `gap-3`.

## 8. Qué NO tocar

- **Lógica de datos, fetch, tipos, SQL**: no se toca. Esto es solo presentación/estructura visual.
- **Módulo Compras** (`app/(protected)/compras/*`, `components/compras/*`, `app/compras.css`, `.oc-scope`): tiene su propio DS scoped por ser portado. Se alinea **solo** el marco externo (PageShell/PageHeader) donde aplique; NO se re-skinnean sus componentes internos sin acuerdo explícito.
