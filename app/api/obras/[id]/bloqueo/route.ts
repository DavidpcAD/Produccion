import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { setObraBlocked, bcConfigured } from '@/lib/bc-client';

// Bloquea/desbloquea una obra. Las obras NO se eliminan: una obra vendida se
// bloquea. Si la obra es de Business Central, primero se bloquea en BC (los 3
// pasos del web service AdelanteObra) y solo si eso funciona se cambia el
// estado en SQL, para no desincronizar.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const blocked = !!body.blocked;
  const postventaNo = typeof body.postventaNo === 'string' ? body.postventaNo.trim() : '';

  const db = await getDb();
  try {
    const info = await db.request()
      .input('id', sql.BigInt, id)
      .query('SELECT numeroObra, esBC FROM dbo.Obra WHERE idObra = @id');
    if (info.recordset.length === 0) {
      return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 });
    }
    const { numeroObra, esBC } = info.recordset[0] as { numeroObra: string; esBC: boolean | null };

    // Al bloquear una obra de BC hay que indicar a qué Postventa (PV-…) va.
    if (esBC && blocked && !postventaNo) {
      return NextResponse.json({ error: 'Seleccioná la Postventa (obra PV-…) a la que va esta obra.' }, { status: 400 });
    }

    // 1) Business Central (si aplica). Si falla, no tocamos SQL.
    let bcSync = false;
    if (esBC) {
      if (!bcConfigured()) {
        return NextResponse.json({ error: 'BC no está configurado en este entorno; no se puede bloquear la obra en Business Central.' }, { status: 503 });
      }
      try {
        await setObraBlocked(numeroObra, blocked, postventaNo);
        bcSync = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('/api/obras/[id]/bloqueo BC error:', err);
        return NextResponse.json({ error: `No se pudo ${blocked ? 'bloquear' : 'desbloquear'} en Business Central: ${msg}` }, { status: 502 });
      }
    }

    // 2) Estado en SQL (fuente de la verdad de la app).
    await db.request()
      .input('id', sql.BigInt, id)
      .input('estado', sql.NVarChar, blocked ? 'Blocked' : 'Open')
      .input('modificadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        UPDATE dbo.Obra
        SET estado = @estado, fechaModificacion = SYSUTCDATETIME(), modificadoPor = @modificadoPor
        WHERE idObra = @id
      `);

    return NextResponse.json({ ok: true, bcSync, estado: blocked ? 'Blocked' : 'Open' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/obras/[id]/bloqueo error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
