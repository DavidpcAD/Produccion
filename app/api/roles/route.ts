import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { nivelDeRol } from '@/lib/permissions';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = await getDb();
  const result = await db.request().query(`
    SELECT r.idRol, r.nombre, r.descripcion, r.idApp,
           a.nombre AS appNombre, a.codigo AS appCodigo,
           (SELECT COUNT(*) FROM dbo.UsuarioRol ur WHERE ur.idRol = r.idRol) AS totalUsuarios
    FROM dbo.Rol r
    LEFT JOIN dbo.App a ON a.idApp = r.idApp
    ORDER BY a.nombre, r.nombre
  `);

  // Tipos por rol (dbo.TipoRol). Si la tabla no existe todavía, va vacío.
  const tiposPorRol = new Map<number, { idTipoRol: number; nombre: string }[]>();
  try {
    const t = await db.request().query(`SELECT idTipoRol, idRol, nombre FROM dbo.TipoRol WHERE esActivo = 1 ORDER BY nombre`);
    for (const row of t.recordset) {
      if (!tiposPorRol.has(row.idRol)) tiposPorRol.set(row.idRol, []);
      tiposPorRol.get(row.idRol)!.push({ idTipoRol: row.idTipoRol, nombre: row.nombre });
    }
  } catch { /* tabla TipoRol no creada */ }

  // Se exponen alias compatibles con la UI + el nivel calculado del mapa central.
  const data = result.recordset.map((r: {
    idRol: number; nombre: string; descripcion: string | null; idApp: number;
    appNombre: string | null; appCodigo: string | null; totalUsuarios: number;
  }) => ({
    IDRol: r.idRol,
    NombreRol: r.nombre,
    Descripcion: r.descripcion ?? '',
    Categoria: r.appNombre ?? 'Sin app',
    idApp: r.idApp,
    appNombre: r.appNombre,
    appCodigo: r.appCodigo,
    NivelAdmin: nivelDeRol({ nombre: r.nombre, idApp: r.idApp }),
    TotalUsuarios: r.totalUsuarios,
    Activo: true,
    tipos: tiposPorRol.get(r.idRol) ?? [],
  }));

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }

  const { nombreRol, descripcion, idApp } = await req.json();
  if (!nombreRol || !idApp) {
    return NextResponse.json({ error: 'Nombre y app son requeridos' }, { status: 400 });
  }

  const db = await getDb();
  try {
    const result = await db.request()
      .input('idApp', sql.Int, idApp)
      .input('nombre', sql.NVarChar, nombreRol)
      .input('descripcion', sql.NVarChar, descripcion ?? null)
      .input('creadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        INSERT INTO dbo.Rol (idApp, nombre, descripcion, fechaCreacion, creadoPor)
        OUTPUT INSERTED.idRol
        VALUES (@idApp, @nombre, @descripcion, SYSUTCDATETIME(), @creadoPor)
      `);
    return NextResponse.json({ idRol: result.recordset[0].idRol }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/roles POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
