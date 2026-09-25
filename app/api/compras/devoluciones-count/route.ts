import { NextResponse } from "next/server";
import { contarDevoluciones } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conteo de devoluciones para el badge de la navegación base (la Sidebar vive fuera
// del StoreProvider de Compras, así que no puede leer el store: lo pide por API).
//  • pedidosDevueltos  = solicitudes que Proveeduría devolvió, enteras o por línea
//  • ordenesRechazadas = órdenes que Aprobación rechazó (orden.estado "rechazado")
export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    // Quien solo pide material cuenta LO SUYO: el badge le mostraba las
    // devoluciones de toda la empresa, que ni ve ni puede atender.
    const soloDe = g.alcance === "todo"
      ? undefined
      : { username: g.session.username, nombre: g.session.nombre };
    return NextResponse.json(await contarDevoluciones(soloDe));
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as { message?: string })?.message ?? e) }, { status: 500 });
  }
}
