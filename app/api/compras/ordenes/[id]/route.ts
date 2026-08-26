import { NextResponse } from "next/server";
import { getOrden, setOrdenEstado } from "@/lib/compras/repo";
import { bcEnviarAAprobacion, bcReabrirPedido } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const o = await getOrden(Number((await params).id));
    if (!o) return NextResponse.json({ error: "no encontrada" }, { status: 404 });
    return NextResponse.json(o);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

/**
 * El estado de la orden en BC va DETRÁS del estado en la app, y se sincroniza acá
 * (no en cada pantalla) para que valga igual quien lo mueva: Proveeduría, Aprobación
 * o la compra directa.
 *
 *   pendiente_aprobacion → AdelantePO_SendForApproval → en BC queda "Pendiente de
 *                          aprobación" con su solicitud abierta (workflows MS-POAPW-01/02).
 *   abierto / rechazado  → AdelantePO_ReopenOrder     → CANCELA la solicitud viva y deja
 *                          el pedido Abierto para que Proveeduría lo pueda editar.
 *
 * "lanzado" NO se toca acá: ese lo hace `aprobarYLanzar` contra BC (aprobar la solicitud
 * y liberar), y el estado solo se guarda si BC de verdad lo hizo.
 */
function accionBcDelEstado(estado: string): "enviar" | "reabrir" | null {
  if (estado === "pendiente_aprobacion") return "enviar";
  if (estado === "abierto" || estado === "rechazado") return "reabrir";
  return null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { estado, usuario, rol, motivo, bcNumber, tipoMovimiento } = await req.json();
    const id = Number((await params).id);
    await setOrdenEstado(id, estado, usuario, rol, motivo, bcNumber, tipoMovimiento);

    // Sincronizar BC solo en un cambio de estado de verdad. Con `tipoMovimiento` el que
    // llama está anotando algo en el historial sin mover la orden (p. ej. el
    // `lanzamiento_fallido` de aprobar.ts, que reescribe el MISMO estado): ahí no hay
    // nada que sincronizar y volver a llamar a BC sería un viaje al aire.
    const accion = tipoMovimiento ? null : accionBcDelEstado(String(estado ?? ""));
    if (!accion) return NextResponse.json({ ok: true });

    // El N.º de BC se lee DESPUÉS de escribir el estado: si esta misma llamada acaba de
    // ligar (o desligar) el pedido con `bcNumber`, lo que vale es el de ahora.
    const orden = await getOrden(id);
    const orderNo = orden?.bcNumber;
    // Sin pedido en BC no hay nada que sincronizar: las órdenes que nacen en esta app se
    // crean en BC al aprobarlas (ver aprobar.ts).
    if (!orderNo) return NextResponse.json({ ok: true });

    try {
      const status = accion === "enviar" ? await bcEnviarAAprobacion(orderNo) : await bcReabrirPedido(orderNo);
      return NextResponse.json({ ok: true, bcStatus: status });
    } catch (e: any) {
      // BC falló, pero el estado en la app YA cambió y es el correcto: el motivo se
      // guarda en el historial de la orden (si no, se perdería) y se devuelve para que
      // la pantalla lo pueda avisar. No se tumba la operación:
      //   · al enviar, "Aprobar y lanzar" vuelve a mandar la solicitud si falta;
      //   · al reabrir/rechazar, el pedido queda en BC como estaba y se puede reintentar.
      const detalle = accion === "enviar"
        ? `No se pudo dejar ${orderNo} pendiente de aprobación en BC: ${String(e?.message ?? e)}`
        : `No se pudo reabrir ${orderNo} en BC (la solicitud de aprobación puede seguir abierta): ${String(e?.message ?? e)}`;
      try { await setOrdenEstado(id, estado, usuario, rol, detalle, undefined, "aviso_bc"); } catch { /* el aviso ya viaja en la respuesta */ }
      return NextResponse.json({ ok: true, bcAviso: detalle });
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
