import { NextResponse } from "next/server";
import { jsonComprimido } from "@/lib/http/json-comprimido";
import { getSession } from "@/lib/auth";
import { mensajeParaCliente } from "@/lib/errores";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bc/inventario/almacen → datos del snapshot dbo.InventarioAlmacen para la
// pantalla "Reporte de inventario" (Business Central, SOLO Super Admin / N4). Devuelve
// la frescura de la última corrida + las filas (inventario por almacén, con categoría y
// la marca de virtual). El job lib/inventario/snapshot.ts es quien la llena; acá solo
// se lee. El refresco manual va por POST /api/bc/inventario/sync-almacen.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const pool = await getDb();
    const [estado, filas] = await Promise.all([
      pool.request().query("SELECT ultimaCorrida, filas, ok, ms, mensaje FROM dbo.InventarioAlmacenSync WHERE id = 1"),
      pool.request().query(
        "SELECT entryNo, almacen, tipoAlmacen, esVirtual, categoria, itemNo, descripcion, obra, unidad, " +
        "cantidad, cantidadProyecto, costoActual, proveedor, documentoNo, tipoMovimiento, fechaMovimiento " +
        "FROM dbo.InventarioAlmacen ORDER BY almacen, itemNo",
      ),
    ]);
    return jsonComprimido(req, { estado: estado.recordset[0] ?? null, filas: filas.recordset });
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
