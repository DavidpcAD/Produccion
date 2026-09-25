import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { deletePlantilla, updatePlantilla } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Las plantillas se leen desde el pedido nuevo, pero solo el ingeniero las edita. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    if (!body?.nombre) return NextResponse.json({ error: "Falta nombre" }, { status: 400 });
    await updatePlantilla(Number((await params).id), {
      nombre: String(body.nombre),
      tipo: body.tipo === "bodega" ? "bodega" : "general",
      idClasificacion: body.idClasificacion != null ? Number(body.idClasificacion) : null,
      lineas: Array.isArray(body.lineas) ? body.lineas : [],
      // El dueño/actor sale de la SESIÓN, no del query ni del body.
    usuario: g.usuario,
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    // El dueño/actor sale de la SESIÓN, no del query ni del body.
    await deletePlantilla(Number((await params).id), g.usuario);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
