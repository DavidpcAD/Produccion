import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { createPlantilla, listPlantillas } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Las plantillas se leen desde el pedido nuevo, pero solo el ingeniero las guarda. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json({ plantillas: await listPlantillas() });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    if (!body?.nombre) {
      return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
    }
    const id = await createPlantilla({
      nombre: String(body.nombre),
      // El dueño/actor sale de la SESIÓN, no del query ni del body.
    creadoPor: g.usuario,
      tipo: body.tipo === "bodega" ? "bodega" : "general",
      idClasificacion: body.idClasificacion != null ? Number(body.idClasificacion) : null,
      lineas: Array.isArray(body.lineas) ? body.lineas : [],
    });
    return NextResponse.json({ idPlantillaSolicitud: id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
