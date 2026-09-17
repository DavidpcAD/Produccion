import { NextResponse } from "next/server";
import { setRecepcionFactura } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MODO 2: registrar la factura de una recepción que estaba EN REVISIÓN.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
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
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
