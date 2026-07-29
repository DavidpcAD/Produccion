import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { valoracionPorProyecto, crearValoracion, validarCrear, mapDbError } from '@/lib/desembolsos/valoracion';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/valoracion?idProyecto= — bancos × valoración vigente.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idProyecto = Number(req.nextUrl.searchParams.get('idProyecto'));
  if (!Number.isInteger(idProyecto) || idProyecto <= 0) return NextResponse.json({ error: 'idProyecto inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    const data = await valoracionPorProyecto(db, idProyecto);
    if (!data) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}

// POST /api/desembolsos/valoracion — crear nueva versión.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 }); }
  const input = {
    IDProyecto: Number(body.IDProyecto),
    IDBan: Number(body.IDBan),
    ValorM2Lote: Number(body.ValorM2Lote),
    Moneda: body.Moneda != null ? String(body.Moneda) : undefined,
    PorcentajeFinanciamiento: Number(body.PorcentajeFinanciamiento),
    VigenteDesde: String(body.VigenteDesde ?? ''),
    Notas: body.Notas != null ? String(body.Notas) : null,
    UsuarioEmail: session.cedula,
  };
  const err = validarCrear(input);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await crearValoracion(db, input), { status: 201 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
