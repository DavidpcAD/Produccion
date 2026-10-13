import { NextResponse } from "next/server";
import { jsonComprimido } from "@/lib/http/json-comprimido";
import { mensajeParaCliente } from "@/lib/errores";
import { getSession } from "@/lib/auth";
import { bcItems } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bc/inventario → el catálogo de artículos de Business Central para el
// presupuestista (materiales, unidad, costo unitario y tipo). Es el MISMO catálogo
// que arma Compras (`bcItems`, cacheado 5 min y sin los bloqueados), pero servido
// bajo /api/bc para que lo pueda abrir el módulo Presupuesto y no solo Compras:
// `/api/compras/bc/items` está detrás de `guardCompras`, que el presupuestista no
// pasa. Ver lib/permissions.ts (getRouteModule: /bc → presupuesto).
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const items = await bcItems();
    return jsonComprimido(req, { items });
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
