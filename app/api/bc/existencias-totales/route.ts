import { NextResponse } from "next/server";
import { jsonComprimido } from "@/lib/http/json-comprimido";
import { mensajeParaCliente } from "@/lib/errores";
import { getSession } from "@/lib/auth";
import { bcExistenciasTotales } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bc/existencias-totales → el stock TOTAL de cada artículo de BC, para la
// columna "Cantidad" del inventario del presupuestista. El servidor lo agrega por
// almacén (ver bcExistenciasTotales) y lo cachea 5 min, así una sola llamada del
// navegador trae todo el catálogo y las visitas siguientes son instantáneas.
// Bajo /api/bc (módulo presupuesto): /api/compras/bc/* está detrás de guardCompras.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const map = await bcExistenciasTotales();
    // Map → objeto plano { code: { total, almacenes, unidad } } para el cliente.
    const items = Object.fromEntries(map);
    return jsonComprimido(req, { items, hayDatos: map.size > 0 });
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
