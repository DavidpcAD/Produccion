import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { devolverLineasPedido } from "@/lib/compras/repo";
import { guardCompras, esRechazo, exigirPedidoPropio } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Devuelve solo LÍNEAS puntuales de un pedido (las que Proveeduría todavía no
// compró): el resto sigue su curso. Si se devuelven todas, el pedido completo
// pasa a "devuelto" (mismo efecto que el PATCH de estado de siempre).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;
  const ajeno = await exigirPedidoPropio(g, Number((await params).id));
  if (ajeno) return ajeno;

  try {
    const { lineaIds, motivo } = await req.json();
    const ids = Array.isArray(lineaIds) ? lineaIds.map(Number) : [];
    await devolverLineasPedido(Number((await params).id), ids, motivo ?? "", g.usuario, g.rol);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
