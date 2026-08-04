import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Subpartidas ya tomadas por cuadrillas activas en un proyecto (para bloquearlas
// en el selector). ?idProyecto=..&excluir=<idCuadrilla opcional>
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const idProyecto = Number(searchParams.get('idProyecto')) || 0;
  const excluir = Number(searchParams.get('excluir')) || 0;
  if (!idProyecto) return NextResponse.json({ data: [] });

  const db = await getDb();
  try {
    const res = await db.request()
      .input('idProyecto', sql.Int, idProyecto)
      .input('excluir', sql.Int, excluir)
      .query(`
        SELECT cs.idSubPartida, c.Nombre AS cuadrilla, sp.codigo AS subCodigo
        FROM dbo.CuadrillaSubPartida cs
        JOIN dbo.Cuadrilla c ON c.IDCuadrilla = cs.IDCuadrilla AND c.Activo = 1
        JOIN pro_obc.sub_partidas sp ON sp.id = cs.idSubPartida
        WHERE cs.idProyecto = @idProyecto AND (@excluir = 0 OR cs.IDCuadrilla <> @excluir)
      `);
    return NextResponse.json({ data: res.recordset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Si falta la columna idProyecto (migración no corrida), no bloquear nada.
    if (/idProyecto|Invalid column/i.test(msg)) return NextResponse.json({ data: [] });
    console.error('/api/cuadrillas/subpartidas-ocupadas error:', err);
    return NextResponse.json({ data: [] });
  }
}
