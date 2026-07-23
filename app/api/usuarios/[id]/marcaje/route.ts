import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { enrolarEnZona, H4Error } from '@/lib/h4';

// Estado de enrolamiento/biometría del colaborador en sus zonas de marca (H4).
// Lectura directa del esquema h4 en AdelanteSBX (la vista vZonaColaboradorEstado
// resuelve el estado: sin_dispositivos | esperando_biometria | redistribuyendo | lista).
// Se usa para el polling en la pantalla de detalle tras crear/enrolar.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();
  const res = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT z.idZona, z.nombre AS zona, z.ubicacion,
             e.pin, e.estado,
             e.equiposCompatibles, e.equiposConCara,
             e.equiposConHuella, e.equiposConFoto
      FROM h4.ZonaColaborador zc
      JOIN h4.Zona z ON z.idZona = zc.idZona
      JOIN h4.vZonaColaboradorEstado e ON e.idZonaColaborador = zc.idZonaColaborador
      WHERE zc.idColaborador = @id AND zc.activo = 1
      ORDER BY z.nombre
    `);

  return NextResponse.json({ zonas: res.recordset });
}

// Agrega al colaborador a una zona de marca (ADITIVO: no toca las demás zonas —
// un colaborador puede estar en varias). Sirve para enrolar a colaboradores
// creados antes del selector de zona y para sumar zonas nuevas.
// El alta va SIEMPRE por la API de H4 (enrolarEnZona), que encola los comandos a
// los relojes; es idempotente (si ya estaba, reactiva/actualiza).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const idColaborador = parseInt(id);
  if (!idColaborador) {
    return NextResponse.json({ error: 'Colaborador inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const idZona = body?.idZona != null && String(body.idZona).trim() !== '' ? Number(body.idZona) : null;
  if (!idZona) {
    return NextResponse.json({ error: 'Debe indicar la zona de marca.' }, { status: 400 });
  }

  try {
    const enrolamiento = await enrolarEnZona(idZona, idColaborador, session.cedula ?? null);
    return NextResponse.json({ enrolamiento });
  } catch (e) {
    const msg = e instanceof H4Error ? e.message : (e instanceof Error ? e.message : String(e));
    console.error('/api/usuarios/[id]/marcaje enrolamiento H4 error:', e);
    return NextResponse.json({ error: msg }, { status: e instanceof H4Error ? e.status : 502 });
  }
}

// Quita al colaborador de una zona: desactiva la membresía en la BD
// (h4.ZonaColaborador.activo = 0, fechaBaja). H4 lo da de baja en los relojes de
// esa zona por su sincronización. Las demás zonas del colaborador no se tocan.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const idColaborador = parseInt(id);
  const idZona = Number(new URL(req.url).searchParams.get('idZona'));
  if (!idColaborador || !idZona) {
    return NextResponse.json({ error: 'Colaborador y zona son requeridos.' }, { status: 400 });
  }

  const db = await getDb();
  await db.request()
    .input('id', sql.Int, idColaborador)
    .input('idZona', sql.Int, idZona)
    .input('por', sql.NVarChar, session.cedula ?? 'control-usuarios')
    .query(`
      UPDATE h4.ZonaColaborador
      SET activo = 0, fechaBaja = SYSUTCDATETIME(),
          fechaModificacion = SYSUTCDATETIME(), modificadoPor = @por
      WHERE idColaborador = @id AND idZona = @idZona AND activo = 1
    `);

  return NextResponse.json({ ok: true });
}
