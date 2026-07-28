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

export const api = {
  bootstrap: (): Promise<Bootstrap> => fetch("/api/compras/bootstrap").then(jsonOrThrow),

  createPedido: (body: unknown): Promise<{ idPedidoCompra: number }> =>
    fetch("/api/compras/pedidos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  getPedido: (id: string): Promise<Pedido> => fetch(`/api/compras/pedidos/${id}`).then(jsonOrThrow),
  patchPedidoEstado: (id: string, body: unknown) =>
    fetch(`/api/compras/pedidos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  putPedido: (id: string, body: unknown) =>
    fetch(`/api/compras/pedidos/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  deletePedido: (id: string, body: unknown) =>
    fetch(`/api/compras/pedidos/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),

  createOrden: (body: unknown): Promise<{ idOrdenCompra: number }> =>
    fetch("/api/compras/ordenes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  getOrden: (id: string): Promise<Orden> => fetch(`/api/compras/ordenes/${id}`).then(jsonOrThrow),
  patchOrdenEstado: (id: string, body: unknown) =>
    fetch(`/api/compras/ordenes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),

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
