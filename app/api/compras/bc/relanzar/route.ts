import { NextResponse } from "next/server";
import { bcResyncPedidoLines, bcReleasePedido, bcEstadoPedido, bcPedidoTieneRecepciones, bcAssignItemCharges, bcAddChargeLine, bcItemCharges, resolverItemChargeNo } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cuando algo falla, le PREGUNTAMOS a BC cómo quedó el pedido antes de contestar.
// Si no, la orden se queda colgada en "pendiente" para siempre: aunque en BC ya esté
// lanzada (alguien la liberó a mano) o aunque el pedido ya no exista, cada reintento
// volvía a fallar con el mismo error crudo de BC.
async function respuestaDelFallo(orderNo: string, e: unknown) {
  const est = await bcEstadoPedido(orderNo);
  // Ya está lanzado en BC: para la app es un éxito (no hay nada que reintentar).
  if (est.lanzado) return NextResponse.json({ ok: true, status: "Released", yaLanzado: true });
  // Ya no está en Pedidos de compra. Son DOS casos muy distintos y hay que
  // separarlos: si tiene recepciones registradas, el pedido se registró y cumplió
  // su ciclo (recrearlo duplicaría la compra); si no tiene ninguna, lo ELIMINARON
  // sin registrar nada y la única salida es crearlo de nuevo. Ojo: que aparezca en
  // "Archivos pedido compra" NO alcanza para saberlo — BC archiva una copia también
  // al cambiar de estado o con la acción "Archivar documento", y esos pedidos siguen
  // vivos; lo que manda es que no esté en Pedidos de compra. Y un pedido de compra
  // archivado no se puede restaurar en BC (solo copiarlo a uno nuevo).
  if (!est.desconocido && !est.existe) {
    const registrado = await bcPedidoTieneRecepciones(orderNo);
    if (registrado === true) return NextResponse.json({ ok: true, status: "Posted", yaLanzado: true, yaRegistrado: true });
    if (registrado === false) {
      return NextResponse.json({
        ok: false, bcInexistente: true,
        error: `El pedido ${orderNo} ya no está en Pedidos de compra de BC y no tiene recepciones registradas: lo eliminaron (BC guarda una copia en "Archivos pedido compra", pero un pedido de compra archivado no se puede restaurar).`,
      }, { status: 502 });
    }
    return NextResponse.json({
      ok: false,
      error: `El pedido ${orderNo} ya no está en Pedidos de compra de BC y no se pudo confirmar si se registró. Revisalo en BC antes de reintentar.`,
    }, { status: 502 });
  }
  if (est.enAprobacion) {
    return NextResponse.json({
      ok: false, bcEnAprobacion: true,
      error: `El pedido ${orderNo} está pendiente de aprobación en BC. Aprobalo ahí y reintentá.`,
    }, { status: 502 });
  }
  return NextResponse.json({ ok: false, error: String((e as Error)?.message ?? e) }, { status: 502 });
}

// Re-sincroniza (precio + variante) las líneas de un pedido YA creado en BC y luego
// lo lanza. Se usa al REINTENTAR "Aprobar y lanzar": si la orden se corrigió en la
// app después de crearse en BC, esas correcciones viajan a BC antes del release.
export async function POST(req: Request) {
  let orderNo = "";
  try {
    const body = await req.json();
    const { lineas, cargos, metodo } = body;
    orderNo = body.orderNo ?? "";
    if (!orderNo) return NextResponse.json({ error: "Falta orderNo" }, { status: 400 });
    let jobError: string | undefined;
    if (Array.isArray(lineas) && lineas.length) {
      const rs = await bcResyncPedidoLines(orderNo, lineas);
      if (rs.jobError) jobError = rs.jobError;
    }
    // Cargos de producto: agregar la línea vía codeunit (idempotente por itemChargeNo),
    // así re-aprobar una orden que se creó sin el cargo lo completa. No debe tumbar,
    // pero SÍ reporta el error (antes se tragaba y quedaba lanzada sin flete).
    let cargoError: string | undefined;
    if (Array.isArray(cargos)) {
      // Catálogo de BC para recuperar el tipo por descripción si el cargo viene sin
      // chargeNo (cliente con bundle viejo). Se carga una sola vez.
      const catalogoCargos = cargos.some((c: any) => c?.precio > 0) ? await bcItemCharges() : [];
      for (const cg of cargos) {
        if (!(cg?.precio > 0)) continue;
        const chargeNo = resolverItemChargeNo(cg, catalogoCargos);
        if (!chargeNo) { if (!cargoError) cargoError = "El cargo no tiene tipo (Item Charge) y no se pudo deducir por la descripción. Elegí el tipo y reintentá."; continue; }
        try { await bcAddChargeLine(orderNo, chargeNo, cg.descripcion || "CARGO / TRANSPORTE", cg.cantidad || 1, cg.precio); }
        catch (e: any) { if (!cargoError) cargoError = `cargo ${chargeNo}: ${String(e?.message ?? e)}`; }
      }
    }
    // Reasignar cargos si el método no es "por importe" (Amount ya es automático).
    const met = (metodo ?? "").trim();
    if (met && met.toLowerCase() !== "amount") {
      try { await bcAssignItemCharges(orderNo, met); } catch { /* no debe tumbar el relanzamiento */ }
    }
    // Igual que en el alta: si el proyecto/tarea/almacén no se aplicó, NO se lanza —
    // se registraría material sin su obra y entraría a inventario en silencio.
    if (jobError) {
      return NextResponse.json({
        ok: false,
        error: `No se aplicó el proyecto/tarea/almacén en BC (${jobError}). El pedido ${orderNo} quedó ABIERTO en BC sin lanzar.`,
        jobError,
      }, { status: 502 });
    }
    try {
      const status = await bcReleasePedido(orderNo);
      return NextResponse.json({ ok: true, status, cargoError, jobError });
    } catch (e) {
      return respuestaDelFallo(orderNo, e);
    }
  } catch (e: any) {
    // Incluye el "No se encontró el pedido … en BC" del resync: mismo tratamiento.
    if (orderNo) return respuestaDelFallo(orderNo, e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 502 });
  }
}
