import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();

  // Modelo nuevo (dbo.Proyecto). Las personas asignadas se leen de
  // dbo.UsuarioProyecto -> dbo.Usuario -> dbo.V_Colaborador.
  const proyRes = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT p.idProyecto AS IDProyecto, p.abreviatura AS CodigoBC,
             p.nombre AS Nombre, p.categoria AS Estado,
             p.linkUbicacion AS Ubicacion,
             p.activo AS Activo, p.esProductivo AS EsProductivo
      FROM dbo.Proyecto p
      WHERE p.idProyecto = @id
    `);

  if (!proyRes.recordset.length) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const asigRes = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT up.idUsuarioProyecto AS IDColProy, v.idColaborador AS IDCol,
             v.calcNombreCompleto AS NombreCompleto, v.cedula AS Cedula, v.puesto AS Puesto,
             v.puesto AS NombreRol, NULL AS TaskNoBC, NULL AS DescripcionTask,
             CAST(1 AS BIT) AS Activo, NULL AS FechaAsignacion
      FROM dbo.UsuarioProyecto up
      JOIN dbo.Usuario u ON u.idUsuario = up.idUsuario
      JOIN dbo.V_Colaborador v ON v.idColaborador = u.idColaborador
      WHERE up.idProyecto = @id
      ORDER BY v.calcNombreCompleto
    `);

  // Obras del proyecto (para ver más información del proyecto en el detalle).
  // dbo.Obra NO tiene columna `activo`: una obra vendida se BLOQUEA (estado =
  // 'Blocked'), no se inactiva. Pedirla hacía que este GET diera 500 y que el
  // detalle del proyecto se quedara cargando para siempre.
  const obrasRes = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT o.idObra AS IDObra, o.numeroObra AS NumeroObra, o.nombreMostrado AS Nombre,
             o.estado AS Estado, o.areaCosteo AS AreaCosteo
      FROM dbo.Obra o
      WHERE o.idProyecto = @id
      ORDER BY o.numeroObra
    `);

  return NextResponse.json({
    ...proyRes.recordset[0],
    asignaciones: asigRes.recordset,
    obras: obrasRes.recordset,
  });
}

/**
 * PATCH /api/proyectos/{id} — edita la información del proyecto y/o sus banderas.
 * Body (todos opcionales): { nombre?, categoria?, linkUbicacion?, esProductivo?, activo? }.
 * - nombre/categoria/linkUbicacion: editan la ficha del proyecto.
 * - esProductivo: marca que pertenece a Producción (filtra sus obras).
 * - activo: inactivar NO borra nada — el proyecto deja de aparecer en selectores
 *   por defecto, pero sus obras y asignaciones siguen existiendo.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const sets: string[] = [];
  const r = (await getDb()).request().input('id', sql.Int, parseInt(id));

  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (!nombre) {
      return NextResponse.json({ error: 'El nombre no puede estar vacío.' }, { status: 400 });
    }
    sets.push('nombre = @nombre');
    r.input('nombre', sql.NVarChar, nombre);
  }
  if (body.categoria !== undefined) {
    const categoria = body.categoria == null ? null : String(body.categoria).trim() || null;
    sets.push('categoria = @categoria');
    r.input('categoria', sql.NVarChar, categoria);
  }
  if (body.linkUbicacion !== undefined) {
    const ubic = body.linkUbicacion == null ? null : String(body.linkUbicacion).trim() || null;
    sets.push('linkUbicacion = @linkUbicacion');
    r.input('linkUbicacion', sql.NVarChar, ubic);
  }
  if (body.esProductivo !== undefined) {
    sets.push('esProductivo = @esProductivo');
    r.input('esProductivo', sql.Bit, body.esProductivo ? 1 : 0);
  }
  if (body.activo !== undefined) {
    sets.push('activo = @activo');
    r.input('activo', sql.Bit, body.activo ? 1 : 0);
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar (nombre/categoria/linkUbicacion/esProductivo/activo).' }, { status: 400 });
  }

  try {
    const res = await r.query(`
      UPDATE dbo.Proyecto SET ${sets.join(', ')}
      OUTPUT INSERTED.idProyecto AS IDProyecto, INSERTED.nombre AS Nombre,
             INSERTED.categoria AS Estado, INSERTED.linkUbicacion AS Ubicacion,
             INSERTED.activo AS Activo, INSERTED.esProductivo AS EsProductivo
      WHERE idProyecto = @id
    `);
    if (res.recordset.length === 0) {
      return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...res.recordset[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/proyectos/[id] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
