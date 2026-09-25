import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { listWbs, createClasificacion } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: El catálogo de clasificaciones lo edita el ingeniero. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// Árbol del maestro: etapa -> partida -> sub_partida + clasificaciones del ingeniero.
export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json(await listWbs());
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

// Crear una clasificación (control del ingeniero) colgando de una partida O sub_partida.
export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    const nombre = String(body?.nombre ?? "").trim();
    const partidaId = body?.partidaId != null ? Number(body.partidaId) : null;
    const subPartidaId = body?.subPartidaId != null ? Number(body.subPartidaId) : null;
    if (!nombre || (!partidaId && !subPartidaId)) {
      return NextResponse.json({ error: "Falta nombre y una partida o sub-partida" }, { status: 400 });
    }
    const id = await createClasificacion({ nombre, partidaId, subPartidaId });
    return NextResponse.json({ idClasificacion: id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
