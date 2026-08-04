import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { normalizarBloques, validarBloques } from '@/lib/cuadrillas';

export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const db = await getDb();
  // Una cuadrilla se relaciona con VARIAS obras (dbo.CuadrillaObra) y ejecuta
  // VARIAS subpartidas (dbo.CuadrillaSubPartida). Se agregan como texto para la
  // tarjeta de la lista.
  const result = await db.request().query(`
    SELECT c.IDCuadrilla, c.Nombre, c.Capacidad, c.Activo,
           col.calcNombreCompleto AS Encargado,
           c.IDProyecto AS idProyecto,
           (SELECT STRING_AGG(p.nombre, ', ') FROM (
              SELECT DISTINCT u.idProyecto FROM (
                SELECT cs.idProyecto FROM dbo.CuadrillaSubPartida cs WHERE cs.IDCuadrilla = c.IDCuadrilla
                UNION SELECT o.idProyecto FROM dbo.CuadrillaObra co JOIN dbo.Obra o ON o.idObra = co.idObra WHERE co.IDCuadrilla = c.IDCuadrilla
                UNION SELECT c.IDProyecto
              ) u WHERE u.idProyecto IS NOT NULL
           ) d JOIN dbo.Proyecto p ON p.idProyecto = d.idProyecto) AS Proyecto,
           (SELECT COUNT(*) FROM dbo.CuadrillaMiembro cm WHERE cm.IDCuadrilla = c.IDCuadrilla AND cm.Activo = 1) AS TotalMiembros,
           (SELECT COUNT(*) FROM dbo.CuadrillaObra co WHERE co.IDCuadrilla = c.IDCuadrilla) AS TotalObras,
           (SELECT STRING_AGG(o.numeroObra, ', ')
              FROM dbo.CuadrillaObra co JOIN dbo.Obra o ON o.idObra = co.idObra
              WHERE co.IDCuadrilla = c.IDCuadrilla) AS Obras,
           (SELECT STRING_AGG(sp.codigo, ', ')
              FROM dbo.CuadrillaSubPartida cs JOIN pro_obc.sub_partidas sp ON sp.id = cs.idSubPartida
              WHERE cs.IDCuadrilla = c.IDCuadrilla) AS Subpartidas
    FROM dbo.Cuadrilla c
    LEFT JOIN dbo.Colaborador col ON col.idColaborador = c.IDEncargado
    LEFT JOIN dbo.Proyecto pr ON pr.idProyecto = c.IDProyecto
    WHERE c.Activo = 1
    ORDER BY c.Nombre
  `);

  return NextResponse.json({ data: result.recordset });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json();
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const idEncargado = Number(body.idEncargado) || 0;
  const capacidad = Number(body.capacidad) || 25;
  const bloques = normalizarBloques(body);

  if (!nombre || !idEncargado) {
    return NextResponse.json({ error: 'Nombre y encargado son requeridos' }, { status: 400 });
  }
  const errBloques = validarBloques(bloques);
  if (errBloques) return NextResponse.json({ error: errBloques }, { status: 400 });

  const idObras: number[] = [...new Set(bloques.flatMap(b => b.idObras))];
  const primerProyecto = bloques[0].idProyecto;
  const primeraSub = bloques[0].idSubPartidas[0];

  const db = await getDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();

    // Exclusividad POR PROYECTO: ninguna subpartida elegida puede estar tomada
    // por otra cuadrilla activa del MISMO proyecto (en otro proyecto sí se puede).
    for (const b of bloques) {
      const conflictos = await new sql.Request(tx)
        .input('idProyecto', sql.Int, b.idProyecto)
        .query(`
          SELECT sp.codigo AS subCodigo, c.Nombre AS cuadrilla, pr.nombre AS proyecto
          FROM dbo.CuadrillaSubPartida cs
          JOIN dbo.Cuadrilla c ON c.IDCuadrilla = cs.IDCuadrilla AND c.Activo = 1
          JOIN pro_obc.sub_partidas sp ON sp.id = cs.idSubPartida
          LEFT JOIN dbo.Proyecto pr ON pr.idProyecto = cs.idProyecto
          WHERE cs.idProyecto = @idProyecto AND cs.idSubPartida IN (${b.idSubPartidas.join(',')})
        `);
      if (conflictos.recordset.length > 0) {
        await tx.rollback();
        const proy = conflictos.recordset[0].proyecto ?? 'ese proyecto';
        const detalle = conflictos.recordset.map(r => `${r.subCodigo} (${r.cuadrilla})`).join(', ');
        return NextResponse.json({ error: `En ${proy} estas subpartidas ya están tomadas: ${detalle}` }, { status: 409 });
      }
    }

    // Denormalizado legacy: la primera subpartida queda en idSubPartida/TaskNoBC.
    const spRes = await new sql.Request(tx)
      .input('idSub', sql.Int, primeraSub)
      .query('SELECT codigo FROM pro_obc.sub_partidas WHERE id = @idSub');
    const taskNoBC = spRes.recordset[0]?.codigo ?? null;

    const userCheck = await new sql.Request(tx)
      .input('sid', sql.Int, session.idCol)
      .query('SELECT idColaborador FROM dbo.Colaborador WHERE idColaborador = @sid');
    const creadoPor = userCheck.recordset.length > 0 ? session.idCol : null;

    const ins = await new sql.Request(tx)
      .input('nombre', sql.NVarChar, nombre)
      .input('idProyecto', sql.Int, primerProyecto)
      .input('idEncargado', sql.Int, idEncargado)
      .input('capacidad', sql.Int, capacidad)
      .input('idSubPartida', sql.Int, primeraSub)
      .input('taskNoBC', sql.NVarChar, taskNoBC)
      .input('creadoPor', sql.Int, creadoPor)
      .query(`
        INSERT INTO dbo.Cuadrilla (Nombre, IDProyecto, IDEncargado, Capacidad, idSubPartida, TaskNoBC, CreadoPor)
        OUTPUT INSERTED.IDCuadrilla
        VALUES (@nombre, @idProyecto, @idEncargado, @capacidad, @idSubPartida, @taskNoBC, @creadoPor)
      `);
    const idCuadrilla = ins.recordset[0].IDCuadrilla;

    for (const idObra of idObras) {
      await new sql.Request(tx)
        .input('idCuadrilla', sql.Int, idCuadrilla)
        .input('idObra', sql.BigInt, idObra)
        .query('INSERT INTO dbo.CuadrillaObra (IDCuadrilla, idObra) VALUES (@idCuadrilla, @idObra)');
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
          .input('idCuadrilla', sql.Int, idCuadrilla)
          .input('idProyecto', sql.Int, b.idProyecto)
          .input('idSub', sql.Int, idSub)
          .query('INSERT INTO dbo.CuadrillaSubPartida (IDCuadrilla, idProyecto, idSubPartida) VALUES (@idCuadrilla, @idProyecto, @idSub)');
      }
    }

    await tx.commit();
    return NextResponse.json({ idCuadrilla }, { status: 201 });
  } catch (err: unknown) {
    try { await tx.rollback(); } catch { /* ya revertida */ }
    const num = (err as { number?: number })?.number;
    if (num === 2627 || num === 2601) {
      console.error('/api/cuadrillas POST unique violation:', err);
      return NextResponse.json({ error: 'Una o más subpartidas ya están asignadas a otra cuadrilla en ese proyecto. Quitalas y volvé a intentar.' }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/cuadrillas POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
