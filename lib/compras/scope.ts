import { ordenesDeMisPedidos, pedidoEsDelUsuario, type Sesion } from "./helpers";
import type { Movimiento, Orden, Pedido, Recepcion } from "./types";

// ─── Lo que la API entrega, recortado a quien pregunta ───────────────────────
//
// Las cuatro listas de Compras salían enteras para todo el mundo: `bootstrap`
// devolvía TODOS los pedidos y TODAS las órdenes —con sus precios, proveedores y
// obras— a cualquiera con acceso al módulo. El recorte existía, pero vivía en la
// pantalla (`veTodoEnCompras`, `pedidoEsDelUsuario`): el que abriera las
// herramientas del navegador, o pegara la URL de la API, veía el resto igual.
//
// Acá se aplica el MISMO criterio, en el servidor y antes de responder. Se reusan
// los helpers de la pantalla a propósito: si el servidor recortara con una regla
// propia y la pantalla filtrara con otra, cualquier diferencia entre las dos se
// vería como datos que faltan.
//
// Solo se recorta a quien tiene alcance `mis-solicitudes` (ver lib/compras/guard.ts):
// Administración·Digitación y Administración·Locales, cuya única pantalla ya les
// muestra nada más lo suyo. Para el resto no cambia nada.

export interface ListasCompras {
  pedidos: Pedido[];
  ordenes: Orden[];
  recepciones: Recepcion[];
  movimientos: Movimiento[];
}

/**
 * Deja solo las solicitudes de esta persona y lo que cuelga de ellas.
 *
 * El orden importa: primero los pedidos, porque las órdenes se encuentran por el
 * enlace de LÍNEA (`pedidoLineaId`, con `pedidoNumero` de respaldo), las
 * recepciones cuelgan de la orden y la bitácora del documento. Lo que no alcanza
 * ninguno de esos hilos no es de esta persona y no viaja.
 */
export function recortarAMisSolicitudes(todo: ListasCompras, me: Sesion): ListasCompras {
  const pedidos = todo.pedidos.filter((p) => pedidoEsDelUsuario(p, me));
  const ordenes = ordenesDeMisPedidos(todo.ordenes, pedidos, me);

  const idsPedido = new Set(pedidos.map((p) => p.id));
  const idsOrden = new Set(ordenes.map((o) => o.id));

  const recepciones = todo.recepciones.filter((r) => idsOrden.has(r.ordenId));
  const idsRecepcion = new Set(recepciones.map((r) => r.id));

  // `listMovimientosResumen` hoy solo trae filas de pedido y de orden, pero la
  // bitácora también registra recepciones: se contempla para que agregar esa
  // consulta mañana no abra un hueco por descuido.
  const movimientos = todo.movimientos.filter((m) =>
    m.entidad === "pedido" ? idsPedido.has(m.idEntidad)
    : m.entidad === "orden" ? idsOrden.has(m.idEntidad)
    : m.entidad === "recepcion" ? idsRecepcion.has(m.idEntidad)
    : false,
  );

  return { pedidos, ordenes, recepciones, movimientos };
}

/** ¿Alguna de estas órdenes salió de un pedido de esta persona? Es lo que decide
 *  si puede abrir el detalle de UNA orden. */
export function ordenEsDeMisPedidos(orden: Orden, pedidos: Pedido[], me: Sesion): boolean {
  return ordenesDeMisPedidos([orden], pedidos, me).length > 0;
}
