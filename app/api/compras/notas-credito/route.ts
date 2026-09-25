import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { createNotasCredito, listNotasCredito } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Las notas de crédito son de contabilidad. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// GET  /api/notas-credito  → { notas: [...] }  (líneas marcadas para nota de crédito)
// POST /api/notas-credito  → crea las líneas marcadas. Body: { idOrdenCompra, usuario, lineas }
// Aislado del bootstrap: si la tabla dbo.NotaCreditoDet no existe, GET devuelve []
// y no rompe el resto de la app.
export async function GET() {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json({ notas: await listNotasCredito() });
  } catch (e: any) {
    return NextResponse.json({ notas: [], error: mensajeParaCliente(e) });
  }
}

export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    // La identidad del actor sale de la SESIÓN, nunca del body: antes el cliente
    // decidía a nombre de quién quedaba el registro (y qué rol figuraba).
    const n = await createNotasCredito({ ...body, usuario: g.usuario, rol: g.rol });
    return NextResponse.json({ ok: true, creadas: n });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: mensajeParaCliente(e) }, { status: 500 });
  }
}
