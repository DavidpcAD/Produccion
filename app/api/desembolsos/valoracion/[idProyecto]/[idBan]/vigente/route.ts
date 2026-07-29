import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { editarVigente, mapDbError } from '@/lib/desembolsos/valoracion';

export const dynamic = 'force-dynamic';

// PATCH /api/desembolsos/valoracion/{idProyecto}/{idBan}/vigente — edita in-place.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ idProyecto: string; idBan: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const p = await params;
  const idProyecto = Number(p.idProyecto);
  const idBan = Number(p.idBan);
  if (!Number.isInteger(idProyecto) || idProyecto <= 0) return NextResponse.json({ error: 'idProyecto inválido' }, { status: 400 });
  if (!Number.isInteger(idBan) || idBan <= 0) return NextResponse.json({ error: 'idBan inválido' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 }); }

  const valorM2 = Number(body.ValorM2Lote);
  const pct = Number(body.PorcentajeFinanciamiento);
  if (!valorM2 || valorM2 <= 0) return NextResponse.json({ error: 'ValorM2Lote debe ser mayor a 0.' }, { status: 400 });
  if (!pct || pct <= 0 || pct > 100) return NextResponse.json({ error: 'PorcentajeFinanciamiento debe estar entre 0 y 100.' }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await editarVigente(db, {
      IDProyecto: idProyecto, IDBan: idBan, ValorM2Lote: valorM2,
      Moneda: body.Moneda != null ? String(body.Moneda) : undefined,
      PorcentajeFinanciamiento: pct, Notas: body.Notas != null ? String(body.Notas) : null,
      UsuarioEmail: session.cedula,
    }));
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
