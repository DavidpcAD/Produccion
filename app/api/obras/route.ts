import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { bindObra } from '@/lib/obras';
import { bcConfigured, createWork, createProject } from '@/lib/bc-client';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const pagina = parseInt(searchParams.get('pagina') ?? '1');
  const porPagina = parseInt(searchParams.get('porPagina') ?? '20');
  const offset = (pagina - 1) * porPagina;

  const db = await getDb();
  // Sin búsqueda (caso común) → sin LIKE, para que el COUNT/paginado no escaneen.
  const where = q
    ? `WHERE (o.numeroObra LIKE @like OR o.nombreMostrado LIKE @like OR o.centroCosto LIKE @like)`
    : '';

  const countRes = await db.request()
    .input('q', sql.NVarChar, q).input('like', sql.NVarChar, `%${q}%`)
    .query(`SELECT COUNT(*) AS total FROM dbo.Obra o ${where}`);
  const total = countRes.recordset[0].total;

  const dataRes = await db.request()
    .input('q', sql.NVarChar, q).input('like', sql.NVarChar, `%${q}%`)
    .input('offset', sql.Int, offset).input('porPagina', sql.Int, porPagina)
    .query(`
      SELECT o.idObra, o.numeroObra, o.nombreMostrado, o.descripcion, o.centroCosto,
             o.areaCosteo, o.proyectoPadre, o.idProyecto, pr.nombre AS proyectoNombre,
             o.gerenteProyecto, o.idEncargado, o.ubicacion,
             o.estado, o.fechaInicio, o.fechaFin, o.areaProrrateadaM2,
             o.precioNormalMaquinaria, o.precioConcretoMaquinaria, o.origenPrincipal,
             o.esBC, o.esProcore
      FROM dbo.Obra o LEFT JOIN dbo.Proyecto pr ON pr.idProyecto = o.idProyecto ${where}
      ORDER BY o.numeroObra
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY
    `);

  return NextResponse.json({
    data: dataRes.recordset, total, pagina,
    paginas: Math.ceil(total / porPagina),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const body = await req.json();
  if (!body.numeroObra) {
    return NextResponse.json({ error: 'El número de obra es requerido' }, { status: 400 });
  }
  // Regla de dominio: el centro de costo (CC) de una obra nueva es su propio N°
  // (el AL lo crea automáticamente junto con almacén y proyecto).
  body.centroCosto = String(body.numeroObra);

  // Crear primero en Business Central (si se solicitó). Si BC falla, no se
  // toca SQL: mejor abortar que dejar la obra desincronizada.
  if (body.crearEnBC) {
    if (String(body.numeroObra).length > 10) {
      return NextResponse.json(
        { error: 'El N° de obra no puede superar 10 caracteres para crear en Business Central (límite del código de almacén).' },
        { status: 400 },
      );
    }
    if (!bcConfigured()) {
      return NextResponse.json(
        { error: 'Business Central no está configurado en este entorno.' },
        { status: 503 },
      );
    }
    try {
      const obraNo = String(body.numeroObra); // numeración manual (no hay serie)
      // 1) Obra + dimensiones AC/CC. 2) Proyecto (Job) desde la obra.
      const tiposInventario = Array.isArray(body.tiposInventario)
        ? body.tiposInventario.filter(Boolean).join(',')
        : (body.tiposInventario ? String(body.tiposInventario) : '');
      await createWork({
        obraNo,
        description: String(body.nombreMostrado || body.numeroObra),
        description2: body.descripcion ? String(body.descripcion) : '',
        areaCosteo: body.areaCosteo ? String(body.areaCosteo) : undefined,
        centroCosto: body.centroCosto ? String(body.centroCosto) : undefined,
        tiposInventario,
      });
      await createProject(obraNo);
      body.esBC = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('/api/obras POST BC error:', err);
      return NextResponse.json(
        { error: `No se pudo crear en Business Central: ${msg}` },
        { status: 502 },
      );
    }
  }

  const db = await getDb();
  try {
    const r = bindObra(db.request(), body)
      .input('creadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios');
    const res = await r.query(`
      INSERT INTO dbo.Obra
        (numeroObra, nombreMostrado, descripcion, centroCosto, areaCosteo, proyectoPadre, idProyecto,
         areaProrrateadaM2, gerenteProyecto, idEncargado, ubicacion, estado, fechaInicio, fechaFin,
         precioNormalMaquinaria, precioConcretoMaquinaria, origenPrincipal, esBC, esProcore,
         fechaCreacion, creadoPor)
      OUTPUT INSERTED.idObra
      VALUES
        (@numeroObra, @nombreMostrado, @descripcion, @centroCosto, @areaCosteo, @proyectoPadre, @idProyecto,
         @areaProrrateadaM2, @gerenteProyecto, @idEncargado, @ubicacion, @estado, @fechaInicio, @fechaFin,
         @precioNormalMaquinaria, @precioConcretoMaquinaria, @origenPrincipal, @esBC, @esProcore,
         SYSUTCDATETIME(), @creadoPor)
    `);
    return NextResponse.json({ idObra: Number(res.recordset[0].idObra) }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/obras POST error:', err);
    if (/duplicate|UNIQUE/i.test(msg)) {
      return NextResponse.json({ error: 'Ya existe una obra con ese número' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
