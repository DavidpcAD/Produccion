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

// ── Huella del bootstrap, en memoria ────────────────────────────────────────
// El store vuelve a pedir el bootstrap cada 20 s mientras la pestaña está a la
// vista (REFRESCO_MS en store.tsx), para enterarse de lo que crea Proveeduría en
// la base compartida. Entre dos tics casi nunca cambió nada, y en AdelantePRO
// eso son ~5 MB (~500 KB comprimidos) bajados 180 veces por hora para recibir
// exactamente lo mismo.
//
// El servidor manda una huella del cuerpo (`ETag`, ver lib/http/json-comprimido.ts).
// Acá se guarda y se devuelve en `If-None-Match`: si no cambió nada contesta 304
// SIN cuerpo y `bootstrap()` devuelve `null`, que el store entiende como "lo que
// hay en pantalla sigue vigente" y ni siquiera vuelve a parsear.
//
// La huella va en memoria y a mano, no por la caché del navegador: así la
// respuesta puede seguir siendo `no-store` y no quedan precios ni proveedores
// guardados en el disco de una tableta de obra.
//
// Es imposible que quede vieja: la huella se calcula sobre el cuerpo real, así
// que cualquier cambio en los datos da una huella distinta y vuelve un 200.
let etagBootstrap: string | null = null;

export const api = {
  /** `null` = el servidor contestó 304: no cambió nada desde la última vez.
   *
   *  `condicional: false` pide el cuerpo ENTERO aunque haya huella. Lo usa quien
   *  todavía no tiene los datos: la huella vive en el módulo y sobrevive a que el
   *  store se desmonte (salir de Compras y volver), así que un store recién
   *  montado preguntaba "¿cambió algo?" con las listas VACÍAS, el servidor le
   *  contestaba 304 y se quedaba sin pedidos para siempre — en Aprobación la cola
   *  pintaba las órdenes igual, y lo único que se notaba era que la solicitud de
   *  origen decía "no está disponible". */
  bootstrap: async (opts?: { condicional?: boolean }): Promise<Bootstrap | null> => {
    const huella = opts?.condicional === false ? null : etagBootstrap;
    const res = await fetch("/api/compras/bootstrap", {
      headers: huella ? { "If-None-Match": huella } : undefined,
      cache: "no-store",
    });
    if (res.status === 304) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    etagBootstrap = res.headers.get("etag");
    return res.json();
  },
  /** Primera carga de Aprobación: solo la cola de pendientes, para pintar ya. Si el
   *  servidor no la pudo recortar (alcance "mis solicitudes"), viene sin `parcial`. */
  bootstrapCola: (): Promise<{ ordenes?: Orden[]; parcial?: boolean }> =>
    fetch("/api/compras/bootstrap?parte=cola").then(jsonOrThrow),

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
  /** Subcontrato: pedido + orden se corrigen juntos (los montos viven en la orden). */
  putSubcontrato: (id: string, body: unknown) =>
    fetch(`/api/compras/pedidos/${id}/subcontrato`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),

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

  /** La traza (bitácora) de UN documento. La carga inicial solo trae el resumen que
   *  necesitan las listas; el historial completo lo pide la pantalla de detalle. */
  movimientos: (entidad: string, id: string): Promise<Movimiento[]> =>
    fetch(`/api/compras/movimientos?entidad=${encodeURIComponent(entidad)}&id=${encodeURIComponent(id)}`).then(jsonOrThrow),

  // Notas de crédito (líneas de factura con problema, para emitir NC).
  createNotasCredito: (body: unknown): Promise<{ ok: true }> =>
    fetch("/api/compras/notas-credito", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(jsonOrThrow),
  listNotasCredito: (): Promise<NotaCreditoLinea[]> =>
    fetch("/api/compras/notas-credito").then(jsonOrThrow).then((d) => (d.notas ?? []) as NotaCreditoLinea[]),
};
