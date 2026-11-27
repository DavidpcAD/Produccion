// LOS TRES FRENOS, EN ORDEN — lo que corren las rutas que postean en Business Central
// (recibir, registrar factura, facturar lo recibido) antes de llamar al codeunit.
//
//   1. encabezado (proveedor + lanzado)   → interruptor BC_FRENO_PROVEEDOR
//   2. líneas (que BC las tenga, con saldo) → interruptor BC_FRENO_REGISTRO
//   3. precio (precio, IVA y unidad)        → interruptor BC_FRENO_PRECIO
//
// Los interruptores son los mismos que usa la app de Proveeduría: con "0" en Azure se
// apaga un freno sin desplegar, porque si diera un falso positivo Bodega no podría
// recibir un camión. BC_FRENO_PROVEEDOR es el mismo del freno de lanzamiento.
//
// Lecturas a BC: el codeunit se lee UNA vez y sirve para el encabezado y, si la API
// custom no contesta, también para las líneas; las líneas se leen UNA vez y sirven
// para el freno de líneas y el de precio. La lógica de cada freno es pura y está en
// freno-registro.ts.
//
// Falla ABIERTO: si BC o la base no contestan, no se frena. Se frena solo cuando BC
// contestó y dijo algo que no cuadra.
import { getOrden } from "./repo";
import { money } from "./helpers";
import { bcEstadoPedido, bcLineasPedido, bcPedidoPorCodeunit, estadoDesdeStatusCodeunit, type EstadoPedidoBc, type PedidoCodeunitBc } from "./bc";
import { frenoProveedorActivo } from "./freno-lanzamiento";
import {
  cotejoEncabezado, diferenciasAlPostear, frenoEncabezado409, frenoLineas409, frenoPrecio409,
  lineasNoPosteables, lineasOrdenParaCotejo,
  type AccionRegistro, type EncabezadoLeido, type Freno409, type LineaPedida,
} from "./freno-registro";
import type { Orden } from "./types";

const encendido = (nombre: string) => {
  const v = (process.env[nombre] ?? "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "no");
};
export const frenoRegistroActivo = () => encendido("BC_FRENO_REGISTRO");
export const frenoPrecioActivo = () => encendido("BC_FRENO_PRECIO");

// La orden se lee de la BASE por `ordenId`: el proveedor y los precios contra los que
// se compara no pueden venir del navegador. Sin `ordenId` (un cliente viejo) no hay
// orden, y el freno de proveedor y el de precio no aplican, como antes.
async function ordenDe(ordenId: unknown): Promise<Orden | null> {
  const id = Number(ordenId ?? 0);
  if (!(id > 0)) return null;
  try { return await getOrden(id); } catch { return null; }
}

// El estado de la API v2.0 en el idioma del codeunit. OJO: allá "Open" es LANZADO y
// el abierto se llama "Draft". Lo que no se reconoce queda "desconocido", que no frena.
function estadoDeApiV2(status?: string): EstadoPedidoBc {
  const n = String(status ?? "").replace(/_x0020_/g, " ").trim().toLowerCase();
  if (n === "open" || n === "released") return "lanzado";
  if (n.includes("review") || n.includes("approval")) return "pendiente_aprobacion";
  if (n === "draft") return "abierto";
  return "desconocido";
}

// El encabezado: primero lo que dijo el codeunit; si no trajo el estado o el
// proveedor, se le pregunta a la API v2.0 (una lectura más, solo en ese caso).
async function leerEncabezado(orderNo: string, cu: PedidoCodeunitBc | null): Promise<EncabezadoLeido> {
  let estado = estadoDesdeStatusCodeunit(cu?.status);
  let vendorNo = cu?.vendorNo;
  if (estado === "desconocido" || !vendorNo) {
    const est = await bcEstadoPedido(orderNo).catch(() => null);
    if (est && !est.desconocido && est.existe) {
      if (estado === "desconocido") estado = estadoDeApiV2(est.status);
      vendorNo = vendorNo || est.vendorNo;
    }
  }
  if (estado === "desconocido" && !vendorNo) return null;
  return { estado, vendorNo };
}

function lineasDelBody(lineas: unknown): LineaPedida[] {
  if (!Array.isArray(lineas)) return [];
  return lineas
    .map((x: unknown) => {
      const l = (x ?? {}) as Record<string, unknown>;
      return {
        itemNo: String(l.itemNo ?? "").trim(),
        qty: Number(l.qty) || 0,
        variantCode: l.variantCode ? String(l.variantCode) : undefined,
        tipo: l.tipo ? String(l.tipo) : undefined,
      };
    })
    .filter((l) => l.itemNo && l.qty > 0);
}

/** Corre los tres frenos. Devuelve el cuerpo del 409 si alguno frena, o `null` si se
 *  puede postear. Nunca escribe en BC. */
export async function frenarAntesDePostear(opts: {
  orderNo: unknown; ordenId: unknown; lineas: unknown; accion: AccionRegistro;
}): Promise<Freno409 | null> {
  const orderNo = String(opts.orderNo ?? "").trim();
  if (!orderNo) return null;
  const { accion } = opts;
  const pedidas = lineasDelBody(opts.lineas);
  const orden = await ordenDe(opts.ordenId);

  // 1 — ENCABEZADO. Va primero porque es lo más caro de deshacer: una factura cargada
  // al proveedor equivocado solo se anula con nota de crédito.
  let cu: PedidoCodeunitBc | null | undefined;   // undefined = no se leyó
  if (frenoProveedorActivo()) {
    cu = await bcPedidoPorCodeunit(orderNo).catch(() => null);
    const enc = await leerEncabezado(orderNo, cu).catch(() => null);
    const esperado = String(orden?.proveedorNo ?? orden?.proveedorId ?? "");
    const freno = frenoEncabezado409(accion, cotejoEncabezado(orderNo, enc, esperado));
    if (freno) return freno;
  }

  const lineasOn = frenoRegistroActivo();
  const precioOn = frenoPrecioActivo() && !!orden?.lineas?.length;
  if (!pedidas.length || (!lineasOn && !precioOn)) return null;
  // Una sola lectura para los dos frenos que siguen. Sin lectura no se frena.
  const bc = await bcLineasPedido(orderNo, cu).catch(() => null);
  if (!bc?.lineas.length) return null;

  // 2 — LÍNEAS. El codeunit se salta en silencio la línea que no calza y devuelve el
  // N.º del documento igual.
  if (lineasOn) {
    const modo = accion === "facturar" ? "facturar-recibido" : "recibir";
    const freno = frenoLineas409(accion, orderNo, lineasNoPosteables(orderNo, bc, pedidas, modo));
    if (freno) return freno;
  }

  // 3 — PRECIO. BC factura con lo que tenga la línea del pedido, no con lo de la orden.
  if (precioOn && orden) {
    try {
      const plata = (n: number) => money(n, orden.currencyCode);
      const difs = diferenciasAlPostear(lineasOrdenParaCotejo(orden.lineas), bc.lineas, pedidas, plata);
      const freno = frenoPrecio409(accion, orderNo, difs, plata);
      if (freno) return freno;
    } catch { /* el freno nunca tumba un registro por su cuenta */ }
  }
  return null;
}
