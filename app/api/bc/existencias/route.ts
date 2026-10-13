import { NextRequest, NextResponse } from "next/server";
import { jsonComprimido } from "@/lib/http/json-comprimido";
import { mensajeParaCliente } from "@/lib/errores";
import { getSession } from "@/lib/auth";
import { bcExistencias, bcItemFichas } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bc/existencias?item=M01-0001 → cuánto hay HOY de UN artículo en BC,
// almacén por almacén, para la ficha del inventario del presupuestista. Es de a un
// artículo a propósito: se pide solo cuando se abre la fila, no para los ~5.500 del
// catálogo (serían 5.500 consultas a BC). El mismo dato que ve Compras en la bandeja
// de aprobación, pero bajo /api/bc para el módulo Presupuesto.
//
// `total: null` = BC no contestó. No es cero: cero es un dato y se muestra.
// `conocido: false` = BC ni siquiera tiene ficha de ese código (un "0" ahí sería
// mentira: no es que no haya, es que no existe el artículo).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const item = (req.nextUrl.searchParams.get("item") ?? "").trim();
  if (!item) {
    return NextResponse.json({ error: "Se requiere item." }, { status: 400 });
  }

  try {
    const fichas = await bcItemFichas([item]);
    const f = fichas.get(item);
    let total: number | null = null;
    let almacenes: { almacen: string; variante: string; cantidad: number; unidad: string }[] = [];
    try {
      const filas = await bcExistencias({ itemNo: item });
      total = filas.reduce((s, e) => s + (Number(e.cantidad) || 0), 0);
      almacenes = filas
        .filter((e) => (Number(e.cantidad) || 0) !== 0)
        .map((e) => ({ almacen: e.locationCode, variante: e.variantCode, cantidad: Number(e.cantidad) || 0, unidad: e.unidad }))
        .sort((a, b) => b.cantidad - a.cantidad);
    } catch { /* queda en "no se sabe"; la ficha sí se devuelve */ }

    return jsonComprimido(req, {
      tipo: f?.tipo ?? "inventario",
      base: f?.base ?? "",
      conocido: !!f,
      total,
      almacenes,
    });
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
