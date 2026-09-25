import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { listMovimientos } from "@/lib/compras/repo";
import { guardCompras, esRechazo, exigirPedidoPropio, exigirOrdenPropia } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bitácora completa de UN documento (la carga inicial solo trae el resumen).
//
// La bitácora dice quién pidió qué, quién lo devolvió y con qué motivo: es el
// documento con otra cara, así que se pide lo mismo que para abrirlo. Quien solo
// pide material llega acá desde el detalle de su solicitud, y la línea de tiempo
// suma las órdenes en las que entró (ver components/compras/timeline.tsx) — por
// eso valen las dos entidades, cada una con su dueño.
export async function GET(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  const { searchParams } = new URL(req.url);
  const entidad = searchParams.get("entidad") ?? "";
  const id = Number(searchParams.get("id") ?? 0);

  if (g.alcance !== "todo") {
    if (entidad === "pedido") {
      const ajeno = await exigirPedidoPropio(g, id);
      if (ajeno) return ajeno;
    } else if (entidad === "orden") {
      const ajena = await exigirOrdenPropia(g, id);
      if (ajena) return ajena;
    } else {
      // Recepción y cualquier otra entidad: no hay pantalla suya que las abra.
      return NextResponse.json({ error: "Tu rol solo trabaja con sus propias solicitudes." }, { status: 403 });
    }
  }

  try {
    return NextResponse.json(await listMovimientos(entidad, id));
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
