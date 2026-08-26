import { NextResponse } from "next/server";
import { devolverLineasPedido } from "@/lib/compras/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Devuelve solo LÍNEAS puntuales de un pedido (las que Proveeduría todavía no
// compró): el resto sigue su curso. Si se devuelven todas, el pedido completo
// pasa a "devuelto" (mismo efecto que el PATCH de estado de siempre).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { lineaIds, motivo, usuario, rol } = await req.json();
    const ids = Array.isArray(lineaIds) ? lineaIds.map(Number) : [];
    await devolverLineasPedido(Number((await params).id), ids, motivo ?? "", usuario, rol);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
