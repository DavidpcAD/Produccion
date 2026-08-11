import { NextResponse } from "next/server";
import { getPedido, setPedidoEstado, softDeletePedido, updatePedido } from "@/lib/compras/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const p = await getPedido(Number((await params).id));
    if (!p) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
    return NextResponse.json(p);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { estado, usuario, rol, motivo } = await req.json();
    await setPedidoEstado(Number((await params).id), estado, usuario, rol, motivo);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json();
    await updatePedido({ id: Number((await params).id), ...body });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { usuario, rol } = await req.json().catch(() => ({ usuario: "Sistema", rol: "ingenieria" }));
    await softDeletePedido(Number((await params).id), usuario ?? "Sistema", rol ?? "ingenieria");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
