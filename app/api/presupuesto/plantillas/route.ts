import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

// Biblioteca de PLANTILLAS de presupuesto (nombradas, reutilizables entre obras).
// tipo: 'general' (Venta/Costo/Indirectos) | 'descompuesto' (materiales).

// GET            → lista de plantillas guardadas (sin el JSON pesado)
// GET ?id=123    → una plantilla con sus datos
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const db = await getDb();
  const id = Number(req.nextUrl.searchParams.get('id')) || 0;
  if (id) {
    const r = await db.request().input('id', sql.Int, id)
      .query(`SELECT idPlantilla, nombre, tipo, archivo, datosJSON FROM dbo.PresupuestoPlantilla WHERE idPlantilla = @id AND esActivo = 1`);
    const row = r.recordset[0];
    if (!row) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    return NextResponse.json({ idPlantilla: row.idPlantilla, nombre: row.nombre, tipo: row.tipo, archivo: row.archivo, datos: JSON.parse(row.datosJSON) });
  }
  const r = await db.request()
    .query(`SELECT idPlantilla, nombre, tipo, archivo, fechaActualizacion FROM dbo.PresupuestoPlantilla WHERE esActivo = 1 ORDER BY nombre, tipo`);
  return NextResponse.json({ plantillas: r.recordset });
}

// POST { nombre, tipo, archivo?, datos } → upsert por (nombre, tipo)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const nombre = String(body.nombre ?? '').trim();
  const tipo = String(body.tipo ?? '').trim();
  const archivo = String(body.archivo ?? '').trim() || null;
  const datos = body.datos;
  if (!nombre) return NextResponse.json({ error: 'Poné un nombre a la plantilla' }, { status: 400 });
  if (tipo !== 'general' && tipo !== 'descompuesto') return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
  if (datos == null) return NextResponse.json({ error: 'No hay datos para guardar' }, { status: 400 });

  const db = await getDb();
  const r = await db.request()
    .input('nombre', sql.NVarChar(150), nombre)
    .input('tipo', sql.VarChar(20), tipo)
    .input('archivo', sql.NVarChar(255), archivo)
    .input('datos', sql.NVarChar(sql.MAX), JSON.stringify(datos))
    .input('creadoPor', sql.Int, session.idCol ?? null)
    .query(`
      UPDATE dbo.PresupuestoPlantilla SET datosJSON=@datos, archivo=@archivo, fechaActualizacion=SYSUTCDATETIME()
        WHERE nombre=@nombre AND tipo=@tipo AND esActivo=1;
      IF @@ROWCOUNT = 0
        INSERT INTO dbo.PresupuestoPlantilla (nombre, tipo, archivo, datosJSON, creadoPor)
        VALUES (@nombre, @tipo, @archivo, @datos, @creadoPor);
      SELECT idPlantilla FROM dbo.PresupuestoPlantilla WHERE nombre=@nombre AND tipo=@tipo AND esActivo=1;`);
  return NextResponse.json({ ok: true, idPlantilla: r.recordset?.[0]?.idPlantilla ?? null });
}

// DELETE ?id=123 → baja lógica
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const id = Number(req.nextUrl.searchParams.get('id')) || 0;
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
  const db = await getDb();
  await db.request().input('id', sql.Int, id).query(`UPDATE dbo.PresupuestoPlantilla SET esActivo=0 WHERE idPlantilla=@id`);
  return NextResponse.json({ ok: true });
}
