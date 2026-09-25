import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { listWbs, listObras, matrizCeldas } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Matriz por obra: obras (filas) + WBS (columnas = sub_partidas) + celdas con estado.
export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const [wbs, obras, celdas] = await Promise.all([listWbs(), listObras(), matrizCeldas()]);
    return NextResponse.json({ ...wbs, obras, celdas });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
