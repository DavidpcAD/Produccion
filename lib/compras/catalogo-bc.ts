'use client';

// ─── El catálogo de BC, UNA sola vez por pestaña ─────────────────────────────
//
// Siete pantallas de Compras necesitan el catálogo de artículos y hasta ahora
// cada una hacía su propio `fetch("/api/compras/bc/items")`: la de plantillas,
// la de planificación, la de inventarios, el editor de orden, la compra directa,
// "nueva orden" y el panel de nueva solicitud. Son 863 KB crudos (119 KB por el
// cable) que se volvían a bajar al moverse entre pantallas — y dentro de una
// misma pantalla, dos veces, porque el panel de solicitud también lo pide.
//
// En una tableta de obra eso es la diferencia entre que el buscador abra de una
// o se quede pensando.
//
// Se guarda a nivel de MÓDULO: vive mientras viva la pestaña y sobrevive a la
// navegación del app (que no recarga la página). El TTL es el mismo 5 min que
// usa el servidor para armar el catálogo (ver `bcItems` en lib/compras/bc.ts),
// así que no agrega retraso sobre lo que ya había.
//
// Los errores NO se guardan: si BC falló, la próxima pantalla vuelve a probar.

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

const TTL_MS = 5 * 60_000;

let cache: { data: CatalogoBc; exp: number } | null = null;
let enVuelo: Promise<CatalogoBc> | null = null;

async function bajar(): Promise<CatalogoBc> {
  const r = await fetch('/api/compras/bc/items');
  const d = await r.json().catch(() => ({}));
  // Se conserva el mensaje del servidor: la pantalla de plantillas lo muestra.
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return {
    items: Array.isArray(d.items) ? d.items : [],
    bloqueados: Array.isArray(d.bloqueados) ? d.bloqueados : [],
  };
}

/** El catálogo de artículos de BC, compartido por toda la pestaña. Tira el error
 *  del servidor si la consulta falla — cada pantalla decide qué hacer con él. */
export function getCatalogoBc(): Promise<CatalogoBc> {
  if (cache && cache.exp > Date.now()) return Promise.resolve(cache.data);
  if (enVuelo) return enVuelo;
  enVuelo = bajar()
    .then((data) => {
      // Un catálogo vacío no se guarda: es el síntoma de que BC contestó mal, y
      // dejarlo pegado 5 min haría que ninguna pantalla pudiera recuperarse.
      if (data.items.length) cache = { data, exp: Date.now() + TTL_MS };
      return data;
    })
    .finally(() => { enVuelo = null; });
  return enVuelo;
}
