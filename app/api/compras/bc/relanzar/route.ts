import { NextResponse } from "next/server";
import { bcResyncPedidoLines, bcReleasePedido, bcEstadoPedido, bcPedidoTieneRecepciones, bcAssignItemCharges, bcAddChargeLine, bcItemCharges, resolverItemChargeNo, bcCompletarProyectoTarea, mensajeConsumoIncompleto, bcLineasProyectoSinTarea, mensajeProyectoSinTarea, bcQuitarObraDeLineas, mensajeObraNoQuitada } from "@/lib/compras/bc";

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

// LANZA (Release) un pedido que ya existe en BC, y opcionalmente re-sincroniza sus
// líneas antes.
//
// El flujo normal ya NO manda líneas: el pedido lo crea Proveeduría al enviar la
// orden a aprobación y es ella la dueña de su contenido, así que aprobar es solo
// lanzar. `lineas`/`cargos` siguen soportados para el camino en que ESTA app creó el
// pedido (sin bcNo previo), donde sí le toca aplicar obra/tarea/almacén.
export async function POST(req: Request) {
  let orderNo = "";
  try {
    const body = await req.json();
    const { lineas, cargos, metodo, consumoDirecto, sinObra } = body;
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
    // TAG ALM: quitarle a BC la obra que Proveeduría le copió a una línea que va a
    // INVENTARIO, y dejarle el CENTRO DE COSTO que el almacén exige. Con el proyecto
    // puesto BC le pisa el centro de costo con el de la obra, y eso BC lo valida SOLO
    // AL REGISTRAR la factura: el pedido se lanza, el material llega y Bodega se topa
    // con "el almacén ALM-GRAL obliga a que la dimensión CC sea INV, y la línea lleva
    // VN-L.03" (CP-005375). La obra de "Obras y materiales" es control del ingeniero:
    // solo viaja a BC en consumo directo.
    // Va ANTES del consumo directo (son líneas distintas) y antes del pre-vuelo de
    // "obra sin tarea", que es el que hoy tranca estos pedidos.
    let obraQuitada = 0;
    if (Array.isArray(sinObra) && sinObra.length) {
      const q = await bcQuitarObraDeLineas(orderNo, sinObra).catch((e) => ({
        limpiadas: [], pendientes: [], error: String((e as Error)?.message ?? e),
      }));
      obraQuitada = q.limpiadas.length;
      if (q.pendientes.length) {
        return NextResponse.json({ ok: false, error: mensajeObraNoQuitada(q.pendientes), obraPendiente: q.pendientes, obraError: q.error }, { status: 502 });
      }
      // Sin pendientes pero con error = no se pudo leer/verificar el pedido en BC. No
      // se tranca el lanzamiento por eso (nada se escribió mal), pero queda el aviso.
      if (q.error) console.warn(`BC ${orderNo}: no se pudo revisar la obra de las líneas de almacén: ${q.error}`);
    }
    // CONSUMO DIRECTO: completarle a BC el proyecto+tarea que la app conoce por la
    // solicitud. Proveeduría crea el pedido sin la tarea y BC no lanza así; sin esto,
    // la salida a mano es borrarle el proyecto a la línea, y entonces el material
    // entra a inventario en vez de ir contra la partida de la obra. Solo se escribe
    // proyecto/tarea: el ALMACÉN es de Proveeduría y no se toca.
    // Si al final alguna línea de consumo directo se queda sin obra+tarea en BC, NO se
    // lanza: ese es exactamente el caso en que el material entra a inventario en
    // silencio en vez de cargarse a la partida de la obra (CP-005182 / CP-005132).
    if (Array.isArray(consumoDirecto) && consumoDirecto.length) {
      let cd: Awaited<ReturnType<typeof bcCompletarProyectoTarea>>;
      try {
        cd = await bcCompletarProyectoTarea(orderNo, consumoDirecto);
      } catch (e) {
        cd = { aplicadas: 0, pendientes: [], error: String((e as Error)?.message ?? e) };
      }
      if (cd.pendientes.length || cd.error) {
        const detalle = cd.pendientes.length ? mensajeConsumoIncompleto(cd.pendientes) : `no se pudo dejar el consumo directo puesto en BC: ${cd.error}. El pedido ${orderNo} NO se lanzó.`;
        return NextResponse.json({ ok: false, error: detalle, consumoPendiente: cd.pendientes, cdError: cd.error }, { status: 502 });
      }
    }
    // PRE-VUELO: línea con OBRA y SIN TAREA. BC rechaza el Release con "Project Task
    // No. must have a value in Purchase Line…", un error crudo que no dice qué línea es
    // ni qué hacer, y el aprobador lo reintenta en vano (caso CP-005170, 25/08/2026: 8
    // intentos). Se lee el pedido antes de lanzar para decir la línea, el artículo y la
    // obra. NO se le quita el proyecto para poder lanzar: si la compra va contra la
    // obra, va con su tarea — sin tarea el costo se iría a inventario y no a la partida.
    const sinTarea = await bcLineasProyectoSinTarea(orderNo);
    if (sinTarea?.length) {
      return NextResponse.json({ ok: false, error: mensajeProyectoSinTarea(sinTarea), jobSinTarea: sinTarea }, { status: 502 });
    }
    try {
      const status = await bcReleasePedido(orderNo);
      return NextResponse.json({ ok: true, status, cargoError, jobError, obraQuitada });
    } catch (e) {
      return respuestaDelFallo(orderNo, e);
    }
  } catch (e: any) {
    // Incluye el "No se encontró el pedido … en BC" del resync: mismo tratamiento.
    if (orderNo) return respuestaDelFallo(orderNo, e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 502 });
  }
}
