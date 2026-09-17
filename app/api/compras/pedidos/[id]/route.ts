import { NextResponse } from "next/server";
import { getPedido, setPedidoEstado, softDeletePedido, updatePedido } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const p = await getPedido(Number((await params).id));
    if (!p) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
    return NextResponse.json(p);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const { estado, motivo } = await req.json();
    // La identidad del actor sale de la SESIÓN, nunca del body: antes el cliente
    // decidía a nombre de quién quedaba el registro (y qué rol figuraba).
    const { usuario, rol } = g;
    await setPedidoEstado(Number((await params).id), estado, usuario, rol, motivo);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    await updatePedido({ id: Number((await params).id), ...body });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    await softDeletePedido(Number((await params).id), g.usuario, g.rol);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
