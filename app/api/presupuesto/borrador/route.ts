import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

// Borradores de presupuesto guardados por obra (plantilla y descompuesto). Permite
// cargar un Excel, editarlo y guardarlo en la base para reusarlo/editarlo luego.

// GET ?idObra=123  → { plantilla: {archivo, datos} | null, descompuesto: {…} | null }
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const idObra = Number(req.nextUrl.searchParams.get('idObra')) || 0;
  if (!idObra) return NextResponse.json({ error: 'Falta idObra' }, { status: 400 });

  const db = await getDb();
  const r = await db.request().input('idObra', sql.Int, idObra)
    .query(`SELECT tipo, archivo, datosJSON, fechaActualizacion FROM dbo.PresupuestoBorrador WHERE idObra = @idObra AND esActivo = 1`);
  const out: Record<string, unknown> = {};
  for (const row of r.recordset) {
    try { out[row.tipo] = { archivo: row.archivo, datos: JSON.parse(row.datosJSON), fecha: row.fechaActualizacion }; }
    catch { /* ignore json malo */ }
  }
  return NextResponse.json(out);
}

// POST { idObra, worksNo, tipo: 'plantilla'|'descompuesto', archivo, datos } → upsert
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const idObra = Number(body.idObra) || 0;
  const worksNo = String(body.worksNo ?? '').trim() || null;
  const tipo = String(body.tipo ?? '').trim();
  const archivo = String(body.archivo ?? '').trim() || null;
  const datos = body.datos;

  if (!idObra) return NextResponse.json({ error: 'Falta la obra' }, { status: 400 });
  if (tipo !== 'plantilla' && tipo !== 'descompuesto') return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
  if (datos == null) return NextResponse.json({ error: 'No hay datos para guardar' }, { status: 400 });

  const datosJSON = JSON.stringify(datos);
  const db = await getDb();
  const r = await db.request()
    .input('idObra', sql.Int, idObra)
    .input('worksNo', sql.VarChar(50), worksNo)
    .input('tipo', sql.VarChar(20), tipo)
    .input('archivo', sql.NVarChar(255), archivo)
    .input('datos', sql.NVarChar(sql.MAX), datosJSON)
    .input('creadoPor', sql.Int, session.idCol ?? null)
    .query(`
      UPDATE dbo.PresupuestoBorrador
        SET datosJSON = @datos, archivo = @archivo, worksNo = @worksNo, fechaActualizacion = SYSUTCDATETIME()
        WHERE idObra = @idObra AND tipo = @tipo AND esActivo = 1;
      IF @@ROWCOUNT = 0
        INSERT INTO dbo.PresupuestoBorrador (idObra, worksNo, tipo, archivo, datosJSON, creadoPor)
        VALUES (@idObra, @worksNo, @tipo, @archivo, @datos, @creadoPor);
      SELECT idBorrador FROM dbo.PresupuestoBorrador WHERE idObra = @idObra AND tipo = @tipo AND esActivo = 1;
    `);
  return NextResponse.json({ ok: true, idBorrador: r.recordset?.[0]?.idBorrador ?? null });
}
