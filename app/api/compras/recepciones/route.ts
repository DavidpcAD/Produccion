import { NextResponse } from "next/server";
import { createRecepcion } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    // La identidad del actor sale de la SESIÓN, nunca del body: antes el cliente
    // decidía a nombre de quién quedaba el registro (y qué rol figuraba).
    const id = await createRecepcion({ ...(await req.json()), usuario: g.usuario, rol: g.rol });
    return NextResponse.json({ idRecepcionCompra: id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
