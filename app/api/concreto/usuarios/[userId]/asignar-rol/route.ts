import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ErrorGraph, ErrorGraphDeps, asignarRol } from '@/lib/concreto/graph-usuarios';
import { ROLES_APP, type RolApp } from '@/lib/concreto/tipos-deps';

// POST /api/concreto/usuarios/[userId]/asignar-rol  body { rol }
// Asigna un App Role a un usuario. SOLO ADMIN (nivelAdmin >= 4).

function esGuidValido(s: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido (solo admin)' }, { status: 403 });

  const { userId } = await params;
  if (!userId || !esGuidValido(userId)) {
    return NextResponse.json({ error: `userId inválido: "${userId}"` }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text && text.trim() !== '') body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }

  const rol = body.rol;
  if (typeof rol !== 'string' || !ROLES_APP.includes(rol as RolApp)) {
    return NextResponse.json(
      { error: `rol inválido. Valores: ${ROLES_APP.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const r = await asignarRol(userId, rol as RolApp);
    console.log(`Rol "${rol}" ${r.yaExistia ? 'YA estaba' : 'asignado'} a user ${userId} por ${session.cedula}.`);
    return NextResponse.json(r);
  } catch (err: unknown) {
    if (err instanceof ErrorGraphDeps) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    if (err instanceof ErrorGraph) {
      console.error('asignar-rol Graph error:', err.message);
      if (err.status === 404) return NextResponse.json({ error: 'Usuario o rol no encontrado' }, { status: 404 });
      if (err.status === 400 || err.status === 409) {
        return NextResponse.json({ error: err.message, codigo: 'GRAPH_CONFLICTO' }, { status: 409 });
      }
      return NextResponse.json({ error: `Error al consultar Microsoft Graph: ${err.message}` }, { status: 500 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('asignar-rol error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
