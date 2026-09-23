import { NextResponse } from "next/server";
import { listMovimientosResumen, listOrdenes, listPedidos, listRecepciones } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Carga inicial de toda la data para el front-end (modo API).
export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const [pedidos, ordenes, recepciones, movimientos] = await Promise.all([
      listPedidos(), listOrdenes(), listRecepciones(), listMovimientosResumen(),
    ]);
    return NextResponse.json({ pedidos, ordenes, recepciones, movimientos });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
