import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Asigna roles a un colaborador en el modelo nuevo. Los roles viven en
// dbo.UsuarioRol (keyed por idUsuario), así que se mapea idColaborador ->
// idUsuario y se reemplaza el conjunto de roles del usuario.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const idColaborador = parseInt(id);
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const { roles, tipos } = await req.json();
  // tipos: { [idRol]: nombreTipo }. Lo que no venga → 'Indefinido'.
  const tiposMap: Record<string, string> = tipos && typeof tipos === 'object' ? tipos : {};
  const db = await getDb();

  try {
    const ures = await db.request()
      .input('idCol', sql.Int, idColaborador)
      .query('SELECT idUsuario FROM dbo.Usuario WHERE idColaborador = @idCol');
    if (!ures.recordset.length) {
      return NextResponse.json(
        { error: 'Este colaborador no tiene usuario de login; no se le pueden asignar roles.' },
        { status: 409 },
      );
    }
    const idUsuario = ures.recordset[0].idUsuario;
    const creadoPor = session.cedula ?? 'control-usuarios';

    // Reemplazar el set completo de roles del usuario
    await db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .query('DELETE FROM dbo.UsuarioRol WHERE idUsuario = @idUsuario');

    for (const idRol of (roles as number[] ?? [])) {
      const esTipo = (tiposMap[String(idRol)] || '').trim() || 'Indefinido';
      await db.request()
        .input('idUsuario', sql.Int, idUsuario)
        .input('idRol', sql.Int, idRol)
        .input('esTipo', sql.NVarChar, esTipo)
        .input('creadoPor', sql.NVarChar, creadoPor)
        .query(`
          INSERT INTO dbo.UsuarioRol (idUsuario, idRol, esTipo, fechaCreacion, creadoPor)
          VALUES (@idUsuario, @idRol, @esTipo, SYSUTCDATETIME(), @creadoPor)
        `);
    }

    await logAudit({
      idColAccion: session.idCol,
      accion: 'ASIGNAR_ROL',
      entidad: 'UsuarioRol',
      idEntidad: idColaborador,
      detalleNuevo: { roles },
      ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/usuarios/[id]/roles PUT error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
