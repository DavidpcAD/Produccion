import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession, hashPassword } from '@/lib/auth';

// CRUD de cuentas de login = dbo.Usuario (1:1 con Colaborador). El password se
// guarda hasheado (bcrypt) en passwordHash; nunca se devuelve.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';

  const db = await getDb();
  const result = await db.request()
    .input('q', sql.NVarChar, q).input('like', sql.NVarChar, `%${q}%`)
    .query(`
      SELECT u.idUsuario, u.idColaborador, u.username, u.telefono, u.fechaCreacion,
             u.fechaUltimoCambioContrasena, c.calcNombreCompleto AS colaborador, c.cedula,
             (SELECT STRING_AGG(r.nombre, ', ') FROM dbo.UsuarioRol ur
              JOIN dbo.Rol r ON r.idRol = ur.idRol WHERE ur.idUsuario = u.idUsuario) AS roles,
             (SELECT a.idApp,
                     ISNULL(a.nombre, 'Sin app') AS app,
                     a.codigo AS appCodigo,
                     STRING_AGG(r.nombre, ', ') AS roles
              FROM dbo.UsuarioRol ur
              JOIN dbo.Rol r ON r.idRol = ur.idRol
              LEFT JOIN dbo.App a ON a.idApp = r.idApp
              WHERE ur.idUsuario = u.idUsuario
              GROUP BY a.idApp, a.nombre, a.codigo
              ORDER BY ISNULL(a.nombre, 'Sin app')
              FOR JSON PATH) AS apps
      FROM dbo.Usuario u
      JOIN dbo.Colaborador c ON c.idColaborador = u.idColaborador
      WHERE (@q = '' OR u.username LIKE @like OR c.calcNombreCompleto LIKE @like OR c.cedula LIKE @like)
      ORDER BY u.username
    `);
  // `apps` viene como string JSON (FOR JSON PATH) o null si no tiene roles.
  const data = result.recordset.map((row: Record<string, unknown>) => ({
    ...row,
    apps: typeof row.apps === 'string' ? JSON.parse(row.apps) : [],
  }));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }
  const { idColaborador, username, password, telefono } = await req.json();
  if (!idColaborador || !username || !password) {
    return NextResponse.json({ error: 'Colaborador, usuario y contraseña son requeridos' }, { status: 400 });
  }
  const db = await getDb();
  try {
    const hash = await hashPassword(password);
    const r = await db.request()
      .input('idColaborador', sql.Int, Number(idColaborador))
      .input('username', sql.NVarChar, username)
      .input('hash', sql.NVarChar, hash)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('creadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        INSERT INTO dbo.Usuario
          (idColaborador, username, passwordHash, telefono, fechaUltimoCambioContrasena,
           fechaCreacion, creadoPor)
        OUTPUT INSERTED.idUsuario
        VALUES (@idColaborador, @username, @hash, @telefono, SYSUTCDATETIME(), SYSUTCDATETIME(), @creadoPor)
      `);
    return NextResponse.json({ idUsuario: r.recordset[0].idUsuario }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/cuentas POST error:', err);
    if (/duplicate|UNIQUE/i.test(msg)) {
      return NextResponse.json({ error: 'Ese usuario o colaborador ya tiene cuenta' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
