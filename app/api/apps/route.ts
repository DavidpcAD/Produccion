import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = await getDb();
  const result = await db.request().query(`
    SELECT a.idApp, a.codigo, a.nombre, a.versionNo, a.link, a.dominio,
           a.fechaCreacion, a.creadoPor,
           (SELECT COUNT(*) FROM dbo.Rol r WHERE r.idApp = a.idApp) AS totalRoles
    FROM dbo.App a
    ORDER BY a.nombre
  `);
  return NextResponse.json({ data: result.recordset });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }

  const { codigo, nombre, versionNo, link, dominio } = await req.json();
  if (!codigo || !nombre) {
    return NextResponse.json({ error: 'Código y nombre son requeridos' }, { status: 400 });
  }

  const db = await getDb();
  try {
    const result = await db.request()
      .input('codigo', sql.NVarChar, codigo)
      .input('nombre', sql.NVarChar, nombre)
      .input('versionNo', sql.NVarChar, versionNo ?? null)
      .input('link', sql.NVarChar, link ?? null)
      .input('dominio', sql.NVarChar, dominio ?? null)
      .input('creadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        INSERT INTO dbo.App (codigo, nombre, versionNo, link, dominio, fechaCreacion, creadoPor)
        OUTPUT INSERTED.idApp
        VALUES (@codigo, @nombre, @versionNo, @link, @dominio, SYSUTCDATETIME(), @creadoPor)
      `);
    return NextResponse.json({ idApp: result.recordset[0].idApp }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/apps POST error:', err);
    if (/duplicate|UNIQUE/i.test(msg)) {
      return NextResponse.json({ error: 'Ya existe una app con ese código' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
