import { NextResponse } from "next/server";
import { listOrdenes, listPedidos } from "@/lib/compras/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conteo de devoluciones para el badge de la navegación base (la Sidebar vive fuera
// del StoreProvider de Compras, así que no puede leer el store: lo pide por API).
//  • pedidosDevueltos  = solicitudes que Proveeduría devolvió (pedido.estado "devuelto")
//  • ordenesRechazadas = órdenes que Aprobación rechazó (orden.estado "rechazado")
export async function GET() {
  try {
    const [pedidos, ordenes] = await Promise.all([listPedidos(), listOrdenes()]);
    const pedidosDevueltos = pedidos.filter((p) => p.estado === "devuelto").length;
    const ordenesRechazadas = ordenes.filter((o) => o.estado === "rechazado").length;
    return NextResponse.json({ pedidosDevueltos, ordenesRechazadas });
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as { message?: string })?.message ?? e) }, { status: 500 });
  }
}
