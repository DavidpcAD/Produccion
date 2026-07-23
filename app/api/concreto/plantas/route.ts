import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { PlantaListadoItem } from '@/lib/concreto/tipos';

// GET /api/concreto/plantas — catálogo de plantas Blend (para filtros).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const db = await getAdelanteDb();
    const r = await db.request().query(`
      SELECT id, codigo, marca, serial, recurso_bc, activo
      FROM hor.plantas
      WHERE activo = 1
      ORDER BY codigo
    `);
    const data: PlantaListadoItem[] = r.recordset.map((row) => ({
      id: row.id,
      codigo: row.codigo,
      marca: row.marca,
      serial: row.serial,
      recurso_bc: row.recurso_bc,
      activo: !!row.activo,
    }));
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/plantas GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
