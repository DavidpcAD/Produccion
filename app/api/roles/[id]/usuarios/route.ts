import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Candidatos para asignar a un rol: usuarios con cuenta de login que aún no
// tienen este rol. Jefe de Área o superior.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDb();
  const res = await db.request().input('id', sql.Int, parseInt(id)).query(`
    SELECT u.idUsuario, u.username, v.calcNombreCompleto AS nombre, v.puesto
    FROM dbo.Usuario u
    JOIN dbo.V_Colaborador v ON v.idColaborador = u.idColaborador
    WHERE NOT EXISTS (
      SELECT 1 FROM dbo.UsuarioRol ur
      WHERE ur.idUsuario = u.idUsuario AND ur.idRol = @id
    )
    ORDER BY v.calcNombreCompleto
  `);
  return NextResponse.json({ candidatos: res.recordset });
}

// Asigna este rol a un usuario existente. Jefe de Área o superior.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id } = await params;
  const idRol = parseInt(id);
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json();
  const idUsuario = Number(body.idUsuario);
  const esTipo = typeof body.esTipo === 'string' && body.esTipo.trim() ? body.esTipo.trim() : 'Indefinido';
  if (!idUsuario) return NextResponse.json({ error: 'idUsuario requerido' }, { status: 400 });

  const db = await getDb();
  try {
    const exists = await db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('idRol', sql.Int, idRol)
      .query('SELECT 1 FROM dbo.UsuarioRol WHERE idUsuario = @idUsuario AND idRol = @idRol');
    if (exists.recordset.length) {
      return NextResponse.json({ error: 'El usuario ya tiene este rol' }, { status: 409 });
    }

    await db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('idRol', sql.Int, idRol)
      .input('esTipo', sql.NVarChar, esTipo)
      .input('creadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        INSERT INTO dbo.UsuarioRol (idUsuario, idRol, esTipo, fechaCreacion, creadoPor)
        VALUES (@idUsuario, @idRol, @esTipo, SYSUTCDATETIME(), @creadoPor)
      `);

    await logAudit({
      idColAccion: session.idCol,
      accion: 'ASIGNAR_ROL',
      entidad: 'UsuarioRol',
      idEntidad: idRol,
      detalleNuevo: { idUsuario, idRol, tipo: esTipo },
      ip,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/roles/[id]/usuarios POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Quita este rol a un usuario. Jefe de Área o superior.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id } = await params;
  const idRol = parseInt(id);
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const { searchParams } = new URL(req.url);
  const idUsuario = Number(searchParams.get('idUsuario'));
  if (!idUsuario) return NextResponse.json({ error: 'idUsuario requerido' }, { status: 400 });

  const db = await getDb();
  try {
    await db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('idRol', sql.Int, idRol)
      .query('DELETE FROM dbo.UsuarioRol WHERE idUsuario = @idUsuario AND idRol = @idRol');

    await logAudit({
      idColAccion: session.idCol,
      accion: 'REVOCAR_ROL',
      entidad: 'UsuarioRol',
      idEntidad: idRol,
      detallePrevio: { idUsuario, idRol },
      ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/roles/[id]/usuarios DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
