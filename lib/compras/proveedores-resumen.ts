import { esLineaRecibible, numeroOrden } from "./helpers";
import type { Orden, Proveedor } from "./types";

// Lo pedido vs. lo entregado, agrupado por proveedor. Vivía dentro del Dashboard de
// Proveeduría; salió acá cuando el Resumen de Órdenes de compra empezó a necesitar lo
// mismo para el ranking "a quién hay que corretearle". Un solo cálculo, una sola
// verdad: dos pantallas que dicen dos números para lo mismo es como se empieza a
// desconfiar de un tablero.
//
// Portado de proveeduria.adelante.cr (`lib/compras-proveedores.ts`).

// Importe de una línea (pedido) y su parte recibida. Sin IVA y con el descuento
// aplicado, igual que la columna "Total sin IVA" de la lista de órdenes.
const impPedido = (l: { cantidad: number; precioUnitario: number; descuentoPct?: number }) =>
  l.cantidad * l.precioUnitario * (1 - (l.descuentoPct ?? 0) / 100);
const impRecibido = (l: { cantidadRecibida: number; precioUnitario: number; descuentoPct?: number }) =>
  (l.cantidadRecibida ?? 0) * l.precioUnitario * (1 - (l.descuentoPct ?? 0) / 100);

export type LineaProv = {
  orden: string; estado: string; code: string; desc: string; unidad: string;
  cantidad: number; recibida: number; pendiente: number; monto: number;
};

export type FilaProv = {
  proveedorId: string; nombre: string; currency: string;
  nOrdenes: number; pedido: number; recibido: number; pendiente: number; pct: number;
  lineas: LineaProv[];
  /** Fecha de la orden MÁS VIEJA que todavía le debe material. NO es "días tarde": la
   *  fecha de entrega esperada de BC es la que rellena el sistema con la de la orden,
   *  no una que el proveedor haya prometido, así que decir "361 días tarde" sería
   *  acusarlo de incumplir algo que nunca dijo. "Hace N días" sí es cierto y ordena. */
  desdeISO: string | null;
};

export type ResumenProv = {
  filas: FilaProv[];
  pedido: number;
  recibido: number;
  pendiente: number;
  pct: number;
};

export function resumenPorProveedor(ordenes: Orden[], proveedores: Proveedor[]): ResumenProv {
  const byProv = new Map<string, FilaProv>();
  for (const o of ordenes) {
    const prov = proveedores.find((p) => p.id === o.proveedorId);
    const nombre = o.proveedorNombre || prov?.nombre || o.proveedorId || "(sin proveedor)";
    const currency = o.currencyCode || prov?.currencyCode || "";
    // Agrupar por el MISMO proveedor aunque venga con distinto id (mock vs BC):
    // clave = código de proveedor si hay, si no el nombre normalizado. Así no se
    // repite "FERRETERIA EPA S.A" en dos filas.
    const key = (o.proveedorNo?.trim()) || nombre.trim().toUpperCase().replace(/\s+/g, " ");
    if (!byProv.has(key)) {
      byProv.set(key, { proveedorId: key, nombre, currency, nOrdenes: 0, pedido: 0, recibido: 0, pendiente: 0, pct: 0, lineas: [], desdeISO: null });
    }
    const r = byProv.get(key)!;
    r.nOrdenes += 1;
    // Solo cuenta para la antigüedad si esta orden todavía debe algo.
    const debe = o.lineas.some((l) => esLineaRecibible(l) && (l.cantidadRecibida ?? 0) < l.cantidad);
    if (debe && o.fecha && (!r.desdeISO || o.fecha < r.desdeISO)) r.desdeISO = o.fecha;
    for (const l of o.lineas) {
      if (!esLineaRecibible(l)) continue;
      const ped = impPedido(l);
      const rec = impRecibido(l);
      r.pedido += ped; r.recibido += rec;
      r.lineas.push({
        orden: numeroOrden(o), estado: o.estado,
        code: l.articuloId || "", desc: l.descripcion, unidad: l.unidad,
        cantidad: l.cantidad, recibida: l.cantidadRecibida ?? 0,
        pendiente: Math.max(0, l.cantidad - (l.cantidadRecibida ?? 0)), monto: ped,
      });
    }
  }

  const filas = [...byProv.values()].map((r) => {
    r.pendiente = Math.max(0, r.pedido - r.recibido);
    r.pct = r.pedido > 0 ? Math.round((r.recibido / r.pedido) * 100) : 0;
    return r;
  }).sort((a, b) => b.pendiente - a.pendiente);

  const pedido = filas.reduce((s, r) => s + r.pedido, 0);
  const recibido = filas.reduce((s, r) => s + r.recibido, 0);
  return {
    filas,
    pedido,
    recibido,
    pendiente: Math.max(0, pedido - recibido),
    pct: pedido > 0 ? Math.round((recibido / pedido) * 100) : 0,
  };
}
