import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const TIPOS_CASA = new Set(['1N-Techo', '1N-Azotea', '2N-Techo', '2N-Azotea']);

// Crear una subpartida en el catálogo unificado (pro_obc.sub_partidas +
// sub_partida_tipos). Amarrada a una partida existente. Solo Super Admin (nivel 4).
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
  const activo = body.activo === undefined ? true : !!body.activo;
  const descripcion = String(body.descripcion ?? '').trim() || null;
  const tiposCasa: string[] = Array.isArray(body.tiposCasa)
    ? body.tiposCasa.filter((t: unknown) => TIPOS_CASA.has(String(t)))
    : [];

  if (!idPartida) return NextResponse.json({ error: 'Elegí la partida a la que pertenece' }, { status: 400 });
  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 150) return NextResponse.json({ error: 'El nombre no puede superar 150 caracteres' }, { status: 400 });
  if (numSprint < 1 || numSprint > 50) return NextResponse.json({ error: 'Sprint inválido (1–50)' }, { status: 400 });
  if (tiposCasa.length === 0) return NextResponse.json({ error: 'Elegí al menos un tipo de casa' }, { status: 400 });

  const db = await getAdelanteDb();
  try {
    const p = await db.request()
      .input('idP', sql.Int, idPartida)
      .query('SELECT id FROM pro_obc.partidas WHERE id = @idP');
    if (p.recordset.length === 0) {
      return NextResponse.json({ error: 'La partida no existe' }, { status: 400 });
    }

    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .query('SELECT 1 AS ok FROM pro_obc.sub_partidas WHERE codigo = @cod');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe una subpartida con el código "${codigo}"` }, { status: 409 });
    }

    const tx = new sql.Transaction(db);
    await tx.begin();
    let idSubPartida: number;
    try {
      const ins = await new sql.Request(tx)
        .input('codigo', sql.VarChar(50), codigo)
        .input('nombre', sql.NVarChar(150), nombre)
        .input('idPartida', sql.Int, idPartida)
        .input('numSprint', sql.SmallInt, numSprint)
        .input('esCritica', sql.Bit, esCritica)
        .input('descripcion', sql.NVarChar(sql.MAX), descripcion)
        .input('activo', sql.Bit, activo)
        .query(`
          INSERT INTO pro_obc.sub_partidas
            (codigo, nombre, partida_id, sprint_numero, es_critica, descripcion, activo)
          OUTPUT INSERTED.id AS idSubPartida
          VALUES (@codigo, @nombre, @idPartida, @numSprint, @esCritica, @descripcion, @activo)
        `);
      idSubPartida = ins.recordset[0].idSubPartida;

      for (const tc of tiposCasa) {
        await new sql.Request(tx)
          .input('id', sql.Int, idSubPartida)
          .input('tc', sql.VarChar(20), tc)
          .query('INSERT INTO pro_obc.sub_partida_tipos (sub_partida_id, tipo_casa) VALUES (@id, @tc)');
      }
      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch { /* ignorar */ }
      throw e;
    }

    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_SUBPARTIDA',
      entidad: 'SubPartida',
      idEntidad: idSubPartida,
      detalleNuevo: { codigo, nombre, idPartida, numSprint, esCritica, descripcion, tiposCasa, activo },
      ip,
    });

    return NextResponse.json({ idSubPartida }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/subpartidas POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
