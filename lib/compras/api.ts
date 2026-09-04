// Cliente del front-end para las API routes (modo API).
import type { Movimiento, Orden, Pedido, Recepcion, NotaCreditoLinea } from "./types";

export const USE_API = process.env.NEXT_PUBLIC_USE_API === "1";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface Bootstrap {
  pedidos: Pedido[];
  ordenes: Orden[];
  recepciones: Recepcion[];
  movimientos: Movimiento[];
}

// Resultado de poner el estado de las órdenes al día con BC (ver
// /api/compras/ordenes/sincronizar-bc). `estados` es lo que BC dijo de cada orden
// consultada; `corregidas`, las que cambiaron de estado acá por eso.
export type EstadoBcOrden = "lanzado" | "abierto" | "pendiente_aprobacion" | "inexistente" | "desconocido";
export interface SincronizacionBc {
  ok: boolean;
  desconocido?: boolean;   // no se pudo leer BC: no se afirmó nada
  revisadas: number;
  corregidas: { id: string; numero: string; bcNumber: string; de: string; a: string; bcEstado: EstadoBcOrden }[];
  estados: Record<string, EstadoBcOrden>;
}

export const api = {
  bootstrap: (): Promise<Bootstrap> => fetch("/api/compras/bootstrap").then(jsonOrThrow),

  createPedido: (body: unknown): Promise<{ idPedidoCompra: number }> =>
    fetch("/api/compras/pedidos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  getPedido: (id: string): Promise<Pedido> => fetch(`/api/compras/pedidos/${id}`).then(jsonOrThrow),
  patchPedidoEstado: (id: string, body: unknown) =>
    fetch(`/api/compras/pedidos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  devolverLineasPedido: (id: string, body: unknown) =>
    fetch(`/api/compras/pedidos/${id}/devolver-lineas`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  putPedido: (id: string, body: unknown) =>
    fetch(`/api/compras/pedidos/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  deletePedido: (id: string, body: unknown) =>
    fetch(`/api/compras/pedidos/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),

  createOrden: (body: unknown): Promise<{ idOrdenCompra: number }> =>
    fetch("/api/compras/ordenes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  getOrden: (id: string): Promise<Orden> => fetch(`/api/compras/ordenes/${id}`).then(jsonOrThrow),
  patchOrdenEstado: (id: string, body: unknown) =>
    fetch(`/api/compras/ordenes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  // El estado de la orden sigue al del pedido en BC. Sin `ids` revisa todas las que
  // puedan estar desalineadas (una sola lectura de BC).
  sincronizarBc: (body: { ids?: string[]; usuario: string; rol: string }): Promise<SincronizacionBc> =>
    fetch("/api/compras/ordenes/sincronizar-bc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),

  createRecepcion: (body: unknown): Promise<{ idRecepcionCompra: number }> =>
    fetch("/api/compras/recepciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),

  // MODO 2: registrar la factura de una recepción que estaba en revisión.
  setRecepcionFactura: (id: string, body: unknown): Promise<{ ok: true }> =>
    fetch(`/api/compras/recepciones/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),

  // Notas de crédito (líneas de factura con problema, para emitir NC).
  createNotasCredito: (body: unknown): Promise<{ ok: true }> =>
    fetch("/api/compras/notas-credito", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  listNotasCredito: (): Promise<NotaCreditoLinea[]> =>
    fetch("/api/compras/notas-credito").then(jsonOrThrow).then((d) => (d.notas ?? []) as NotaCreditoLinea[]),
};
