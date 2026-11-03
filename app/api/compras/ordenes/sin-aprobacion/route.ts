import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { listOrdenesSinAprobacion } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Las órdenes que Proveeduría lanzó en BC sin pasar por Aprobación (menor a ₡210 000
// en colones, u Holcim). Es el histórico «Aprobación automática» de la bandeja: solo lectura.
// `exigeTodo`: es la bitácora de órdenes de toda la empresa, no algo de quien solo
// pide material.
export async function GET() {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json(await listOrdenesSinAprobacion());
  } catch (e: unknown) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
