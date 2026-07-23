import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { bindObra } from '@/lib/obras';

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
    await bindObra(db.request(), body)
      .input('id', sql.BigInt, id)
      .input('modificadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        UPDATE dbo.Obra SET
          numeroObra = @numeroObra, nombreMostrado = @nombreMostrado, descripcion = @descripcion,
          centroCosto = @centroCosto, areaCosteo = @areaCosteo, proyectoPadre = @proyectoPadre,
          idProyecto = @idProyecto,
          areaProrrateadaM2 = @areaProrrateadaM2, gerenteProyecto = @gerenteProyecto,
          idEncargado = @idEncargado, ubicacion = @ubicacion, estado = @estado,
          fechaInicio = @fechaInicio, fechaFin = @fechaFin,
          precioNormalMaquinaria = @precioNormalMaquinaria,
          precioConcretoMaquinaria = @precioConcretoMaquinaria, origenPrincipal = @origenPrincipal,
          esBC = @esBC, esProcore = @esProcore,
          fechaModificacion = SYSUTCDATETIME(), modificadoPor = @modificadoPor
        WHERE idObra = @id
      `);
    return NextResponse.json({ ok: true });
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
