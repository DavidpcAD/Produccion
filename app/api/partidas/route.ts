import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Catálogo de partidas y subpartidas de Business Central. Se usan para asignar
// la tarea (partida/subpartida) de cada cuadrilla — es obligatorio por ley.
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const db = await getDb();
  const [etapas, partidas, subpartidas] = await Promise.all([
    db.request().query(`
      SELECT id AS idEtapa, codigo, nombre
      FROM dbo.Etapa
      WHERE activo = 1
      ORDER BY codigo
    `),
    db.request().query(`
      SELECT idPartida, codigo, nombre, idEtapa
      FROM dbo.Partida
      WHERE esActivo = 1
      ORDER BY codigo
    `),
    db.request().query(`
      SELECT idSubPartida, codigo, nombre, idPartida, numSprint, esCritica, descripcion
      FROM dbo.SubPartida
      WHERE esActivo = 1
      ORDER BY codigo
    `),
  ]);

  return NextResponse.json({
    etapas: etapas.recordset,
    partidas: partidas.recordset,
    subpartidas: subpartidas.recordset,
  });
}

// Crear una partida dentro de una etapa. Solo Super Admin (nivel 4).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));

  const idEtapa = Number(body.idEtapa) || 0;
  const codigo = String(body.codigo ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();

  if (!idEtapa) return NextResponse.json({ error: 'Elegí la etapa a la que pertenece' }, { status: 400 });
  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 100) return NextResponse.json({ error: 'El nombre no puede superar 100 caracteres' }, { status: 400 });

  const db = await getDb();
  try {
    // La etapa debe existir y estar activa.
    const e = await db.request()
      .input('idE', sql.Int, idEtapa)
      .query('SELECT id FROM dbo.Etapa WHERE id = @idE AND activo = 1');
    if (e.recordset.length === 0) {
      return NextResponse.json({ error: 'La etapa no existe o está inactiva' }, { status: 400 });
    }

    // Evitar código duplicado (activo).
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .query('SELECT 1 AS ok FROM dbo.Partida WHERE codigo = @cod AND esActivo = 1');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe una partida activa con el código "${codigo}"` }, { status: 409 });
    }

    const ins = await db.request()
      .input('codigo', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(100), nombre)
      .input('idEtapa', sql.Int, idEtapa)
      .query(`
        INSERT INTO dbo.Partida (codigo, nombre, idEtapa, esActivo, esPosting, fechaCreacion)
        OUTPUT INSERTED.idPartida
        VALUES (@codigo, @nombre, @idEtapa, 1, 0, SYSUTCDATETIME())
      `);
    const idPartida = ins.recordset[0].idPartida;

    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_PARTIDA',
      entidad: 'Partida',
      idEntidad: idPartida,
      detalleNuevo: { codigo, nombre, idEtapa },
      ip,
    });

    return NextResponse.json({ idPartida }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/partidas POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
