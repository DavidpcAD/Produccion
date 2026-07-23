import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Crear una subpartida (catálogo interno). Queda amarrada a una PARTIDA existente
// (y por ende a su etapa). Solo Super Admin (nivel 4).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));

  const idPartida = Number(body.idPartida) || 0;
  const codigo = String(body.codigo ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();
  const numSprint = Number.isFinite(Number(body.numSprint)) ? Number(body.numSprint) : 1;
  const esCritica = !!body.esCritica;
  const descripcion = String(body.descripcion ?? '').trim() || null;

  if (!idPartida) return NextResponse.json({ error: 'Elegí la partida a la que pertenece' }, { status: 400 });
  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 50) return NextResponse.json({ error: 'El nombre no puede superar 50 caracteres' }, { status: 400 });
  if (descripcion && descripcion.length > 50) return NextResponse.json({ error: 'La descripción no puede superar 50 caracteres' }, { status: 400 });

  const db = await getDb();
  try {
    // La partida debe existir y estar activa.
    const p = await db.request()
      .input('idP', sql.Int, idPartida)
      .query('SELECT idPartida FROM dbo.Partida WHERE idPartida = @idP AND esActivo = 1');
    if (p.recordset.length === 0) {
      return NextResponse.json({ error: 'La partida no existe o está inactiva' }, { status: 400 });
    }

    // Evitar código duplicado (activo).
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .query('SELECT 1 AS ok FROM dbo.SubPartida WHERE codigo = @cod AND esActivo = 1');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe una subpartida activa con el código "${codigo}"` }, { status: 409 });
    }

    const ins = await db.request()
      .input('codigo', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(50), nombre)
      .input('idPartida', sql.Int, idPartida)
      .input('numSprint', sql.SmallInt, numSprint)
      .input('esCritica', sql.Bit, esCritica)
      .input('descripcion', sql.NVarChar(50), descripcion)
      .query(`
        INSERT INTO dbo.SubPartida (codigo, nombre, idPartida, numSprint, esCritica, descripcion, esActivo, fechaCreacion)
        OUTPUT INSERTED.idSubPartida
        VALUES (@codigo, @nombre, @idPartida, @numSprint, @esCritica, @descripcion, 1, SYSUTCDATETIME())
      `);
    const idSubPartida = ins.recordset[0].idSubPartida;

    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_SUBPARTIDA',
      entidad: 'SubPartida',
      idEntidad: idSubPartida,
      detalleNuevo: { codigo, nombre, idPartida, numSprint, esCritica, descripcion },
      ip,
    });

    return NextResponse.json({ idSubPartida }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/subpartidas POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
