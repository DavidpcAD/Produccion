import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Lista de colaboradores activos con su estado de marcaje respecto a una zona.
// Alimenta la pantalla de enrolamiento masivo (/marcaje): quién ya está en el
// dispositivo de la zona y quién falta. Lectura directa del esquema h4.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const idZona = Number(new URL(req.url).searchParams.get('idZona'));
  if (!idZona) return NextResponse.json({ error: 'Zona requerida' }, { status: 400 });

  const db = await getDb();
  const res = await db.request()
    .input('idZona', sql.Int, idZona)
    .query(`
      SELECT c.idColaborador, c.calcNombreCompleto AS nombre, c.cedula,
             c.puesto, c.departamento,
             CASE WHEN zc.idZonaColaborador IS NOT NULL THEN 1 ELSE 0 END AS enZona,
             e.estado
      FROM dbo.V_Colaborador c
      LEFT JOIN h4.ZonaColaborador zc
        ON zc.idColaborador = c.idColaborador AND zc.idZona = @idZona AND zc.activo = 1
      LEFT JOIN h4.vZonaColaboradorEstado e ON e.idZonaColaborador = zc.idZonaColaborador
      WHERE c.esActivo = 1
      ORDER BY c.calcNombreCompleto
    `);

  const colaboradores = res.recordset.map((r: Record<string, unknown>) => ({
    ...r,
    enZona: !!r.enZona,
  }));
  return NextResponse.json({ colaboradores });
}
