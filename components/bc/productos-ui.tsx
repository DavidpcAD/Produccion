'use client';
// Piezas compartidas entre "Crear producto" (/bc/productos/nuevo) y la ficha para
// editar / bloquear un producto de BC (components/bc/ficha-producto.tsx): las
// etiquetas de tipo y de bloqueado, y las opciones de los combos.
import type { ComboOption } from '@/components/ui/Combobox';
import type { CategoriaBc, OpcionesProducto, TipoProducto } from '@/lib/bc/productos';

export const TIPO_LABEL: Record<TipoProducto, string> = { inventario: 'Inventario', servicio: 'Servicio', 'no-inventario': 'Fuera de inventario' };
const TIPO_BADGE: Record<TipoProducto, string> = {
  inventario: 'bg-ds-green-soft text-ds-green-ink',
  servicio: 'bg-ds-yellow-soft text-ds-yellow-ink',
  'no-inventario': 'bg-ds-gray-100 text-ds-gray-500',
};

export function BadgeTipo({ tipo }: { tipo: TipoProducto }) {
  return (
    <span className={`inline-flex items-center rounded-ds px-2 py-0.5 text-label font-medium whitespace-nowrap ${TIPO_BADGE[tipo]}`}>
      {TIPO_LABEL[tipo]}
    </span>
  );
}

export function BadgeBloqueado() {
  return (
    <span className="inline-flex items-center rounded-ds px-2 py-0.5 text-label font-medium whitespace-nowrap bg-ds-red-soft text-ds-red-ink">
      Bloqueado
    </span>
  );
}

/** "hace 5 min", "hoy 14:16", "08/11/2026" — para decir cuándo se tocó algo en BC. */
export function cuandoFue(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const d = new Date(t);
  const hoy = new Date();
  const hora = d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
  return `${d.toLocaleDateString('es-CR')} ${hora}`;
}

/** Las opciones de los cuatro combos del formulario de producto. */
export function combosProducto(opciones: OpcionesProducto | null | undefined) {
  const categorias: CategoriaBc[] = opciones?.categorias ?? [];
  const raices = categorias.filter((c) => !c.padre).sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
  const hijos = (code: string) => categorias.filter((c) => c.padre === code).sort((a, b) => a.code.localeCompare(b.code, 'es'));
  const opcion = (c: CategoriaBc, padre: string): ComboOption => ({
    value: c.code,
    label: c.code,
    parts: [
      { text: c.code, weight: 'bold' },
      ...(c.nombre && c.nombre !== c.code ? [{ text: c.nombre, weight: 'normal' as const }] : []),
      { text: padre || 'categoría general', weight: 'light' },
    ],
    search: `${c.code} ${c.nombre} ${padre}`,
  });
  const categoria: ComboOption[] = [];
  // Cada familia con sus hojas y al final la familia misma (como el árbol de BC).
  for (const r of raices) {
    for (const h of hijos(r.code)) categoria.push(opcion(h, r.code));
    categoria.push(opcion(r, ''));
  }
  // Por si alguna categoría cuelga de un padre que no vino en la lista.
  for (const c of categorias) if (c.padre && !categorias.some((r) => r.code === c.padre)) categoria.push(opcion(c, c.padre));

  const unidad: ComboOption[] = (opciones?.unidades ?? []).map((u) => ({
    value: u.code, label: u.code,
    parts: [{ text: u.code, weight: 'bold' }, ...(u.nombre && u.nombre !== u.code ? [{ text: u.nombre, weight: 'light' as const }] : [])],
    search: `${u.code} ${u.nombre}`,
  }));

  const grupoProducto: ComboOption[] = (opciones?.gruposProducto ?? []).map((g) => ({
    value: g.code, label: g.code,
    parts: [{ text: g.code, weight: 'bold' }, ...(g.nombre && g.nombre !== g.code ? [{ text: g.nombre, weight: 'normal' as const }] : []), ...(g.iva ? [{ text: g.iva, weight: 'light' as const }] : [])],
    search: `${g.code} ${g.nombre} ${g.iva}`,
  }));

  const grupoInventario: ComboOption[] = (opciones?.gruposInventario ?? []).map((g) => ({
    value: g.code, label: g.code,
    parts: [{ text: g.code, weight: 'bold' }, ...(g.nombre ? [{ text: g.nombre, weight: 'light' as const }] : [])],
    search: `${g.code} ${g.nombre}`,
  }));

  return { categoria, unidad, grupoProducto, grupoInventario };
}
