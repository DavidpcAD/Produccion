import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Catálogo de partidas y subpartidas de Business Central. Se usan para asignar
// la tarea (partida/subpartida) de cada cuadrilla — es obligatorio por ley.
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const db = await getDb();
  const [etapas, partidas, subpartidas] = await Promise.all([
    db.request().query(`
      SELECT id AS idEtapa, codigo, nombre
      FROM dbo.Etapa
      WHERE activo = 1
      ORDER BY codigo
    `),
    db.request().query(`
      SELECT idPartida, codigo, nombre, idEtapa
      FROM dbo.Partida
      WHERE esActivo = 1
      ORDER BY codigo
    `),
    db.request().query(`
      SELECT idSubPartida, codigo, nombre, idPartida, numSprint, esCritica, descripcion
      FROM dbo.SubPartida
      WHERE esActivo = 1
      ORDER BY codigo
    `),
  ]);

  return NextResponse.json({
    etapas: etapas.recordset,
    partidas: partidas.recordset,
    subpartidas: subpartidas.recordset,
  });
}
