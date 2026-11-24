import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { getOrdenPreviaSubcontrato, updateSubcontrato } from "@/lib/compras/repo";
import { guardCompras, esRechazo, exigirPedidoPropio } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De qué orden salió un subcontrato que Proveeduría DEVOLVIÓ (ya no está ligado a
 *  ninguna: la devolución le borra la línea a la orden). La pantalla lo usa para
 *  precargar el subcontratista y decir a dónde vuelve al corregirlo. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;
  const id = Number((await params).id);
  const ajeno = await exigirPedidoPropio(g, id);
  if (ajeno) return ajeno;

  try {
    return NextResponse.json({ orden: await getOrdenPreviaSubcontrato(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

/** Editar un subcontrato = rehacer su pedido Y su orden a la vez (el proveedor y los
 *  montos viven en la orden). Si Proveeduría lo devolvió y la orden ya no existe, se
 *  arma una nueva; si la orden vive en BC, queda Abierta para que Proveeduría la
 *  reenvíe. El repo rechaza el caso en que ya no manda esta app: orden lanzada, en
 *  aprobación en Business Central, recibida o facturada. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;
  const ajeno = await exigirPedidoPropio(g, Number((await params).id));
  if (ajeno) return ajeno;

  try {
    const body = await req.json();
    // Quién lo corrige sale de la SESIÓN, no del body.
    const r = await updateSubcontrato({ ...body, id: Number((await params).id), usuario: g.usuario, rol: g.rol });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 400 });
  }
}
