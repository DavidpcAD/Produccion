import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { createRecepcion } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Recibir material es de quien recibe. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    // La identidad del actor sale de la SESIÓN, nunca del body: antes el cliente
    // decidía a nombre de quién quedaba el registro (y qué rol figuraba).
    const id = await createRecepcion({ ...(await req.json()), usuario: g.usuario, rol: g.rol });
    return NextResponse.json({ idRecepcionCompra: id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
