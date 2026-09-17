import { NextResponse } from "next/server";
import { createPedido, listPedidos } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json(await listPedidos());
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    // Atribuir el pedido al usuario logueado con un id ESTABLE (username de sesión),
    // no lo que mande el cliente — así "mis solicitudes" filtra confiable. Si la
    // sesión no trae username (token viejo / usuario de prueba), cae al nombre que
    // venga en el body (compat).
    body.creadoPorId = g.usuarioId;
    body.usuario = g.usuario;
    body.rol = g.rol;
    const id = await createPedido(body);
    return NextResponse.json({ idPedidoCompra: id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
