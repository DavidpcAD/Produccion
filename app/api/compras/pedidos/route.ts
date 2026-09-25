import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { createPedido, listPedidos } from "@/lib/compras/repo";
import { guardCompras, esRechazo, sesionDeActor } from "@/lib/compras/guard";
import { pedidoEsDelUsuario } from "@/lib/compras/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const pedidos = await listPedidos();
    // Mismo recorte que el bootstrap: quien solo pide material ve lo suyo.
    if (g.alcance === "todo") return NextResponse.json(pedidos);
    const me = sesionDeActor(g);
    return NextResponse.json(pedidos.filter((p) => pedidoEsDelUsuario(p, me)));
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
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
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
