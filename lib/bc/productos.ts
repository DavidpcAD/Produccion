// Crear productos (artículos / Item) en Business Central desde el presupuestista.
// Lo que sirve en el cliente Y en el servidor: tipos, reglas del código y la
// numeración sugerida. Las llamadas a BC viven en lib/compras/bc.ts
// (bcOpcionesProducto, bcNumerosProductos, bcCrearProducto).
//
// ─── Cómo se numeran los productos en BC (medido en Production, 10/11/2026) ───
// El código es <letra><familia>-<consecutivo de 4 dígitos>:
//   · la familia es el número de la categoría RAÍZ: 01.METALES → 01, 02.BAÑOS → 02…
//     (las categorías de BC son de dos niveles: raíz "01.METALES" → hoja "ALAMBRES_MALLAS")
//   · la letra es S para los servicios y M para todo lo demás (inventario y
//     no inventariable): M13-0179 TUBO SDR41, S24-0001 SUBCONTRATO…
// De 5.839 artículos con categoría, 5.773 (98,9 %) siguen la regla; los otros 66
// son históricos mal clasificados. Por eso el código se SUGIERE y se puede editar.

export type TipoProducto = 'inventario' | 'servicio' | 'no-inventario';

/** El valor que espera la API v2.0 de BC en `type`. */
export const TIPO_BC: Record<TipoProducto, string> = {
  inventario: 'Inventory',
  servicio: 'Service',
  'no-inventario': 'Non-Inventory',
};

export const TIPOS_PRODUCTO: { tipo: TipoProducto; label: string; ayuda: string }[] = [
  { tipo: 'inventario', label: 'Inventario', ayuda: 'Material que entra a bodega y lleva existencias.' },
  { tipo: 'servicio', label: 'Servicio', ayuda: 'Subcontratos, alquileres, mantenimientos: no lleva existencias.' },
  { tipo: 'no-inventario', label: 'Fuera de inventario', ayuda: 'Se compra pero no se controla en bodega.' },
];

/** Grupo contable de producto por defecto según el tipo: es lo que usan casi
 *  todos los artículos de BC (5.765 de inventario en BIENES, 112 servicios en
 *  SERVICIOS, 12 no inventariables en SUMINISTROS). */
export const GRUPO_PRODUCTO_POR_TIPO: Record<TipoProducto, string> = {
  inventario: 'BIENES',
  servicio: 'SERVICIOS',
  'no-inventario': 'SUMINISTROS',
};
/** Grupo de registro de inventario por defecto (5.432 de 5.765 artículos de inventario). */
export const GRUPO_INVENTARIO_DEFECTO = 'MATERIALES';

/** Largos de los campos en la tabla Item de BC. */
export const MAX_NUMERO = 20;       // No.          Code[20]
export const MAX_DESCRIPCION = 100; // Description  Text[100]

export interface CategoriaBc { code: string; nombre: string; padre: string }
export interface UnidadBc { code: string; nombre: string }
export interface GrupoProductoBc { code: string; nombre: string; iva: string }
export interface GrupoInventarioBc { code: string; nombre: string }
export interface OpcionesProducto {
  unidades: UnidadBc[];
  gruposProducto: GrupoProductoBc[];
  gruposInventario: GrupoInventarioBc[];
  categorias: CategoriaBc[];
}

export interface NuevoProducto {
  numero: string;
  descripcion: string;
  tipo: TipoProducto;
  categoria: string;
  unidad: string;
  grupoProducto: string;
  /** Solo para inventario (BC lo exige ahí y no lo usa en servicio / fuera de inventario). */
  grupoInventario?: string;
  /** Precio de venta (Unit Price). Opcional. */
  precio?: number;
}

/** Normaliza un código de BC: mayúsculas y sin espacios en los bordes. */
export const normalizarNumero = (s: string) => String(s ?? '').trim().toUpperCase();

/** La categoría raíz de una categoría (las de BC son de dos niveles). */
export function raizDeCategoria(code: string, categorias: CategoriaBc[]): string {
  const porCodigo = new Map(categorias.map((c) => [c.code, c]));
  let cur = porCodigo.get(code);
  let guard = 0;
  while (cur?.padre && guard++ < 10) {
    const p = porCodigo.get(cur.padre);
    if (!p) return cur.padre;
    cur = p;
  }
  return cur?.code ?? code;
}

/** "01.METALES" → "01". `null` si la raíz no empieza con número. */
export function familiaDeRaiz(raiz: string): string | null {
  const m = String(raiz ?? '').match(/^(\d{1,2})\./);
  return m ? m[1].padStart(2, '0') : null;
}

/** Prefijo del código: M01, S24… `null` si la categoría no tiene familia numérica. */
export function prefijoDe(tipo: TipoProducto, categoria: string, categorias: CategoriaBc[]): string | null {
  const familia = familiaDeRaiz(raizDeCategoria(categoria, categorias));
  if (!familia) return null;
  return `${tipo === 'servicio' ? 'S' : 'M'}${familia}`;
}

/** Desde acá empiezan las series aparte: M09 tiene la serie normal 0001-0310 y
 *  una serie 5001-5056 de madera "(AD)". El siguiente de M09 es el 0311, no el 5057. */
const SERIE_APARTE = 5000;

/**
 * El siguiente código libre de cada prefijo (M01 → "M01-0265"): el último usado de
 * la familia + 1, como haría una serie de BC, sin contar las series aparte (≥ 5000)
 * y saltando los que ya existan. Ojo que hay familias con huecos grandes (M08 va de
 * 0001 a 0144 y sigue en 0787-0823): se toma el último, 0824.
 * `numeros` tiene que traer TODOS los códigos de BC, bloqueados incluidos: un
 * bloqueado también ocupa su número.
 */
export function siguientesNumeros(numeros: Iterable<string>): Record<string, string> {
  const porPrefijo = new Map<string, number[]>();
  const existentes = new Set<string>();
  for (const raw of numeros) {
    const n = normalizarNumero(raw);
    existentes.add(n);
    const m = n.match(/^([A-Z]\d{2})-(\d{4})$/);
    if (!m) continue;
    const lista = porPrefijo.get(m[1]) ?? [];
    lista.push(Number(m[2]));
    porPrefijo.set(m[1], lista);
  }
  const out: Record<string, string> = {};
  for (const [prefijo, lista] of porPrefijo) {
    const normales = lista.filter((n) => n < SERIE_APARTE);
    let sig = Math.max(...(normales.length ? normales : lista)) + 1;
    while (existentes.has(`${prefijo}-${String(sig).padStart(4, '0')}`) && sig < 9999) sig++;
    out[prefijo] = `${prefijo}-${String(sig).padStart(4, '0')}`;
  }
  return out;
}

/** El código sugerido para un prefijo que todavía no tiene ningún artículo. */
export const primerNumero = (prefijo: string) => `${prefijo}-0001`;

/** Valida lo que llega del formulario. Devuelve el primer problema o null. */
export function validarNuevoProducto(p: Partial<NuevoProducto>, opciones?: OpcionesProducto): string | null {
  const numero = normalizarNumero(p.numero ?? '');
  const descripcion = String(p.descripcion ?? '').trim();
  if (!numero) return 'Falta el Nº del producto.';
  if (numero.length > MAX_NUMERO) return `El Nº no puede pasar de ${MAX_NUMERO} caracteres.`;
  if (!/^[A-Z0-9][A-Z0-9._\-/]*$/.test(numero)) return 'El Nº solo lleva letras, números, guion, punto, barra o guion bajo (sin espacios).';
  if (!descripcion) return 'Falta la descripción.';
  if (descripcion.length > MAX_DESCRIPCION) return `La descripción no puede pasar de ${MAX_DESCRIPCION} caracteres.`;
  if (!p.tipo || !(p.tipo in TIPO_BC)) return 'Elegí el tipo de producto.';
  if (!p.categoria) return 'Elegí la categoría del producto.';
  if (!p.unidad) return 'Elegí la unidad de medida base.';
  if (!p.grupoProducto) return 'Elegí el grupo contable de producto.';
  if (p.tipo === 'inventario' && !p.grupoInventario) return 'Elegí el grupo de registro de inventario.';
  if (p.precio != null && (!Number.isFinite(p.precio) || p.precio < 0)) return 'El precio de venta tiene que ser un número mayor o igual a cero.';
  if (opciones) {
    if (!opciones.categorias.some((c) => c.code === p.categoria)) return `La categoría ${p.categoria} no existe en Business Central.`;
    if (!opciones.unidades.some((u) => u.code === p.unidad)) return `La unidad ${p.unidad} no existe en Business Central.`;
    if (!opciones.gruposProducto.some((g) => g.code === p.grupoProducto)) return `El grupo contable ${p.grupoProducto} no existe en Business Central.`;
    if (p.tipo === 'inventario' && !opciones.gruposInventario.some((g) => g.code === p.grupoInventario)) return `El grupo de inventario ${p.grupoInventario} no existe en Business Central.`;
  }
  return null;
}
