import { NextRequest, NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
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
  const idProyecto = Number(id);
  const ip = req.headers.get('x-forwarded-for') ?? '';
  const { idCol } = await req.json();
  // Se validan antes de consultar: `sql.Int` manda un NaN como NULL y la fila
  // entraría con idProyecto en NULL.
  if (!Number.isInteger(idProyecto) || idProyecto <= 0) {
    return NextResponse.json({ error: 'Proyecto no válido' }, { status: 400 });
  }
  if (!Number.isInteger(Number(idCol)) || Number(idCol) <= 0) {
    return NextResponse.json({ error: 'Colaborador requerido' }, { status: 400 });
  }

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
      .input('idProyecto', sql.Int, idProyecto)
      .query('SELECT idUsuarioProyecto FROM dbo.UsuarioProyecto WHERE idUsuario = @idUsuario AND idProyecto = @idProyecto');
    if (dup.recordset.length) {
      return NextResponse.json({ error: 'Esa persona ya está asignada a este proyecto' }, { status: 409 });
    }

    const result = await db.request()
      .input('idUsuario', sql.Int, idUsuario)
      .input('idProyecto', sql.Int, idProyecto)
      .query(`
        INSERT INTO dbo.UsuarioProyecto (idUsuario, idProyecto)
        OUTPUT INSERTED.idUsuarioProyecto
        VALUES (@idUsuario, @idProyecto)
      `);

    await logAudit({
      idColAccion: session.idCol,
      accion: 'ASIGNAR_PROYECTO',
      entidad: 'UsuarioProyecto',
      idEntidad: idProyecto,
      detalleNuevo: { idUsuario, idProyecto },
      ip,
    });

    return NextResponse.json({ idColProy: result.recordset[0].idUsuarioProyecto }, { status: 201 });
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/proyectos/[id]/asignaciones POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const idProyecto = Number(id);
  const { idColProy } = await req.json();
  if (!Number.isInteger(idProyecto) || idProyecto <= 0 || !Number.isInteger(idColProy) || idColProy <= 0) {
    return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });
  }
  const db = await getDb();

  // El DELETE va atado al proyecto de la URL. Antes el `[id]` se descartaba a
  // propósito y el id de la asignación venía suelto en el cuerpo, así que desde
  // el endpoint de CUALQUIER proyecto se borraba una asignación de otro. Y como
  // esto borra de verdad (no da de baja), la fila no volvía.
  const r = await db.request()
    .input('id', sql.Int, idColProy)
    .input('idProyecto', sql.Int, idProyecto)
    .query('DELETE FROM dbo.UsuarioProyecto WHERE idUsuarioProyecto = @id AND idProyecto = @idProyecto');

  // Si no borró nada, se dice: antes devolvía ok:true y la pantalla cantaba
  // "Persona retirada del proyecto" sin haber retirado a nadie.
  if (!r.rowsAffected[0]) {
    return NextResponse.json({ error: 'Esa persona no está asignada a este proyecto' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
