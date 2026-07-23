import { NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getPostventaObras, bcConfigured } from '@/lib/bc-client';

// Obras "Postventa" (N° PV-…), destino al bloquear una obra (el usuario elige).
// Fuente preferida: Business Central (API postventaObras), que es donde se
// escribe la actividad. Fallback: la tabla Obra de la app.
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (bcConfigured()) {
    try {
      const list = await getPostventaObras();
      return NextResponse.json({
        data: list.map(o => ({ idObra: 0, numeroObra: o.no, nombreMostrado: o.description })),
        source: 'bc',
      });
    } catch (err) {
      console.error('/api/obras/postventas BC error (uso fallback SQL):', err);
    }
  }

  // Fallback SQL.
  const db = await getDb();
  const res = await db.request()
    .input('patron', sql.NVarChar, 'PV-%')
    .query(`
      SELECT idObra, numeroObra, nombreMostrado
      FROM dbo.Obra
      WHERE numeroObra LIKE @patron
      ORDER BY numeroObra
    `);
  return NextResponse.json({ data: res.recordset, source: 'sql' });
}
