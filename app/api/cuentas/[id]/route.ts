import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession, hashPassword } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }
  const { id } = await params;
  const { username, telefono, idColaborador, password } = await req.json();
  if (!username) {
    return NextResponse.json({ error: 'El usuario es requerido' }, { status: 400 });
  }

  const db = await getDb();
  try {
    const reqObj = db.request()
      .input('id', sql.Int, parseInt(id))
      .input('username', sql.NVarChar, username)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('modificadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios');

    let pwdSet = '';
    if (password) {
      reqObj.input('hash', sql.NVarChar, await hashPassword(password));
      pwdSet = ', passwordHash = @hash, fechaUltimoCambioContrasena = SYSUTCDATETIME()';
    }
    let colSet = '';
    if (idColaborador) {
      reqObj.input('idColaborador', sql.Int, Number(idColaborador));
      colSet = ', idColaborador = @idColaborador';
    }

    await reqObj.query(`
      UPDATE dbo.Usuario SET
        username = @username, telefono = @telefono${colSet}${pwdSet},
        fechaModificacion = SYSUTCDATETIME(), modificadoPor = @modificadoPor
      WHERE idUsuario = @id
    `);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/cuentas/[id] PATCH error:', err);
    if (/duplicate|UNIQUE/i.test(msg)) {
      return NextResponse.json({ error: 'Ese usuario ya existe' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo completar la operación. Intentá de nuevo.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDb();
  try {
    const idUsuario = parseInt(id);
    // Limpiar las tablas puente que gestiona esta app (roles, apps, proyectos)
    for (const t of ['dbo.UsuarioRol', 'dbo.UsuarioApp', 'dbo.UsuarioProyecto']) {
      await db.request().input('id', sql.Int, idUsuario).query(`DELETE FROM ${t} WHERE idUsuario = @id`);
    }
    await db.request().input('id', sql.Int, idUsuario).query('DELETE FROM dbo.Usuario WHERE idUsuario = @id');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/cuentas/[id] DELETE error:', err);
    if (/REFERENCE|FK_|conflicted/i.test(msg)) {
      return NextResponse.json(
        { error: 'No se puede eliminar: la cuenta tiene registros asociados (préstamos, eventos, notificaciones…).' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'No se pudo completar la operación. Intentá de nuevo.' }, { status: 500 });
  }
}
