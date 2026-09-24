import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { listarTiposObra, mapaAreaCosteoTipo, TIPO_POR_DEFECTO } from '@/lib/partidas/tipos-obra';

export const dynamic = 'force-dynamic';

// Los siete tipos de obra del catálogo (C/G/I/A/F/T/P) con cuántos grupos, partidas
// y subpartidas tiene cada uno. Es lo que alimenta las pestañas de /partidas.
// Torres puede venir en 0/0/0: existe a propósito y se llena a mano.
//
// ?conObras=1 agrega las obras de BC que caen en cada tipo según su área de costeo
// (dbo.Obra + dbo.TipoObraAreaCosteo). Se usa para el filtro por obra y
// para "Traer de BC" — incluye obras que todavía no tienen nada en el catálogo.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const conObras = new URL(req.url).searchParams.get('conObras') === '1';

  const db = await getDb();
  const [tipos, conteos, areas] = await Promise.all([
    listarTiposObra(),
    db.request().query<{
      tipo_obra: string; grupos: number; partidas: number; subpartidas: number; obras: number;
    }>(`
      SELECT g.tipoObra AS tipo_obra,
             COUNT(DISTINCT g.id)  AS grupos,
             COUNT(DISTINCT p.idPartida)  AS partidas,
             COUNT(DISTINCT sp.idSubPartida) AS subpartidas,
             COUNT(DISTINCT g.bcWorksNo) AS obras
      FROM dbo.Etapa g
      LEFT JOIN dbo.Partida p      ON p.idEtapa = g.id AND p.esActivo = 1
      LEFT JOIN dbo.SubPartida sp ON sp.idPartida = p.idPartida AND sp.esActivo = 1
      WHERE g.activo = 1
      GROUP BY g.tipoObra
    `),
    // Áreas de costeo de BC que caen en cada tipo: la pantalla de obras las usa
    // para avisar si el área elegida no calza con el tipo que se marcó.
    db.request().query<{ area_costeo: string; tipo_obra: string }>(
      'SELECT areaCosteo AS area_costeo, tipoObra AS tipo_obra FROM dbo.TipoObraAreaCosteo ORDER BY areaCosteo',
    ),
  ]);

  // Obras de BC por tipo (opcional). El cruce con dbo.Obra se hace acá, en código:
  // quedó así de cuando el catálogo vivía en otra base, y funciona igual.
  const obrasPorTipo = new Map<string, { numeroObra: string; nombre: string }[]>();
  if (conObras) {
    try {
      const [app, mapa] = await Promise.all([getDb(), mapaAreaCosteoTipo()]);
      const r = await app.request().query<{
        numeroObra: string; nombreMostrado: string | null; descripcion: string | null;
        areaCosteo: string | null; tipoObra: string | null;
      }>('SELECT numeroObra, nombreMostrado, descripcion, areaCosteo, tipoObra FROM dbo.Obra ORDER BY numeroObra');
      for (const o of r.recordset) {
        // El tipo elegido en la obra manda; si no hay, se deduce del área de costeo.
        const explicito = String(o.tipoObra ?? '').trim().toUpperCase();
        const tipo = explicito || (mapa.get(String(o.areaCosteo ?? '').trim().toUpperCase()) ?? TIPO_POR_DEFECTO);
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
        areas: areas.recordset.filter((a) => a.tipo_obra === t.codigo).map((a) => a.area_costeo),
        obrasBC: conObras ? (obrasPorTipo.get(t.codigo) ?? []) : undefined,
      };
    }),
  });
}
