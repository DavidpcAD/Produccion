import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();

  // Modelo nuevo (dbo.Proyecto). Las personas asignadas se leen de
  // dbo.UsuarioProyecto -> dbo.Usuario -> dbo.V_Colaborador.
  const proyRes = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT p.idProyecto AS IDProyecto, p.abreviatura AS CodigoBC,
             p.nombre AS Nombre, p.categoria AS Estado,
             p.activo AS Activo, p.esProductivo AS EsProductivo
      FROM dbo.Proyecto p
      WHERE p.idProyecto = @id
    `);

  if (!proyRes.recordset.length) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const asigRes = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT up.idUsuarioProyecto AS IDColProy, v.idColaborador AS IDCol,
             v.calcNombreCompleto AS NombreCompleto, v.cedula AS Cedula, v.puesto AS Puesto,
             v.puesto AS NombreRol, NULL AS TaskNoBC, NULL AS DescripcionTask,
             CAST(1 AS BIT) AS Activo, NULL AS FechaAsignacion
      FROM dbo.UsuarioProyecto up
      JOIN dbo.Usuario u ON u.idUsuario = up.idUsuario
      JOIN dbo.V_Colaborador v ON v.idColaborador = u.idColaborador
      WHERE up.idProyecto = @id
      ORDER BY v.calcNombreCompleto
    `);

  return NextResponse.json({
    ...proyRes.recordset[0],
    asignaciones: asigRes.recordset,
  });
}

/**
 * PATCH /api/proyectos/{id} — marca el proyecto como productivo (pertenece a
 * Producción) y/o lo activa/inactiva. Body: { esProductivo?, activo? }.
 * Inactivar no borra nada: el proyecto deja de aparecer en selectores pero sus
 * obras y asignaciones siguen existiendo.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const sets: string[] = [];
  const r = (await getDb()).request().input('id', sql.Int, parseInt(id));
  if (body.esProductivo !== undefined) {
    sets.push('esProductivo = @esProductivo');
    r.input('esProductivo', sql.Bit, body.esProductivo ? 1 : 0);
  }
  if (body.activo !== undefined) {
    sets.push('activo = @activo');
    r.input('activo', sql.Bit, body.activo ? 1 : 0);
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar (esProductivo/activo).' }, { status: 400 });
  }

  try {
    const res = await r.query(`
      UPDATE dbo.Proyecto SET ${sets.join(', ')}
      OUTPUT INSERTED.idProyecto AS IDProyecto, INSERTED.activo AS Activo, INSERTED.esProductivo AS EsProductivo
      WHERE idProyecto = @id
    `);
    if (res.recordset.length === 0) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...res.recordset[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/proyectos/[id] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
