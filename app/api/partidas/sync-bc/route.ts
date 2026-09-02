import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getTipoObra, listarTiposObra, type TipoObra } from '@/lib/partidas/tipos-obra';
import { leerEstructuraBC, type FuenteEstructura } from '@/lib/partidas/estructura-bc';
import {
  obrasDelTipo,
  sincronizarEstructura,
  type ResultadoEstructura,
} from '@/lib/partidas/sync-estructura';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TRAER DE BC la estructura del catálogo: capítulos ("Total") → grupos y partidas
 * ("Posting") → partidas. Las subpartidas NO se tocan nunca: ese nivel no existe
 * en BC y es 100% de SQL.
 *
 * POST { tipo, obra?, dryRun? }
 *   tipo   — VIVIENDA | INFRA | ADMIN | FABRICA | TORRES
 *   obra   — N° de obra de BC. Sin obra se recorren TODAS las obras de ese tipo
 *            (según el área de costeo de dbo.Obra), con tope de 30 por llamada.
 *   dryRun — true = solo mira y reporta qué crearía, sin escribir nada. Importa
 *            sobre todo en vivienda e infra, donde el catálogo es compartido y
 *            traer una obra afecta a todas.
 *
 * De dónde lee: lib/partidas/estructura-bc.ts (BC en vivo, recorriendo las
 * compañías, con el snapshot del ETL como respaldo). Dónde escribe y con qué
 * reglas: lib/partidas/sync-estructura.ts — el mismo motor que usa la validación
 * del Excel en /api/presupuesto/catalogo.
 *
 * OJO: lee el ENTORNO de BC del proceso (BC_BASE_URL / BC_ENVIRONMENT). En
 * producción es BC Production; en local, el Sandbox.
 *
 * Es aditivo e idempotente. Solo Super Admin (nivel 4).
 */

interface Resultado extends ResultadoEstructura {
  fuente: FuenteEstructura;
  compania: string | null;
  version: string | null;
  aviso?: string;
}

async function sincronizarObra(tipo: TipoObra, obra: string, dryRun: boolean): Promise<Resultado> {
  const { lineas, fuente, compania, version, aviso } = await leerEstructuraBC(obra);
  const res = await sincronizarEstructura(tipo, obra, lineas, dryRun);
  return { ...res, fuente, compania, version, aviso };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));

  const tipoParam = String(body.tipo ?? '').toUpperCase();
  const obraParam = String(body.obra ?? '').trim();
  const dryRun = !!body.dryRun;

  const tipo = await getTipoObra(tipoParam);
  if (!tipo) {
    const validos = (await listarTiposObra()).map((t) => t.codigo).join(', ');
    return NextResponse.json(
      { error: `Tipo de obra desconocido "${tipoParam}". Válidos: ${validos}` },
      { status: 400 },
    );
  }

  const TOPE = 30;
  let obras = obraParam ? [obraParam] : await obrasDelTipo(tipo.codigo);
  let truncado = false;
  if (obras.length > TOPE) { obras = obras.slice(0, TOPE); truncado = true; }
  if (obras.length === 0) {
    return NextResponse.json(
      { error: `No hay obras de tipo ${tipo.nombre} en dbo.Obra. Elegí una obra de BC a mano.` },
      { status: 400 },
    );
  }

  try {
    const resultados: Resultado[] = [];
    for (const obra of obras) resultados.push(await sincronizarObra(tipo, obra, dryRun));

    const totales = {
      obrasProcesadas: resultados.length,
      gruposCreados: resultados.reduce((s, r) => s + r.gruposCreados.length, 0),
      partidasCreadas: resultados.reduce((s, r) => s + r.partidasCreadas.length, 0),
      gruposActualizados: resultados.reduce((s, r) => s + r.gruposActualizados, 0),
      partidasActualizadas: resultados.reduce((s, r) => s + r.partidasActualizadas, 0),
    };

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        tipo: tipo.codigo,
        ...totales,
        truncado: truncado ? `Se revisaron las primeras ${TOPE} obras.` : undefined,
        avisos: resultados.map((r) => r.aviso).filter(Boolean),
        detalle: resultados,
      });
    }

    await logAudit({
      idColAccion: session.idCol,
      accion: 'SINCRONIZAR_CATALOGO_BC',
      entidad: 'Partida',
      idEntidad: 0,
      detalleNuevo: { tipo: tipo.codigo, obras, ...totales },
      ip,
    });

    return NextResponse.json({
      ok: true,
      tipo: tipo.codigo,
      ...totales,
      truncado: truncado ? `Se procesaron las primeras ${TOPE} obras.` : undefined,
      avisos: resultados.map((r) => r.aviso).filter(Boolean),
      detalle: resultados,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/partidas/sync-bc POST error:', err);
    return NextResponse.json({ error: `No se pudo traer de BC: ${msg}` }, { status: 502 });
  }
}
