import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pagina = parseInt(searchParams.get('pagina') ?? '1');
  const porPagina = parseInt(searchParams.get('porPagina') ?? '25');
  const accion = searchParams.get('accion') ?? '';
  const offset = (pagina - 1) * porPagina;

  const db = await getDb();
  let where = 'WHERE 1=1';

  const request = db.request()
    .input('offset', sql.Int, offset)
    .input('porPagina', sql.Int, porPagina);

  if (accion) {
    request.input('accion', sql.NVarChar, accion);
    where += ' AND ua.Accion = @accion';
  }

  const countRes = await db.request()
    .query(`SELECT COUNT(*) as total FROM dbo.UsuarioAuditLog ua ${where.replace("WHERE 1=1 AND ua.Accion = @accion", accion ? `WHERE ua.Accion = '${accion}'` : 'WHERE 1=1')}`);

  const dataRes = await request.query(`
    SELECT ua.IDAudit, ua.Accion, ua.Entidad, ua.IDEntidad,
           ua.DetallePrevio, ua.DetalleNuevo, ua.IP, ua.FechaAccion,
           c.calcNombreCompleto AS Actor
    FROM dbo.UsuarioAuditLog ua
    LEFT JOIN dbo.Colaborador c ON c.idColaborador = ua.IDColAccion
    ${where}
    ORDER BY ua.FechaAccion DESC
    OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY
  `);

  return NextResponse.json({
    data: dataRes.recordset,
    total: countRes.recordset[0].total,
    paginas: Math.ceil(countRes.recordset[0].total / porPagina),
  });
}
