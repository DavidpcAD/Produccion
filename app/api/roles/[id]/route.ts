import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  const rolRes = await db.request().input('id', sql.Int, parseInt(id)).query(`
    SELECT r.idRol, r.nombre, r.descripcion, r.idApp, a.nombre AS appNombre
    FROM dbo.Rol r LEFT JOIN dbo.App a ON a.idApp = r.idApp
    WHERE r.idRol = @id
  `);
  if (rolRes.recordset.length === 0) {
    return NextResponse.json({ error: 'Rol no encontrado' }, { status: 404 });
  }
  const usuariosRes = await db.request().input('id', sql.Int, parseInt(id)).query(`
    SELECT u.idUsuario, u.username, v.calcNombreCompleto AS nombre, v.cedula, v.puesto,
           ur.esTipo AS tipo
    FROM dbo.UsuarioRol ur
    JOIN dbo.Usuario u ON u.idUsuario = ur.idUsuario
    JOIN dbo.V_Colaborador v ON v.idColaborador = u.idColaborador
    WHERE ur.idRol = @id
    ORDER BY v.calcNombreCompleto
  `);

  // Catálogo de tipos del rol (si la tabla aún no existe, va vacío).
  let tipos: unknown[] = [];
  try {
    const tRes = await db.request().input('id', sql.Int, parseInt(id)).query(`
      SELECT idTipoRol, nombre FROM dbo.TipoRol WHERE idRol = @id AND esActivo = 1 ORDER BY nombre
    `);
    tipos = tRes.recordset;
  } catch { /* tabla TipoRol no creada todavía */ }

  return NextResponse.json({ ...rolRes.recordset[0], usuarios: usuariosRes.recordset, tipos });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }
  const { id } = await params;
  const { nombreRol, descripcion, idApp } = await req.json();

  const db = await getDb();
  await db.request()
    .input('id', sql.Int, parseInt(id))
    .input('nombre', sql.NVarChar, nombreRol)
    .input('descripcion', sql.NVarChar, descripcion ?? null)
    .input('idApp', sql.Int, idApp)
    .input('modificadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
    .query(`
      UPDATE dbo.Rol
      SET nombre = @nombre, descripcion = @descripcion, idApp = @idApp,
          fechaModificacion = SYSUTCDATETIME(), modificadoPor = @modificadoPor
      WHERE idRol = @id
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

  // No permitir borrar un rol con usuarios asignados (FK UsuarioRol)
  const inUse = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query('SELECT COUNT(*) AS n FROM dbo.UsuarioRol WHERE idRol = @id');
  if (inUse.recordset[0].n > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: ${inUse.recordset[0].n} usuario(s) tienen este rol.` },
      { status: 409 },
    );
  }

  await db.request().input('id', sql.Int, parseInt(id))
    .query('DELETE FROM dbo.Rol WHERE idRol = @id');
  return NextResponse.json({ ok: true });
}
