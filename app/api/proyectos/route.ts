import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const db = await getDb();
  // Modelo nuevo (dbo.Proyecto): no existen Estado/FechaInicio/FechaFinEstimada/
  // Activo/CodigoBC. Se mapean con COALESCE/literales y las asignaciones se
  // cuentan vía dbo.UsuarioProyecto.
  const result = await db.request().query(`
    SELECT p.idProyecto AS IDProyecto,
           p.abreviatura AS CodigoBC,
           p.nombre AS Nombre,
           p.categoria AS Estado,
           p.linkUbicacion AS Ubicacion,
           CAST(NULL AS DATE) AS FechaInicio,
           CAST(NULL AS DATE) AS FechaFinEstimada,
           CAST(1 AS BIT) AS Activo,
           COUNT(up.idUsuarioProyecto) AS TotalPersonas
    FROM dbo.Proyecto p
    LEFT JOIN dbo.UsuarioProyecto up ON up.idProyecto = p.idProyecto
    GROUP BY p.idProyecto, p.abreviatura, p.nombre, p.categoria, p.linkUbicacion
    ORDER BY p.nombre
  `);

  return NextResponse.json({ data: result.recordset });
}
