import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { listVistas, saveVista } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vistas de tabla guardadas por usuario. GET ?usuario=&tabla=
export async function GET(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const u = new URL(req.url);
    const tabla = u.searchParams.get("tabla") ?? "";
    if (!tabla) return NextResponse.json({ vistas: [] });
    // El dueño/actor sale de la SESIÓN, no del query ni del body.
    return NextResponse.json({ vistas: await listVistas(g.usuario, tabla) });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const b = await req.json();
    if (!b?.tabla || !b?.nombre) return NextResponse.json({ error: "Faltan tabla o nombre" }, { status: 400 });
    // El dueño/actor sale de la SESIÓN, no del query ni del body.
    const id = await saveVista({ usuario: g.usuario, tablaKey: String(b.tabla), nombre: String(b.nombre), config: b.config ?? {}, esPredeterminada: !!b.esPredeterminada });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
