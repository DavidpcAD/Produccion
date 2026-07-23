import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }
  const { id } = await params;
  const { codigo, nombre, versionNo, link, dominio } = await req.json();

  const db = await getDb();
  await db.request()
    .input('id', sql.Int, parseInt(id))
    .input('codigo', sql.NVarChar, codigo)
    .input('nombre', sql.NVarChar, nombre)
    .input('versionNo', sql.NVarChar, versionNo ?? null)
    .input('link', sql.NVarChar, link ?? null)
    .input('dominio', sql.NVarChar, dominio ?? null)
    .input('modificadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
    .query(`
      UPDATE dbo.App
      SET codigo = @codigo, nombre = @nombre, versionNo = @versionNo, link = @link, dominio = @dominio,
          fechaModificacion = SYSUTCDATETIME(), modificadoPor = @modificadoPor
      WHERE idApp = @id
    `);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDb();

  // No permitir borrar una app con roles asociados (FK Rol.idApp)
  const inUse = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query('SELECT COUNT(*) AS n FROM dbo.Rol WHERE idApp = @id');
  if (inUse.recordset[0].n > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: la app tiene ${inUse.recordset[0].n} rol(es) asociado(s).` },
      { status: 409 },
    );
  }

  await db.request().input('id', sql.Int, parseInt(id))
    .query('DELETE FROM dbo.App WHERE idApp = @id');
  return NextResponse.json({ ok: true });
}
