import { NextResponse } from "next/server";
import { corregirEstadoPorBc, listOrdenesConBc } from "@/lib/compras/repo";
import { bcEstadoPedido, bcEstadosPedidos, type BcEstadoPedido } from "@/lib/compras/bc";
import type { Role } from "@/lib/compras/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// EL ESTADO DE LA ORDEN SIGUE AL DEL PEDIDO EN BUSINESS CENTRAL.
//
// Hasta el 3/9/2026 la app escribía "lanzado" y no volvía a mirar. Si el lanzamiento
// no entraba en BC —o alguien lo liberaba o reabría allá a mano— la orden se quedaba
// mintiendo para siempre: CP-005143, CP-005180 y CP-005350 figuraban "Lanzado" acá
// con el pedido Abierto en BC, y Bodega se estrellaba contra el "must be approved and
// released" sin que ninguna pantalla lo dijera. Acá se le pregunta a BC y se corrige.
//
// Regla (solo con lo que BC AFIRMÓ; "no se pudo leer" no mueve nada):
//   · app "lanzado" + BC Abierto o Pendiente de aprobación → vuelve a
//     "pendiente_aprobacion": Aprobación la ve otra vez y la vuelve a lanzar, y Bodega
//     deja de verla en "por recibir" (BC no recibe contra un pedido sin lanzar).
//   · app "pendiente_aprobacion" + BC Lanzado → pasa a "lanzado" (lo liberaron allá, a
//     mano o desde la PWA de aprobaciones).
//   · Lo demás no se toca. Pendiente + Abierto es lo normal (no todo pedido pasa por el
//     workflow de BC). Un pedido que ya no está en Pedidos de compra se registró o se
//     eliminó, y eso lo resuelve "Aprobar y lanzar" (ver relanzar). Abierto/rechazado
//     son de Proveeduría: si allá alguien lanzó a mano una orden que no pasó por
//     Aprobación, no se le regala el "lanzado" — se deja para que lo vean.
//
// `ids` = solo esas órdenes (la pantalla de detalle pregunta por la suya y muestra el
// estado real). Sin `ids` = todas las que pueden estar desalineadas, con UNA lectura de
// BC (bcEstadosPedidos), que es lo que corre el store al cargar y cada 5 min.

export type EstadoBcOrden = "lanzado" | "abierto" | "pendiente_aprobacion" | "inexistente" | "desconocido";

function estadoDe(e: BcEstadoPedido | undefined): EstadoBcOrden {
  if (!e) return "inexistente";
  if (e.desconocido) return "desconocido";
  if (!e.existe) return "inexistente";
  return e.lanzado ? "lanzado" : e.enAprobacion ? "pendiente_aprobacion" : "abierto";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] | null = Array.isArray(body?.ids) ? body.ids.map(String) : null;
    const usuario = String(body?.usuario || "sistema");
    const rol = (body?.rol || "aprobacion") as Role;

    const todas = await listOrdenesConBc();
    // Con `ids`, se contesta el estado de BC de cada una (sea cual sea su estado acá);
    // sin `ids`, solo las que pueden estar desalineadas.
    const candidatas = ids
      ? todas.filter((o) => ids.includes(String(o.id)))
      : todas.filter((o) => o.estado === "lanzado" || o.estado === "pendiente_aprobacion");

    let estados: Map<string, BcEstadoPedido> | null = new Map();
    if (candidatas.length === 1) {
      const e = await bcEstadoPedido(candidatas[0].bcNumber);
      estados = e.desconocido ? null : new Map(e.existe ? [[candidatas[0].bcNumber, e]] : []);
    } else if (candidatas.length > 1) {
      estados = await bcEstadosPedidos();
    }
    if (!estados) return NextResponse.json({ ok: false, desconocido: true, revisadas: 0, corregidas: [], estados: {} });

    const corregidas: { id: string; numero: string; bcNumber: string; de: string; a: string; bcEstado: EstadoBcOrden }[] = [];
    const porOrden: Record<string, EstadoBcOrden> = {};
    for (const o of candidatas) {
      const bc = estadoDe(estados.get(o.bcNumber));
      porOrden[String(o.id)] = bc;
      let nuevo: string | null = null;
      let detalle = "";
      if (o.estado === "lanzado" && (bc === "abierto" || bc === "pendiente_aprobacion")) {
        nuevo = "pendiente_aprobacion";
        detalle = `${o.bcNumber} está ${bc === "abierto" ? "ABIERTO" : "PENDIENTE DE APROBACIÓN"} en Business Central, no lanzado: la orden figuraba lanzada acá sin estarlo allá. Vuelve a Pendiente de aprobación para que Aprobación la lance de nuevo; Bodega no puede recibir contra un pedido sin lanzar.`;
      } else if (o.estado === "pendiente_aprobacion" && bc === "lanzado") {
        nuevo = "lanzado";
        detalle = `${o.bcNumber} ya está LANZADO en Business Central (lo liberaron allá): la orden pasa a Lanzado.`;
      }
      if (!nuevo) continue;
      const hecho = await corregirEstadoPorBc(o.id, o.estado, nuevo, detalle, usuario, rol);
      if (hecho) corregidas.push({ id: String(o.id), numero: o.numero, bcNumber: o.bcNumber, de: o.estado, a: nuevo, bcEstado: bc });
    }
    return NextResponse.json({ ok: true, revisadas: candidatas.length, corregidas, estados: porOrden });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
