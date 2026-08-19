import { NextResponse } from "next/server";
import { bcResyncPedidoLines, bcReleasePedido, bcAssignItemCharges, bcAddChargeLine, bcItemCharges, resolverItemChargeNo } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-sincroniza (precio + variante) las líneas de un pedido YA creado en BC y luego
// lo lanza. Se usa al REINTENTAR "Aprobar y lanzar": si la orden se corrigió en la
// app después de crearse en BC, esas correcciones viajan a BC antes del release.
export async function POST(req: Request) {
  try {
    const { orderNo, lineas, cargos, metodo } = await req.json();
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
    const status = await bcReleasePedido(orderNo);
    return NextResponse.json({ ok: true, status, cargoError, jobError });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 502 });
  }
}
