import { NextResponse } from "next/server";
import { jsonComprimido } from "@/lib/http/json-comprimido";
import { mensajeParaCliente } from "@/lib/errores";
import { listWbs, listObras, matrizCeldas } from "@/lib/compras/repo";
import { guardCompras, esRechazo, sesionDeActor } from "@/lib/compras/guard";
import { ingenieroVeSoloLoSuyo } from "@/lib/compras/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: La matriz de compras es la pantalla del ingeniero. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// Matriz por obra: obras (filas) + WBS (columnas = sub_partidas) + celdas con estado.
export async function GET(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    // Un ingeniero de obra ve en la matriz SOLO sus solicitudes (decisión 2026-10-07): se
    // recorta en el servidor por autor. El Super Admin (y quien no sea ingeniero) ve todo.
    const me = sesionDeActor(g);
    const autor = ingenieroVeSoloLoSuyo(me) ? { username: me.username, nombre: me.nombre } : undefined;
    const [wbs, obras, celdas] = await Promise.all([listWbs(), listObras(), matrizCeldas(autor)]);
    return jsonComprimido(req, { ...wbs, obras, celdas });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
