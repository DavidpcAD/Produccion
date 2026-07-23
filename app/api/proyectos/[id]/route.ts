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
             p.nombre AS Nombre, p.categoria AS Estado
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
