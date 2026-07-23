import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Asigna una persona al proyecto en el modelo nuevo (dbo.UsuarioProyecto). El
// colaborador debe tener un usuario de login; la relación se guarda por idUsuario.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const ip = req.headers.get('x-forwarded-for') ?? '';
  const { idCol } = await req.json();
  if (!idCol) return NextResponse.json({ error: 'Colaborador requerido' }, { status: 400 });

  const db = await getDb();
  try {
    const uRes = await db.request()
      .input('idCol', sql.Int, Number(idCol))
      .query('SELECT idUsuario FROM dbo.Usuario WHERE idColaborador = @idCol');
    if (!uRes.recordset.length) {
      return NextResponse.json({ error: 'Ese colaborador no tiene usuario de login. Dale acceso primero.' }, { status: 409 });
    }
    const idUsuario = uRes.recordset[0].idUsuario;

    const dup = await db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('idProyecto', sql.Int, parseInt(id))
      .query('SELECT idUsuarioProyecto FROM dbo.UsuarioProyecto WHERE idUsuario = @idUsuario AND idProyecto = @idProyecto');
    if (dup.recordset.length) {
      return NextResponse.json({ error: 'Esa persona ya está asignada a este proyecto' }, { status: 409 });
    }

    const result = await db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('idProyecto', sql.Int, parseInt(id))
      .query(`
        INSERT INTO dbo.UsuarioProyecto (idUsuario, idProyecto)
        OUTPUT INSERTED.idUsuarioProyecto
        VALUES (@idUsuario, @idProyecto)
      `);

    await logAudit({
      idColAccion: session.idCol,
      accion: 'ASIGNAR_PROYECTO',
      entidad: 'UsuarioProyecto',
      idEntidad: parseInt(id),
      detalleNuevo: { idUsuario, idProyecto: parseInt(id) },
      ip,
    });

    return NextResponse.json({ idColProy: result.recordset[0].idUsuarioProyecto }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/proyectos/[id]/asignaciones POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  await params; // ruta con [id]
  const { idColProy } = await req.json();
  const db = await getDb();

  await db.request()
    .input('id', sql.Int, idColProy)
    .query('DELETE FROM dbo.UsuarioProyecto WHERE idUsuarioProyecto = @id');

  return NextResponse.json({ ok: true });
}
