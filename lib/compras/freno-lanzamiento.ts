// FRENO DE LANZAMIENTO — que no se lance en Business Central un pedido que es de
// OTRO proveedor que el de la orden.
//
// Por qué. El pedido lo crea Proveeduría al enviar la orden a aprobación, con el
// proveedor que la orden tenía EN ESE MOMENTO. Si después le corrigen el proveedor,
// esa corrección tiene que volver a viajar a BC. Cuando no viaja (o falla), la orden
// dice una cosa y el pedido de BC dice otra, y nadie lo mira hasta que Bodega
// registra la factura — que es cuando ya cuesta una nota de crédito. Pasó tres
// veces: CP-005183, CP-005249 y CP-005289.
//
// Lanzar es la última puerta donde el pedido sigue Abierto y corregirlo es gratis.
// Esta es la única compuerta del circuito que no miraba el encabezado.
//
// Dos reglas que lo hacen un freno de verdad y no un adorno:
//
//   1. El proveedor esperado se lee de la BASE por `ordenId`, nunca de lo que mande
//      el navegador. Un guard que confía en el cliente no guarda nada.
//   2. Falla ABIERTO: si BC no contesta, no se frena. Trabar el lanzamiento por una
//      consulta que falló sería peor que el problema, y si BC está caído el release
//      tampoco va a entrar: el error sale por su propio camino.
//      Se frena SOLO cuando BC contestó y dijo otro proveedor.
import { getOrden } from "./repo";
import { bcEstadoPedido } from "./bc";

// Interruptor de emergencia: BC_FRENO_PROVEEDOR=0 en Azure lo apaga sin desplegar,
// igual que el freno equivalente de la app de compras.
export function frenoProveedorActivo(): boolean {
  const v = (process.env.BC_FRENO_PROVEEDOR ?? "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "no");
}

export type CotejoLanzar = {
  ok: boolean;
  verificado: boolean;      // false = no se pudo leer BC (no afirma nada)
  bcVendorNo?: string;
  mensaje?: string;
};

// La decisión, sin red: pura para poder razonarla aparte de las llamadas.
export function cotejoProveedorParaLanzar(
  orderNo: string,
  bcVendorNo: string | undefined,
  proveedorNoOrden: string,
): CotejoLanzar {
  const no = (orderNo ?? "").trim();
  const esperado = (proveedorNoOrden ?? "").trim();
  const enBc = (bcVendorNo ?? "").trim();
  // Sin pedido, sin proveedor esperado o sin lectura de BC no hay nada que afirmar.
  // `verificado:false` es eso: "no lo sé", que no es lo mismo que "está bien".
  if (!no || !esperado || !enBc) return { ok: true, verificado: false };
  if (enBc.toUpperCase() === esperado.toUpperCase()) {
    return { ok: true, verificado: true, bcVendorNo: enBc };
  }
  return {
    ok: false,
    verificado: true,
    bcVendorNo: enBc,
    mensaje:
      `NO se lanzó: el pedido ${no} en Business Central es del proveedor ${enBc}, `
      + `pero esta orden es de ${esperado}. Lanzarlo así deja la compra a nombre del `
      + `proveedor equivocado, y eso después solo se deshace con una nota de crédito.\n\n`
      + `Qué hacer: pedile a Proveeduría que reabra la orden y la vuelva a enviar a `
      + `aprobación. Al reenviarla, la app le corrige el proveedor al pedido en BC. `
      + `Después volvé a lanzar.`,
  };
}

export type FrenoLanzar409 = {
  ok: false; error: string; frenoProveedor: true; bcVendorNo?: string; proveedorOrden?: string;
};

// Devuelve null cuando se puede lanzar; si no, el cuerpo del 409 listo para responder.
export async function frenarLanzamiento(orderNo: unknown, ordenId: unknown): Promise<FrenoLanzar409 | null> {
  if (!frenoProveedorActivo()) return null;
  const id = Number(ordenId ?? 0);
  // Sin `ordenId` no hay proveedor esperado confiable (el body no cuenta) y el freno
  // no aplica: los llamadores viejos siguen funcionando igual que antes.
  if (!(id > 0)) return null;
  let esperado = "";
  try {
    const o = await getOrden(id);
    esperado = String(o?.proveedorNo ?? o?.proveedorId ?? "");
  } catch {
    return null; // la base no contestó: no se frena
  }
  if (!esperado) return null;
  const est = await bcEstadoPedido(String(orderNo ?? "")).catch(() => null);
  // `desconocido` = no se pudo preguntar; sin `existe` el pedido ya no está allá y de
  // eso se ocupa `respuestaDelFallo`, no este freno.
  if (!est || est.desconocido || !est.existe) return null;
  const r = cotejoProveedorParaLanzar(String(orderNo ?? ""), est.vendorNo, esperado);
  if (r.ok) return null;
  return { ok: false, error: r.mensaje!, frenoProveedor: true, bcVendorNo: r.bcVendorNo, proveedorOrden: esperado };
}
