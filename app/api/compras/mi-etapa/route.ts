import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { etapasDeUsuario } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/mi-etapa → { etapaIds: number[] }
// Etapas (especialidad) del ingeniero, para que la Matriz arranque en las suyas.
// Nunca 500: si SQL falla o no hay mapeo, devuelve lista vacía.
//
// El username sale de la SESIÓN. Antes venía en el query, así que cualquiera podía
// preguntar por las etapas de otro escribiendo su nombre — y ya no hace falta: el
// token trae la identidad. La Matriz es pantalla del ingeniero (`exigeTodo`).
export async function GET() {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  const username = g.usuarioId;
  try {
    return NextResponse.json({ etapaIds: await etapasDeUsuario(username) });
  } catch (e: any) {
    return NextResponse.json({ etapaIds: [], error: mensajeParaCliente(e) });
  }
}
