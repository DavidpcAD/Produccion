import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Crea una cuenta de login (acceso a las apps) para un colaborador existente,
// asignando opcionalmente sus roles. Jefe de Área o superior.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado para crear accesos' }, { status: 403 });
  }

  const { id } = await params;
  const idColaborador = parseInt(id);
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json();
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const telefono = body.telefono ? String(body.telefono).trim() : null;
  const roles: number[] = Array.isArray(body.roles) ? body.roles.map(Number).filter(Boolean) : [];
  const tiposMap: Record<string, string> = body.tipos && typeof body.tipos === 'object' ? body.tipos : {};

  if (!username) return NextResponse.json({ error: 'El usuario (username) es requerido' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });

  const db = await getDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();

    // El colaborador no debe tener ya una cuenta.
    const existing = await new sql.Request(tx)
      .input('idCol', sql.Int, idColaborador)
      .query('SELECT idUsuario FROM dbo.Usuario WHERE idColaborador = @idCol');
    if (existing.recordset.length) {
      await tx.rollback();
      return NextResponse.json({ error: 'Este colaborador ya tiene una cuenta de acceso' }, { status: 409 });
    }

    const hash = await hashPassword(password);
    const creadoPor = session.cedula ?? 'control-usuarios';
    const ins = await new sql.Request(tx)
      .input('idColaborador', sql.Int, idColaborador)
      .input('username', sql.NVarChar, username)
      .input('hash', sql.NVarChar, hash)
      .input('telefono', sql.NVarChar, telefono)
      .input('creadoPor', sql.NVarChar, creadoPor)
      .query(`
        INSERT INTO dbo.Usuario
          (idColaborador, username, passwordHash, telefono, fechaUltimoCambioContrasena,
           fechaCreacion, creadoPor)
        OUTPUT INSERTED.idUsuario
        VALUES (@idColaborador, @username, @hash, @telefono, SYSUTCDATETIME(), SYSUTCDATETIME(), @creadoPor)
      `);
    const idUsuario = ins.recordset[0].idUsuario;

    for (const idRol of roles) {
      const esTipo = (tiposMap[String(idRol)] || '').trim() || 'Indefinido';
      await new sql.Request(tx)
        .input('idUsuario', sql.Int, idUsuario)
        .input('idRol', sql.Int, idRol)
        .input('esTipo', sql.NVarChar, esTipo)
        .input('creadoPor', sql.NVarChar, creadoPor)
        .query(`
          INSERT INTO dbo.UsuarioRol (idUsuario, idRol, esTipo, fechaCreacion, creadoPor)
          VALUES (@idUsuario, @idRol, @esTipo, SYSUTCDATETIME(), @creadoPor)
        `);
    }

    await tx.commit();

    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_ACCESO',
      entidad: 'Usuario',
      idEntidad: idColaborador,
      detalleNuevo: { username, roles },
      ip,
    });

    return NextResponse.json({ idUsuario }, { status: 201 });
  } catch (err: unknown) {
    try { await tx.rollback(); } catch { /* ya revertida */ }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/usuarios/[id]/login POST error:', err);
    if (/duplicate|UNIQUE/i.test(msg)) {
      return NextResponse.json({ error: 'Ese usuario ya existe' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo completar la operación. Intentá de nuevo.' }, { status: 500 });
  }
}

// Actualiza el username y/o la contraseña de la cuenta de login de un
// colaborador. Jefe de Área o superior.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado para editar accesos' }, { status: 403 });
  }

  const { id } = await params;
  const idColaborador = parseInt(id);
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json();
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username) return NextResponse.json({ error: 'El usuario (username) es requerido' }, { status: 400 });
  if (password && password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  }

  const db = await getDb();
  try {
    const ures = await db.request()
      .input('idCol', sql.Int, idColaborador)
      .query('SELECT idUsuario, username FROM dbo.Usuario WHERE idColaborador = @idCol');
    if (!ures.recordset.length) {
      return NextResponse.json({ error: 'Este colaborador no tiene cuenta de acceso' }, { status: 409 });
    }
    const idUsuario = ures.recordset[0].idUsuario;
    const usernamePrevio = ures.recordset[0].username;

    const cambiaUsername = username !== usernamePrevio;
    if (!cambiaUsername && !password) {
      return NextResponse.json({ ok: true, username }); // nada que cambiar
    }

    const dbReq = db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('modificadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios');
    const sets: string[] = ['fechaModificacion = SYSUTCDATETIME()', 'modificadoPor = @modificadoPor'];
    if (cambiaUsername) { dbReq.input('username', sql.NVarChar, username); sets.push('username = @username'); }
    if (password) {
      const hash = await hashPassword(password);
      dbReq.input('hash', sql.NVarChar, hash);
      sets.push('passwordHash = @hash', 'fechaUltimoCambioContrasena = SYSUTCDATETIME()');
    }

    await dbReq.query(`UPDATE dbo.Usuario SET ${sets.join(', ')} WHERE idUsuario = @idUsuario`);

    await logAudit({
      idColAccion: session.idCol,
      accion: 'EDITAR_ACCESO',
      entidad: 'Usuario',
      idEntidad: idColaborador,
      detallePrevio: { username: usernamePrevio },
      detalleNuevo: { username, contrasenaCambiada: !!password },
      ip,
    });

    return NextResponse.json({ ok: true, username });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/usuarios/[id]/login PATCH error:', err);
    if (/duplicate|UNIQUE/i.test(msg)) {
      return NextResponse.json({ error: 'Ese usuario ya existe' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo completar la operación. Intentá de nuevo.' }, { status: 500 });
  }
}

// Revoca el acceso: elimina la cuenta de login del colaborador (y sus roles /
// asignaciones de proyecto). El colaborador se conserva. Jefe de Área o superior.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado para revocar accesos' }, { status: 403 });
  }

  const { id } = await params;
  const idColaborador = parseInt(id);
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';

  const db = await getDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();

    const ures = await new sql.Request(tx)
      .input('idCol', sql.Int, idColaborador)
      .query('SELECT idUsuario, username FROM dbo.Usuario WHERE idColaborador = @idCol');
    if (!ures.recordset.length) {
      await tx.rollback();
      return NextResponse.json({ error: 'Este colaborador no tiene cuenta de acceso' }, { status: 409 });
    }
    const idUsuario = ures.recordset[0].idUsuario;
    const username = ures.recordset[0].username;

    const reqDel = () => new sql.Request(tx).input('idUsuario', sql.Int, idUsuario);
    await reqDel().query('DELETE FROM dbo.UsuarioRol WHERE idUsuario = @idUsuario');
    await reqDel().query('DELETE FROM dbo.UsuarioProyecto WHERE idUsuario = @idUsuario');
    await reqDel().query('DELETE FROM dbo.Usuario WHERE idUsuario = @idUsuario');

    await tx.commit();

    await logAudit({
      idColAccion: session.idCol,
      accion: 'REVOCAR_ACCESO',
      entidad: 'Usuario',
      idEntidad: idColaborador,
      detallePrevio: { username },
      ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    try { await tx.rollback(); } catch { /* ya revertida */ }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/usuarios/[id]/login DELETE error:', err);
    return NextResponse.json({ error: 'No se pudo completar la operación. Intentá de nuevo.' }, { status: 500 });
  }
}
