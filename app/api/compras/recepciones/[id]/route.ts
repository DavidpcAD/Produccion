import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { setRecepcionFactura } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Registrar la factura de una recepción es de quien recibe / contabilidad. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// MODO 2: registrar la factura de una recepción que estaba EN REVISIÓN.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    await setRecepcionFactura(
      Number((await params).id),
      String(body.numeroFactura ?? ""),
      g.usuario,
      g.rol,
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
