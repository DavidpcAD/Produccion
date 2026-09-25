import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { updateSubcontrato } from "@/lib/compras/repo";
import { guardCompras, esRechazo, exigirPedidoPropio } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Editar un subcontrato = rehacer su pedido Y su orden a la vez (el proveedor y los
 *  montos viven en la orden). El repo rechaza el caso en que ya no manda esta app:
 *  orden lanzada a Business Central, recibida o facturada. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;
  const ajeno = await exigirPedidoPropio(g, Number((await params).id));
  if (ajeno) return ajeno;

  try {
    const body = await req.json();
    await updateSubcontrato({ id: Number((await params).id), ...body });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 400 });
  }
}
