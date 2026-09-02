import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { listarTiposObra, mapaAreaCosteoTipo, TIPO_POR_DEFECTO } from '@/lib/partidas/tipos-obra';

export const dynamic = 'force-dynamic';

// Los cinco tipos de obra del catálogo (O/I/A/F/T) con cuántos grupos, partidas y
// subpartidas tiene cada uno. Es lo que alimenta las pestañas de /partidas.
// Torres puede venir en 0/0/0: existe a propósito y se llena a mano.
//
// ?conObras=1 agrega las obras de BC que caen en cada tipo según su área de costeo
// (dbo.Obra + pro_obc.tipo_obra_area_costeo). Se usa para el filtro por obra y
// para "Traer de BC" — incluye obras que todavía no tienen nada en el catálogo.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const conObras = new URL(req.url).searchParams.get('conObras') === '1';

  const db = await getAdelanteDb();
  const [tipos, conteos] = await Promise.all([
    listarTiposObra(),
    db.request().query<{
      tipo_obra: string; grupos: number; partidas: number; subpartidas: number; obras: number;
    }>(`
      SELECT g.tipo_obra,
             COUNT(DISTINCT g.id)  AS grupos,
             COUNT(DISTINCT p.id)  AS partidas,
             COUNT(DISTINCT sp.id) AS subpartidas,
             COUNT(DISTINCT g.bc_works_no) AS obras
      FROM pro_obc.grupos_partida g
      LEFT JOIN pro_obc.partidas p      ON p.grupo_id = g.id AND p.activo = 1
      LEFT JOIN pro_obc.sub_partidas sp ON sp.partida_id = p.id AND sp.activo = 1
      WHERE g.activo = 1
      GROUP BY g.tipo_obra
    `),
  ]);

  // Obras de BC por tipo (opcional): dbo.Obra vive en otra base que pro_obc, así
  // que el cruce se hace acá y no en SQL (Azure SQL no permite cross-database).
  const obrasPorTipo = new Map<string, { numeroObra: string; nombre: string }[]>();
  if (conObras) {
    try {
      const [app, mapa] = await Promise.all([getDb(), mapaAreaCosteoTipo()]);
      const r = await app.request().query<{
        numeroObra: string; nombreMostrado: string | null; descripcion: string | null; areaCosteo: string | null;
      }>('SELECT numeroObra, nombreMostrado, descripcion, areaCosteo FROM dbo.Obra ORDER BY numeroObra');
      for (const o of r.recordset) {
        const tipo = mapa.get(String(o.areaCosteo ?? '').trim().toUpperCase()) ?? TIPO_POR_DEFECTO;
        if (!obrasPorTipo.has(tipo)) obrasPorTipo.set(tipo, []);
        obrasPorTipo.get(tipo)!.push({
          numeroObra: String(o.numeroObra).trim(),
          nombre: (o.descripcion || o.nombreMostrado || '').trim(),
        });
      }
    } catch (e) {
      console.error('/api/tipos-obra obras error:', e);
    }
  }

  const porTipo = new Map(conteos.recordset.map((c) => [c.tipo_obra, c]));
  return NextResponse.json({
    tipos: tipos.map((t) => {
      const c = porTipo.get(t.codigo);
      return {
        ...t,
        grupos: Number(c?.grupos) || 0,
        partidas: Number(c?.partidas) || 0,
        subpartidas: Number(c?.subpartidas) || 0,
        obras: Number(c?.obras) || 0,
        obrasBC: conObras ? (obrasPorTipo.get(t.codigo) ?? []) : undefined,
      };
    }),
  });
}
