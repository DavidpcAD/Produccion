import { NextResponse } from "next/server";
import { createPedido, listPedidos } from "@/lib/compras/repo";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listPedidos());
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Atribuir el pedido al usuario logueado con un id ESTABLE (username de sesión),
    // no lo que mande el cliente — así "mis solicitudes" filtra confiable. Si la
    // sesión no trae username (token viejo / usuario de prueba), cae al nombre que
    // venga en el body (compat).
    const session = await getSession();
    if (session?.username) body.creadoPorId = session.username;
    const id = await createPedido(body);
    return NextResponse.json({ idPedidoCompra: id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
