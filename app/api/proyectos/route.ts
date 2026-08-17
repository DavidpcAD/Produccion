import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Por defecto se devuelven TODOS los proyectos (con su bandera Activo) para que
  // los selectores no pierdan opciones; la lista filtra a activos en el cliente.
  const incluirInactivos = new URL(req.url).searchParams.get('incluirInactivos');

  const db = await getDb();
  // Modelo nuevo (dbo.Proyecto): FechaInicio/FechaFinEstimada no existen (se
  // mapean con literales). Activo y esProductivo son columnas reales (ver
  // migración 2026-08-07_proyecto_productivo_activo.sql).
  const where = incluirInactivos === '1' || incluirInactivos === 'true' ? '' : 'WHERE p.activo = 1';
  const result = await db.request().query(`
    SELECT p.idProyecto AS IDProyecto,
           p.abreviatura AS CodigoBC,
           p.nombre AS Nombre,
           p.categoria AS Estado,
           p.linkUbicacion AS Ubicacion,
           CAST(NULL AS DATE) AS FechaInicio,
           CAST(NULL AS DATE) AS FechaFinEstimada,
           p.activo AS Activo,
           p.esProductivo AS EsProductivo,
           COUNT(up.idUsuarioProyecto) AS TotalPersonas
    FROM dbo.Proyecto p
    LEFT JOIN dbo.UsuarioProyecto up ON up.idProyecto = p.idProyecto
    ${where}
    GROUP BY p.idProyecto, p.abreviatura, p.nombre, p.categoria, p.linkUbicacion, p.activo, p.esProductivo
    ORDER BY p.nombre
  `);

  return NextResponse.json({ data: result.recordset });
}
