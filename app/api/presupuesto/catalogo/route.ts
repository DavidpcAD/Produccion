import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getTipoObra, tipoObraDeObra } from '@/lib/partidas/tipos-obra';
import {
  armarJerarquia,
  catalogoDeObra,
  sincronizarEstructura,
  type LineaEstructura,
} from '@/lib/partidas/sync-estructura';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * CRUCE del presupuesto que se está cargando contra el catálogo de partidas.
 *
 * El Excel de presupuesto trae capítulos ("Total") y partidas ("Posting") con los
 * códigos de tarea de BC. Antes de subirlo, esta ruta dice cuáles de esas líneas YA
 * están en el catálogo de SQL (`pro_obc`) y cuáles no, para que el presupuestista
 * no meta a BC partidas que después el app no puede ni planificar ni desglosar en
 * subpartidas.
 *
 * POST { worksNo, lineas: [{ taskNo, taskType, description }], crear? }
 *   crear ausente/false → solo reporta (no escribe nada).
 *   crear true          → crea en el catálogo lo que falta y vuelve a reportar.
 *
 * El tipo de obra sale de la obra: manda `dbo.Obra.tipoObra` (lo que se eligió al
 * crearla) y, si está vacío, se deduce del área de costeo de BC
 * (pro_obc.tipo_obra_area_costeo). Así el cruce va contra el catálogo correcto:
 * vivienda contra vivienda, la fábrica de maderas contra su propia estructura, etc.
 *
 * Nivel 2 (el mismo que subir el presupuesto): crear acá es parte del flujo de
 * carga y solo AGREGA lo que el propio presupuesto trae. El catálogo completo
 * —editar, desactivar, subpartidas— sigue siendo nivel 4 en /partidas.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));

  const worksNo = String(body.worksNo ?? '').trim();
  const crear = !!body.crear;
  const lineasRaw: unknown[] = Array.isArray(body.lineas) ? body.lineas : [];

  if (!worksNo) return NextResponse.json({ error: 'Falta la obra (worksNo)' }, { status: 400 });

  // Dedup por código de tarea, quedándose con la primera aparición. Un mismo
  // código viene repetido en el Excel (Venta / Costo / Indirectos).
  const vistas = new Set<string>();
  const lineas: LineaEstructura[] = [];
  for (const l of lineasRaw) {
    const o = (l ?? {}) as Record<string, unknown>;
    const taskNo = String(o.taskNo ?? '').trim();
    if (!taskNo || vistas.has(taskNo.toUpperCase())) continue;
    vistas.add(taskNo.toUpperCase());
    lineas.push({
      taskNo,
      taskType: String(o.taskType ?? 'Posting').trim(),
      description: String(o.description ?? '').trim(),
    });
  }
  if (lineas.length === 0) {
    return NextResponse.json({ error: 'El presupuesto no trae líneas con código de tarea' }, { status: 400 });
  }

  const resuelto = await tipoObraDeObra(worksNo);
  if (!resuelto) {
    return NextResponse.json(
      { error: `La obra ${worksNo} no está en el app (dbo.Obra), así que no se sabe de qué tipo es.` },
      { status: 400 },
    );
  }
  const { tipo: tipoCodigo, origen: tipoOrigen, areaCosteo: area } = resuelto;
  const tipo = await getTipoObra(tipoCodigo);
  if (!tipo) {
    return NextResponse.json(
      { error: `La obra ${worksNo} apunta al tipo "${tipoCodigo}", que no existe en pro_obc.tipos_obra.` },
      { status: 500 },
    );
  }

  try {
    let creado: Awaited<ReturnType<typeof sincronizarEstructura>> | null = null;
    if (crear) {
      creado = await sincronizarEstructura(tipo, worksNo, lineas, false);
      await logAudit({
        idColAccion: session.idCol,
        accion: 'CREAR_CATALOGO_DESDE_PRESUPUESTO',
        entidad: 'Partida',
        idEntidad: 0,
        detalleNuevo: {
          worksNo, tipo: tipo.codigo,
          gruposCreados: creado.gruposCreados, partidasCreadas: creado.partidasCreadas,
        },
        ip,
      });
    }

    // Estado línea por línea, ya con lo recién creado adentro.
    const { grupos, partidas } = await catalogoDeObra(tipo, worksNo);
    const clave = (s: string) => s.trim().toUpperCase();
    const gruposPorCodigo = new Map<string, typeof grupos[number]>();
    for (const g of grupos) {
      gruposPorCodigo.set(clave(g.codigo), g);
      if (g.bcTaskNo) gruposPorCodigo.set(clave(g.bcTaskNo), g);
    }
    const partidasPorCodigo = new Map(partidas.map((p) => [clave(p.codigo), p]));
    // El capítulo al que caería cada partida que falta (para poder crearla).
    const { hijos } = armarJerarquia(lineas);
    const capituloDe = new Map<string, string>();
    for (const [cap, hs] of hijos) for (const [cod] of hs) capituloDe.set(clave(cod), cap);

    const detalle = lineas.map((l) => {
      const esCapitulo = l.taskType === 'Total';
      if (esCapitulo) {
        const g = gruposPorCodigo.get(clave(l.taskNo));
        return {
          taskNo: l.taskNo, taskType: 'Total' as const, description: l.description,
          enCatalogo: !!g,
          nombreCatalogo: g?.nombre ?? null,
          ubicacion: null as string | null,
        };
      }
      const p = partidasPorCodigo.get(clave(l.taskNo));
      return {
        taskNo: l.taskNo, taskType: 'Posting' as const, description: l.description,
        enCatalogo: !!p,
        nombreCatalogo: p?.nombre ?? null,
        // Dónde está (o dónde caería) dentro del catálogo.
        ubicacion: p ? `${p.grupoCodigo} — ${p.grupoNombre}` : (capituloDe.get(clave(l.taskNo)) ?? null),
      };
    });

    const capitulos = detalle.filter((d) => d.taskType === 'Total');
    const parts = detalle.filter((d) => d.taskType === 'Posting');

    return NextResponse.json({
      ok: true,
      obra: worksNo,
      areaCosteo: area,
      // 'obra' = lo eligió la gente en la obra · 'area' = deducido del área de costeo
      tipoOrigen,
      tipo: {
        codigo: tipo.codigo, letra: tipo.letra, nombre: tipo.nombre,
        terminoGrupo: tipo.terminoGrupo, terminoGrupoPlural: tipo.terminoGrupoPlural,
        genero: tipo.genero, catalogoCompartido: tipo.catalogoCompartido,
      },
      resumen: {
        capitulos: { total: capitulos.length, enCatalogo: capitulos.filter((c) => c.enCatalogo).length },
        partidas: { total: parts.length, enCatalogo: parts.filter((p) => p.enCatalogo).length },
      },
      detalle,
      creado: creado
        ? {
            gruposCreados: creado.gruposCreados,
            partidasCreadas: creado.partidasCreadas,
            gruposActualizados: creado.gruposActualizados,
            partidasActualizadas: creado.partidasActualizadas,
            capitulosSinPartidas: creado.capitulosSinPartidas,
          }
        : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/presupuesto/catalogo POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
