import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { deleteVista } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    // El dueño/actor sale de la SESIÓN, no del query ni del body.
    await deleteVista(Number((await params).id), g.usuario);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
