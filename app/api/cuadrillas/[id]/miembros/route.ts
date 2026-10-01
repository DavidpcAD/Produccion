import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const idCuadrilla = Number(id);
  const ip = req.headers.get('x-forwarded-for') ?? '';
  const { idCol } = await req.json();

  // Se validan los dos antes de tocar la base: `sql.Int` manda un NaN como NULL,
  // y con NULL la comprobación de "ya está en otra cuadrilla" (`<> @idCuadrilla`)
  // da UNKNOWN y pasa de largo, y el INSERT entra con IDCuadrilla en NULL.
  if (!Number.isInteger(idCuadrilla) || idCuadrilla <= 0) {
    return NextResponse.json({ error: 'Cuadrilla no válida' }, { status: 400 });
  }
  if (!Number.isInteger(idCol) || idCol <= 0) {
    return NextResponse.json({ error: 'Colaborador no válido' }, { status: 400 });
  }

  const db = await getDb();

  // Nadie puede estar en dos cuadrillas activas a la vez.
  const enOtra = await db.request()
    .input('idCol', sql.Int, idCol)
    .input('idCuadrilla', sql.Int, idCuadrilla)
    .query(`
      SELECT c.Nombre
      FROM dbo.CuadrillaMiembro cm
      JOIN dbo.Cuadrilla c ON c.IDCuadrilla = cm.IDCuadrilla
      WHERE cm.IDCol = @idCol AND cm.Activo = 1 AND c.Activo = 1 AND cm.IDCuadrilla <> @idCuadrilla
    `);
  if (enOtra.recordset.length) {
    return NextResponse.json(
      { error: `Este colaborador ya pertenece a la cuadrilla "${enOtra.recordset[0].Nombre}". Quítalo de ahí primero.` },
      { status: 409 },
    );
  }

  const userCheck = await db.request()
    .input('sid', sql.Int, session.idCol)
    .query('SELECT idColaborador FROM dbo.Colaborador WHERE idColaborador = @sid');
  const asignadoPor = userCheck.recordset.length > 0 ? session.idCol : null;

  // Si ya tuvo una membresía en ESTA cuadrilla, se reactiva en vez de duplicar.
  const previa = await db.request()
    .input('idCuadrilla', sql.Int, idCuadrilla)
    .input('idCol', sql.Int, idCol)
    .query('SELECT IDCuadMiembro, Activo FROM dbo.CuadrillaMiembro WHERE IDCuadrilla = @idCuadrilla AND IDCol = @idCol');

  if (previa.recordset.length) {
    if (previa.recordset[0].Activo) {
      return NextResponse.json({ error: 'El colaborador ya está en esta cuadrilla' }, { status: 409 });
    }
    await db.request()
      .input('idCuadMiembro', sql.Int, previa.recordset[0].IDCuadMiembro)
      .query(`UPDATE dbo.CuadrillaMiembro SET Activo = 1, FechaSalida = NULL, FechaIngreso = GETDATE() WHERE IDCuadMiembro = @idCuadMiembro`);
  } else {
    await db.request()
      .input('idCuadrilla', sql.Int, idCuadrilla)
      .input('idCol', sql.Int, idCol)
      .input('asignadoPor', sql.Int, asignadoPor)
      .query(`
        INSERT INTO dbo.CuadrillaMiembro (IDCuadrilla, IDCol, AsignadoPor, Activo, FechaIngreso)
        VALUES (@idCuadrilla, @idCol, @asignadoPor, 1, GETDATE())
      `);
  }

  await logAudit({
    idColAccion: session.idCol,
    accion: 'MOVER_CUADRILLA',
    entidad: 'CuadrillaMiembros',
    idEntidad: idCuadrilla,
    detalleNuevo: { idCol },
    ip,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const idCuadrilla = Number(id);
  const { idCuadMiembro } = await req.json();
  if (!Number.isInteger(idCuadrilla) || idCuadrilla <= 0 || !Number.isInteger(idCuadMiembro) || idCuadMiembro <= 0) {
    return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });
  }
  const db = await getDb();

  // El UPDATE va atado a la cuadrilla de la URL. Antes el `[id]` de la ruta se
  // leía y no se usaba: el id de la membresía venía suelto en el cuerpo, así que
  // con el endpoint de CUALQUIER cuadrilla se podía dar de baja a un miembro de
  // otra. Ahora la ruta hace lo que dice su dirección.
  const r = await db.request()
    .input('idCuadMiembro', sql.Int, idCuadMiembro)
    .input('idCuadrilla', sql.Int, idCuadrilla)
    .query(`UPDATE dbo.CuadrillaMiembro SET Activo = 0, FechaSalida = GETDATE()
            WHERE IDCuadMiembro = @idCuadMiembro AND IDCuadrilla = @idCuadrilla`);

  // Y si no quitó a nadie, se dice. Antes un UPDATE que no tocaba ninguna fila
  // —id inexistente, o de otra cuadrilla— devolvía ok:true y la pantalla cantaba
  // "Miembro removido" igual.
  if (!r.rowsAffected[0]) {
    return NextResponse.json({ error: 'Ese miembro no está en esta cuadrilla' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
