import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { normalizarBloques, validarBloques } from '@/lib/cuadrillas';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();

  try {
    const cuadRes = await db.request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT c.IDCuadrilla, c.Nombre, c.Capacidad, c.Activo, c.IDEncargado,
               c.IDProyecto AS idProyecto, pr.nombre AS Proyecto,
               col.calcNombreCompleto AS Encargado
        FROM dbo.Cuadrilla c
        LEFT JOIN dbo.Colaborador col ON col.idColaborador = c.IDEncargado
        LEFT JOIN dbo.Proyecto pr ON pr.idProyecto = c.IDProyecto
        WHERE c.IDCuadrilla = @id
      `);
    if (cuadRes.recordset.length === 0) {
      return NextResponse.json({ error: 'Cuadrilla no encontrada' }, { status: 404 });
    }

    // Obras y subpartidas asociadas (relaciones muchos-a-muchos).
    const obrasRes = await db.request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT o.idObra AS idObra, o.numeroObra AS numeroObra, o.nombreMostrado AS nombreMostrado,
               o.idProyecto AS idProyecto
        FROM dbo.CuadrillaObra co JOIN dbo.Obra o ON o.idObra = co.idObra
        WHERE co.IDCuadrilla = @id
        ORDER BY o.numeroObra
      `);
    const subRes = await db.request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT sp.idSubPartida AS idSubPartida, sp.codigo AS codigo, sp.nombre AS nombre,
               sp.idPartida AS idPartida, pa.codigo AS partidaCodigo, pa.nombre AS partidaNombre,
               cs.idProyecto AS idProyecto
        FROM dbo.CuadrillaSubPartida cs
        JOIN dbo.SubPartida sp ON sp.idSubPartida = cs.idSubPartida
        LEFT JOIN dbo.Partida pa ON pa.idPartida = sp.idPartida
        WHERE cs.IDCuadrilla = @id
        ORDER BY sp.codigo
      `);
    // Proyectos en los que trabaja (unión de los de sus subpartidas y obras).
    const proyRes = await db.request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT DISTINCT p.idProyecto, p.nombre
        FROM dbo.Proyecto p
        WHERE p.idProyecto IN (
          SELECT cs.idProyecto FROM dbo.CuadrillaSubPartida cs WHERE cs.IDCuadrilla = @id
          UNION
          SELECT o.idProyecto FROM dbo.CuadrillaObra co JOIN dbo.Obra o ON o.idObra = co.idObra
          WHERE co.IDCuadrilla = @id AND o.idProyecto IS NOT NULL
          UNION
          -- Proyecto legacy (cuadrillas viejas que aún no tienen obras/subpartidas).
          SELECT c.IDProyecto FROM dbo.Cuadrilla c WHERE c.IDCuadrilla = @id AND c.IDProyecto IS NOT NULL
        )
        ORDER BY p.nombre
      `);

    const miembrosRes = await db.request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT cm.IDCuadMiembro, cm.IDCol, cm.FechaIngreso, cm.Activo,
               v.calcNombreCompleto AS NombreCompleto, v.cedula AS Cedula, v.puesto AS Puesto
        FROM dbo.CuadrillaMiembro cm
        JOIN dbo.V_Colaborador v ON v.idColaborador = cm.IDCol
        WHERE cm.IDCuadrilla = @id
        ORDER BY cm.Activo DESC, v.calcNombreCompleto
      `);

    // Colaboradores en OTRA cuadrilla (para no permitir doble membresía).
    const otrasRes = await db.request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT cm.IDCol, c.IDCuadrilla, c.Nombre AS Cuadrilla
        FROM dbo.CuadrillaMiembro cm
        JOIN dbo.Cuadrilla c ON c.IDCuadrilla = cm.IDCuadrilla
        WHERE cm.Activo = 1 AND c.Activo = 1 AND cm.IDCuadrilla <> @id
      `);

    return NextResponse.json({
      ...cuadRes.recordset[0],
      proyectos: proyRes.recordset,
      obras: obrasRes.recordset,
      subpartidas: subRes.recordset,
      miembros: miembrosRes.recordset,
      otrasMembresias: otrasRes.recordset,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/cuadrillas/[id] GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Edita una cuadrilla: nombre, encargado, capacidad, obras y subpartidas.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const idCuad = parseInt(id);
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json();
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const idEncargado = Number(body.idEncargado) || 0;
  const capacidad = Number(body.capacidad) || 25;
  // Multi-proyecto: bloques = [{idProyecto, idObras[], idSubPartidas[]}].
  // Retro-compat: si viene el formato viejo (idProyecto/idObras/idSubPartidas flat),
  // se envuelve en un único bloque.
  const bloques = normalizarBloques(body);

  if (!nombre || !idEncargado) {
    return NextResponse.json({ error: 'Nombre y encargado son requeridos' }, { status: 400 });
  }
  const errBloques = validarBloques(bloques);
  if (errBloques) return NextResponse.json({ error: errBloques }, { status: 400 });

  const idObras: number[] = [...new Set(bloques.flatMap(b => b.idObras))];
  const totalSubs = bloques.reduce((n, b) => n + b.idSubPartidas.length, 0);
  const primerProyecto = bloques[0].idProyecto;
  const primeraSub = bloques[0].idSubPartidas[0];

  const db = await getDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();

    // Exclusividad POR PROYECTO (excluyendo esta misma cuadrilla): una subpartida
    // tomada por otra cuadrilla en ESE proyecto no se puede reusar (en otro sí).
    for (const b of bloques) {
      const conflictos = await new sql.Request(tx)
        .input('idProyecto', sql.Int, b.idProyecto)
        .input('idCuad', sql.Int, idCuad)
        .query(`
          SELECT sp.codigo AS subCodigo, c.Nombre AS cuadrilla, pr.nombre AS proyecto
          FROM dbo.CuadrillaSubPartida cs
          JOIN dbo.Cuadrilla c ON c.IDCuadrilla = cs.IDCuadrilla AND c.Activo = 1
          JOIN dbo.SubPartida sp ON sp.idSubPartida = cs.idSubPartida
          LEFT JOIN dbo.Proyecto pr ON pr.idProyecto = cs.idProyecto
          WHERE cs.idProyecto = @idProyecto AND cs.IDCuadrilla <> @idCuad
            AND cs.idSubPartida IN (${b.idSubPartidas.join(',')})
        `);
      if (conflictos.recordset.length > 0) {
        await tx.rollback();
        const proy = conflictos.recordset[0].proyecto ?? 'ese proyecto';
        const detalle = conflictos.recordset.map(r => `${r.subCodigo} (${r.cuadrilla})`).join(', ');
        return NextResponse.json({ error: `En ${proy} estas subpartidas ya están tomadas: ${detalle}` }, { status: 409 });
      }
    }

    // Estado previo (para auditar cambio de encargado).
    const prevRes = await new sql.Request(tx)
      .input('id', sql.Int, idCuad)
      .query(`SELECT c.IDEncargado, enc.calcNombreCompleto AS encNombre
              FROM dbo.Cuadrilla c LEFT JOIN dbo.Colaborador enc ON enc.idColaborador = c.IDEncargado
              WHERE c.IDCuadrilla = @id`);
    const prevEncId: number | null = prevRes.recordset[0]?.IDEncargado ?? null;
    const prevEncNombre: string | null = prevRes.recordset[0]?.encNombre ?? null;

    const spRes = await new sql.Request(tx)
      .input('idSub', sql.Int, primeraSub)
      .query('SELECT codigo FROM dbo.SubPartida WHERE idSubPartida = @idSub');
    const taskNoBC = spRes.recordset[0]?.codigo ?? null;

    const encRes = await new sql.Request(tx)
      .input('enc', sql.Int, idEncargado)
      .query('SELECT calcNombreCompleto AS nombre FROM dbo.Colaborador WHERE idColaborador = @enc');
    const nuevoEncNombre: string | null = encRes.recordset[0]?.nombre ?? null;

    const upd = await new sql.Request(tx)
      .input('id', sql.Int, idCuad)
      .input('nombre', sql.NVarChar, nombre)
      .input('idProyecto', sql.Int, primerProyecto)
      .input('idEncargado', sql.Int, idEncargado)
      .input('capacidad', sql.Int, capacidad)
      .input('idSubPartida', sql.Int, primeraSub)
      .input('taskNoBC', sql.NVarChar, taskNoBC)
      .query(`
        UPDATE dbo.Cuadrilla
        SET Nombre = @nombre, IDProyecto = @idProyecto, IDEncargado = @idEncargado,
            Capacidad = @capacidad, idSubPartida = @idSubPartida, TaskNoBC = @taskNoBC
        WHERE IDCuadrilla = @id
      `);
    if (upd.rowsAffected[0] === 0) {
      await tx.rollback();
      return NextResponse.json({ error: 'Cuadrilla no encontrada' }, { status: 404 });
    }

    // Reemplazar relaciones muchos-a-muchos.
    await new sql.Request(tx).input('id', sql.Int, idCuad).query('DELETE FROM dbo.CuadrillaObra WHERE IDCuadrilla = @id');
    await new sql.Request(tx).input('id', sql.Int, idCuad).query('DELETE FROM dbo.CuadrillaSubPartida WHERE IDCuadrilla = @id');
    for (const idObra of idObras) {
      await new sql.Request(tx)
        .input('id', sql.Int, idCuad)
        .input('idObra', sql.BigInt, idObra)
        .query('INSERT INTO dbo.CuadrillaObra (IDCuadrilla, idObra) VALUES (@id, @idObra)');
    }
    // Dedupe de pares (proyecto, subpartida): si el payload trae el mismo par
    // repetido, el INSERT viola UQ_CuadrillaSubPartida. Colapsar duplicados
    // exactos es seguro (no pierde datos distintos).
    const vistosCS = new Set<string>();
    for (const b of bloques) {
      for (const idSub of b.idSubPartidas) {
        const clave = `${b.idProyecto}:${idSub}`;
        if (vistosCS.has(clave)) continue;
        vistosCS.add(clave);
        await new sql.Request(tx)
          .input('id', sql.Int, idCuad)
          .input('idProyecto', sql.Int, b.idProyecto)
          .input('idSub', sql.Int, idSub)
          .query('INSERT INTO dbo.CuadrillaSubPartida (IDCuadrilla, idProyecto, idSubPartida) VALUES (@id, @idProyecto, @idSub)');
      }
    }

    await tx.commit();

    await logAudit({
      idColAccion: session.idCol,
      accion: 'EDITAR_CUADRILLA',
      entidad: 'Cuadrilla',
      idEntidad: idCuad,
      detallePrevio: { encargado: prevEncNombre },
      detalleNuevo: {
        cuadrilla: nombre,
        encargado: nuevoEncNombre,
        capacidad,
        proyectos: bloques.length,
        obras: idObras.length,
        subpartidas: totalSubs,
      },
      ip,
    });

    // Cambio de encargado como evento propio (para verlo claro en auditoría).
    if (prevEncId !== idEncargado) {
      await logAudit({
        idColAccion: session.idCol,
        accion: 'CAMBIO_ENCARGADO',
        entidad: 'Cuadrilla',
        idEntidad: idCuad,
        detallePrevio: { encargado: prevEncNombre },
        detalleNuevo: { cuadrilla: nombre, encargado: nuevoEncNombre },
        ip,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    try { await tx.rollback(); } catch { /* ya revertida */ }
    const num = (err as { number?: number })?.number;
    if (num === 2627 || num === 2601) {
      console.error('/api/cuadrillas/[id] PUT unique violation:', err);
      return NextResponse.json({ error: 'Una o más subpartidas ya están asignadas a otra cuadrilla en ese proyecto. Quitalas y volvé a intentar.' }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/cuadrillas/[id] PUT error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
