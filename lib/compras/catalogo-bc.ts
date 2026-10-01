'use client';

// ─── Los maestros de BC, UNA sola vez por pestaña ────────────────────────────
//
// Las pantallas de Compras necesitan los mismos cuatro catálogos de Business
// Central —artículos, proveedores, obras y almacenes— y cada una hacía su
// propio `fetch`. El de artículos lo piden SIETE (plantillas, planificación,
// inventarios, el editor de orden, la compra directa, "nueva orden" y el panel
// de nueva solicitud) y son 863 KB crudos, 119 KB por el cable, cada vez.
// Bastaba con moverse entre dos pantallas de Compras para volver a bajarlo
// todo.
//
// En una tableta de obra eso es la diferencia entre que el buscador abra de una
// o se quede pensando.
//
// Se guarda a nivel de MÓDULO: vive mientras viva la pestaña y sobrevive a la
// navegación del app (que no recarga la página). El TTL es el mismo 5 min que
// usa el servidor para armarlos (ver `bcItems` en lib/compras/bc.ts), así que
// no agrega retraso sobre lo que ya había.
//
// Los errores NO se guardan: si BC falló, la próxima pantalla vuelve a probar.
// Una respuesta VACÍA tampoco: es el síntoma de que BC contestó mal, y dejarla
// pegada 5 min impediría que nadie se recuperara.

export interface ItemBc {
  id: string;
  code: string;
  descripcion: string;
  unidad: string;
  unidadCompra?: string;
  tipo?: 'inventario' | 'servicio' | 'no-inventario';
  lastDirectCost?: number;
  categoria?: string;
  reorderPoint?: number;
  safetyStock?: number;
  reorderQty?: number;
}

export interface CatalogoBc {
  items: ItemBc[];
  /** Códigos bloqueados para compras (ver `bcItemsBloqueados`). */
  bloqueados: string[];
}

// Las formas son las que devuelven las rutas, verificadas contra el Sandbox.
// Ojo que NO son uniformes entre sí: el proveedor trae `code` y la obra
// `codigo`; el almacén no trae id.
export interface ProveedorBc { id: string; code: string; nombre: string; currencyCode: string }
export interface ObraBc {
  id: string;
  codigo: string;
  nombre: string;
  /** BC: Job.Blocked = "All". En el Sandbox son 59 de 134, así que esto NO es un
   *  caso raro: la pantalla que arme un pedido tiene que mirarlo. */
  bloqueada?: boolean;
}
export interface AlmacenBc { codigo: string; nombre: string }

const TTL_MS = 5 * 60_000;

type Entrada<T> = { cache: { data: T; exp: number } | null; enVuelo: Promise<T> | null };
const guardado: Record<string, Entrada<unknown>> = {};

/** Pide una vez, reparte a todos, y vuelve a pedir cuando vence (o cuando falló).
 *  `vacio` dice si lo que llegó es "nada útil"; eso no se guarda. */
function unaVez<T>(clave: string, url: string, armar: (d: Record<string, unknown>) => T, vacio: (v: T) => boolean): Promise<T> {
  const e = (guardado[clave] ??= { cache: null, enVuelo: null }) as Entrada<T>;
  if (e.cache && e.cache.exp > Date.now()) return Promise.resolve(e.cache.data);
  if (e.enVuelo) return e.enVuelo;
  e.enVuelo = (async () => {
    const r = await fetch(url);
    const d = await r.json().catch(() => ({}));
    // Se conserva el mensaje del servidor: la pantalla de plantillas lo muestra.
    if (!r.ok) throw new Error((d as { error?: string })?.error || `HTTP ${r.status}`);
    return armar(d as Record<string, unknown>);
  })()
    .then((data) => {
      if (!vacio(data)) e.cache = { data, exp: Date.now() + TTL_MS };
      return data;
    })
    .finally(() => { e.enVuelo = null; });
  return e.enVuelo;
}

const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** El catálogo de artículos de BC. Tira el error del servidor si la consulta
 *  falla — cada pantalla decide qué hacer con él. */
export function getCatalogoBc(): Promise<CatalogoBc> {
  return unaVez<CatalogoBc>('items', '/api/compras/bc/items',
    (d) => ({ items: lista<ItemBc>(d.items), bloqueados: lista<string>(d.bloqueados) }),
    (v) => v.items.length === 0);
}

/** Proveedores de BC (~78 KB). */
export function getProveedoresBc(): Promise<ProveedorBc[]> {
  return unaVez<ProveedorBc[]>('vendors', '/api/compras/bc/vendors',
    (d) => lista<ProveedorBc>(d.proveedores), (v) => v.length === 0);
}

/** Obras (jobs) de BC. */
export function getObrasBc(): Promise<ObraBc[]> {
  return unaVez<ObraBc[]>('obras', '/api/compras/bc/obras',
    (d) => lista<ObraBc>(d.obras), (v) => v.length === 0);
}

/** Almacenes (locations) de BC. */
export function getAlmacenesBc(): Promise<AlmacenBc[]> {
  return unaVez<AlmacenBc[]>('almacenes', '/api/compras/bc/almacenes',
    (d) => lista<AlmacenBc>(d.almacenes), (v) => v.length === 0);
}
