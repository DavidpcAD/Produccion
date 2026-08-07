import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { bindObra } from '@/lib/obras';
import { bcConfigured, setAreaProrrateadaJob } from '@/lib/bc-client';
import { bcConstructionConfigured, setAreaProrrateadaWork } from '@/lib/bc-construction';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  const res = await db.request().input('id', sql.BigInt, id).query(`
    SELECT o.idObra, o.numeroObra, o.nombreMostrado, o.descripcion, o.centroCosto,
           o.areaCosteo, o.proyectoPadre, o.idProyecto, pr.nombre AS proyectoNombre,
           o.gerenteProyecto, o.idEncargado, o.ubicacion,
           o.estado, o.fechaInicio, o.fechaFin, o.areaProrrateadaM2,
           o.precioNormalMaquinaria, o.precioConcretoMaquinaria, o.origenPrincipal,
           o.esBC, o.esProcore, o.fechaCreacion, o.creadoPor, o.fechaModificacion, o.modificadoPor
    FROM dbo.Obra o LEFT JOIN dbo.Proyecto pr ON pr.idProyecto = o.idProyecto WHERE o.idObra = @id
  `);
  if (res.recordset.length === 0) {
    return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 });
  }
  return NextResponse.json(res.recordset[0]);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  if (!body.numeroObra) {
    return NextResponse.json({ error: 'El número de obra es requerido' }, { status: 400 });
  }
  const db = await getDb();
  try {
    // El número de obra es la LLAVE del registro (BC, avances, presupuesto): no se
    // actualiza aquí aunque venga en el body (el campo llega deshabilitado desde el
    // editor). origenPrincipal es un campo de sistema (importación) y tampoco se toca.
    await bindObra(db.request(), body)
      .input('id', sql.BigInt, id)
      .input('modificadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        UPDATE dbo.Obra SET
          nombreMostrado = @nombreMostrado, descripcion = @descripcion,
          centroCosto = @centroCosto, areaCosteo = @areaCosteo, proyectoPadre = @proyectoPadre,
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

    // Sincronización opcional con Business Central (pedida explícitamente desde el
    // editor). Hoy BC solo acepta actualizar el área prorrateada de la obra/Job; el
    // resto se guarda en el sistema. No es fatal: si BC falla, la obra ya quedó guardada.
    let bcSync: boolean | undefined;
    let bcError: string | undefined;
    if (body.actualizarBC) {
      const worksNo = String(body.numeroObra).trim();
      const area = body.areaProrrateadaM2 != null && body.areaProrrateadaM2 !== ''
        ? Number(body.areaProrrateadaM2) : null;
      try {
        if (area != null && !Number.isNaN(area) && area > 0) {
          if (bcConstructionConfigured()) await setAreaProrrateadaWork(worksNo, area);
          if (bcConfigured()) await setAreaProrrateadaJob(worksNo, area);
          bcSync = true;
        } else {
          bcSync = false;
          bcError = 'Sin área prorrateada para enviar a BC';
        }
      } catch (e) {
        bcSync = false;
        bcError = e instanceof Error ? e.message : String(e);
        console.error('/api/obras/[id] PATCH BC sync error:', e);
      }
    }
    return NextResponse.json({ ok: true, bcSync, bcError });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
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
  const db = await getDb();
  try {
    await db.request().input('id', sql.BigInt, id).query('DELETE FROM dbo.Obra WHERE idObra = @id');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/obras/[id] DELETE error:', err);
    if (/REFERENCE|FK_|conflicted/i.test(msg)) {
      return NextResponse.json({ error: 'No se puede eliminar: la obra está referenciada por otros registros.' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
