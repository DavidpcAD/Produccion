import { NextRequest, NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { bindObra, sqlFechaObra } from '@/lib/obras';
import { bcConfigured } from '@/lib/bc-client';
import { actualizarObraEnBC, cambiosParaBC, type ResultadoSyncObra } from '@/lib/bc/obra-sync';
import { getTipoObra, tipoObraDeAreaCosteo, TIPO_POR_DEFECTO } from '@/lib/partidas/tipos-obra';
import { almacenFisicoDe, guardarClaseAlmacen, leerClasesAlmacen } from '@/lib/compras/almacen-clase';
import { logAudit } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  const res = await db.request().input('id', sql.BigInt, id).query(`
    SELECT o.idObra, o.numeroObra, o.nombreMostrado, o.descripcion, o.centroCosto,
           o.areaCosteo, o.tipoObra, o.proyectoPadre, o.idProyecto, pr.nombre AS proyectoNombre,
           o.gerenteProyecto, o.idEncargado, o.ubicacion,
           o.estado, ${sqlFechaObra('o.fechaInicio')} AS fechaInicio, ${sqlFechaObra('o.fechaFin')} AS fechaFin, o.areaProrrateadaM2,
           o.precioNormalMaquinaria, o.precioConcretoMaquinaria, o.origenPrincipal,
           o.esBC, o.esProcore, o.fechaCreacion, o.creadoPor, o.fechaModificacion, o.modificadoPor
    FROM dbo.Obra o LEFT JOIN dbo.Proyecto pr ON pr.idProyecto = o.idProyecto WHERE o.idObra = @id
  `);
  if (res.recordset.length === 0) {
    return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 });
  }
  // Tipo efectivo: manda la columna y, si está vacía, se deduce del área de costeo.
  const o = res.recordset[0] as Record<string, unknown>;
  const explicito = String(o.tipoObra ?? '').trim().toUpperCase();
  const [efectivo, clases] = await Promise.all([
    explicito || tipoObraDeAreaCosteo(String(o.areaCosteo ?? '')).catch(() => TIPO_POR_DEFECTO),
    leerClasesAlmacen(),
  ]);
  return NextResponse.json({
    ...o, tipoObraEfectivo: efectivo, tipoObraOrigen: explicito ? 'obra' : 'area',
    ...almacenFisicoDe(clases, String(o.numeroObra ?? '')),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id } = await params;
  const idObra = Number(id);
  if (!Number.isInteger(idObra) || idObra <= 0) {
    return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 });
  }
  const body = await req.json();
  if (!body.numeroObra) {
    return NextResponse.json({ error: 'El número de obra es requerido' }, { status: 400 });
  }
  const tipoObra = String(body.tipoObra ?? '').trim().toUpperCase();
  if (tipoObra) {
    const t = await getTipoObra(tipoObra).catch(() => null);
    if (!t) return NextResponse.json({ error: `Tipo de obra desconocido "${tipoObra}"` }, { status: 400 });
    body.tipoObra = t.codigo;
  } else {
    body.tipoObra = null;
  }
  const db = await getDb();
  try {
    const previa = await db.request().input('id', sql.BigInt, idObra).query(`
      SELECT numeroObra, esBC, nombreMostrado, descripcion, estado,
             ${sqlFechaObra('fechaInicio')} AS fechaInicio, ${sqlFechaObra('fechaFin')} AS fechaFin,
             gerenteProyecto, idEncargado, areaProrrateadaM2
      FROM dbo.Obra WHERE idObra = @id
    `);
    const actual = previa.recordset[0] as Record<string, unknown> | undefined;
    if (!actual) {
      return NextResponse.json({ error: 'Esa obra ya no existe' }, { status: 404 });
    }

    // Obra que existe en Business Central: lo que se cambió y vive en BC se escribe
    // ALLÁ PRIMERO (ver lib/bc/obra-sync.ts). Si BC lo rechaza, no se guarda nada
    // acá y se devuelve el motivo: el sistema y BC no quedan diciendo cosas
    // distintas. Si no se tocó ningún campo de BC, no se llama a BC.
    let bc: ResultadoSyncObra | undefined;
    if (actual.esBC) {
      const { cambios, error } = cambiosParaBC(actual, body);
      if (error) return NextResponse.json({ error }, { status: 400 });
      if (Object.keys(cambios).length > 0) {
        if (!bcConfigured()) {
          return NextResponse.json(
            { error: 'Business Central no está configurado en este entorno: los cambios de una obra de BC no se pueden guardar.' },
            { status: 503 },
          );
        }
        try {
          bc = await actualizarObraEnBC(String(actual.numeroObra), cambios);
        } catch (e) {
          console.error('/api/obras/[id] PATCH BC error:', e);
          const motivo = mensajeParaCliente(e).replace(/[.\s]*$/, '');
          return NextResponse.json({ error: `${motivo}. No se guardó nada.` }, { status: 502 });
        }
      }
    }

    // El número de obra es la LLAVE del registro (BC, avances, presupuesto): no se
    // actualiza aquí aunque venga en el body (el campo llega deshabilitado desde el
    // editor). origenPrincipal es un campo de sistema (importación) y tampoco se toca.
    const r = await bindObra(db.request(), body)
      .input('id', sql.BigInt, idObra)
      .input('modificadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        UPDATE dbo.Obra SET
          nombreMostrado = @nombreMostrado, descripcion = @descripcion,
          centroCosto = @centroCosto, areaCosteo = @areaCosteo, tipoObra = @tipoObra,
          proyectoPadre = @proyectoPadre,
          idProyecto = @idProyecto,
          areaProrrateadaM2 = @areaProrrateadaM2, gerenteProyecto = @gerenteProyecto,
          idEncargado = @idEncargado, ubicacion = @ubicacion, estado = @estado,
          fechaInicio = @fechaInicio, fechaFin = @fechaFin,
          precioNormalMaquinaria = @precioNormalMaquinaria,
          precioConcretoMaquinaria = @precioConcretoMaquinaria,
          esBC = @esBC, esProcore = @esProcore,
          fechaModificacion = SYSUTCDATETIME(), modificadoPor = @modificadoPor
        WHERE idObra = @id
      `);

    // La obra existía al leerla arriba; si ahora no actualizó NADA, la borraron en
    // el medio desde otra pantalla.
    if (!r.rowsAffected[0]) {
      return NextResponse.json({ error: 'Esa obra ya no existe' }, { status: 404 });
    }

    // "Almacén físico (bodega)": es la marca única de almacenes (Business Central →
    // Almacenes). Solo se escribe si la casilla CAMBIÓ respecto de cómo cuenta hoy;
    // guardar otros campos no convierte una obra "sin marcar" en marcada. Al cambiar
    // queda explícita (real o virtual), porque "sin marca" puede seguir diciendo
    // bodega por el código (F-*, GEN-*…) y la casilla no se dejaría desmarcar.
    if (typeof body.esAlmacenFisico === 'boolean') {
      const codigo = String(actual.numeroObra);
      try {
        const hoy = almacenFisicoDe(await leerClasesAlmacen(), codigo);
        if (hoy.esAlmacenFisico !== body.esAlmacenFisico) {
          const clase = body.esAlmacenFisico ? 'real' : 'virtual';
          await guardarClaseAlmacen(codigo, clase, session.username || session.nombre || String(session.idCol));
          await logAudit({
            idColAccion: session.idCol,
            accion: 'MARCAR_ALMACEN',
            entidad: 'AlmacenClase',
            detallePrevio: { codigo, clase: hoy.claseAlmacen },
            detalleNuevo: { codigo, clase, desde: 'editor de obra' },
            ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '',
          });
        }
      } catch (e) {
        // Lo demás ya quedó guardado: se dice exactamente qué faltó.
        console.error('/api/obras/[id] PATCH marca de almacén:', e);
        return NextResponse.json({
          error: `La obra se guardó, pero no la marca de almacén físico: ${mensajeParaCliente(e)}`,
        }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, bc });
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/obras/[id] PATCH error:', err);
    if (/duplicate|UNIQUE/i.test(msg)) {
      return NextResponse.json({ error: 'Ya existe una obra con ese número' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id } = await params;
  const idObra = Number(id);
  if (!Number.isInteger(idObra) || idObra <= 0) {
    return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 });
  }
  const db = await getDb();
  try {
    const r = await db.request().input('id', sql.BigInt, idObra).query('DELETE FROM dbo.Obra WHERE idObra = @id');
    // Igual que el PATCH: si no borró nada, se dice, en vez de confirmar un borrado
    // que no pasó.
    if (!r.rowsAffected[0]) {
      return NextResponse.json({ error: 'Esa obra ya no existe' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/obras/[id] DELETE error:', err);
    if (/REFERENCE|FK_|conflicted/i.test(msg)) {
      return NextResponse.json({ error: 'No se puede eliminar: la obra está referenciada por otros registros.' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
