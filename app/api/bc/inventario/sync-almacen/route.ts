import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { mensajeParaCliente } from "@/lib/errores";
import { getDb } from "@/lib/db";
import { refrescarInventarioAlmacen } from "@/lib/inventario/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/bc/inventario/sync-almacen → recarga el snapshot dbo.InventarioAlmacen
// desde BC (movimientos de inventario SIN LIQUIDAR = Item Ledger Entry abiertas, con
// la categoría del artículo y la marca de almacén virtual). Lo consume la app de
// Reportes por SQL. Se dispara:
//   · de noche, por un scheduler externo → header `x-sync-secret: <INVENTARIO_SYNC_SECRET>`
//   · a mano, desde un admin de Producción (sesión con nivelAdmin ≥ 2).
async function autorizado(req: Request): Promise<boolean> {
  const secret = process.env.INVENTARIO_SYNC_SECRET;
  if (secret && req.headers.get("x-sync-secret") === secret) return true;
  const session = await getSession();
  return !!session && session.nivelAdmin >= 2;
}

export async function POST(req: Request) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const r = await refrescarInventarioAlmacen();
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

// GET → frescura de la última corrida (para ver el estado sin abrir SQL). Solo admin.
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const pool = await getDb();
    const r = await pool.request().query(
      "SELECT ultimaCorrida, filas, ok, ms, mensaje FROM dbo.InventarioAlmacenSync WHERE id = 1",
    );
    return NextResponse.json(r.recordset[0] ?? null);
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
