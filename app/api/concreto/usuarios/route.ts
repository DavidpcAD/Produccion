import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ErrorGraph, ErrorGraphDeps, buscarUsuarios, listarUsuariosAsignados } from '@/lib/concreto/graph-usuarios';

// Gestión de roles de usuarios (Microsoft Graph). SOLO ADMIN (nivelAdmin >= 4).
//   GET /api/concreto/usuarios          → usuarios con al menos un rol asignado
//   GET /api/concreto/usuarios?q=texto  → búsqueda por displayName/mail/UPN
// 501 si Graph no está configurado (env o SDK ausentes).

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido (solo admin)' }, { status: 403 });

  const q = req.nextUrl.searchParams.get('q')?.trim() || undefined;
  const limiteRaw = req.nextUrl.searchParams.get('limite');
  let limite = 25;
  if (limiteRaw) {
    const n = Number(limiteRaw);
    if (Number.isInteger(n) && n >= 1 && n <= 50) limite = n;
  }

  try {
    const usuarios = q ? await buscarUsuarios(q, limite) : await listarUsuariosAsignados();
    return NextResponse.json({ usuarios });
  } catch (err: unknown) {
    if (err instanceof ErrorGraphDeps) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    if (err instanceof ErrorGraph) {
      console.error('/api/concreto/usuarios GET Graph error:', err.message);
      return NextResponse.json({ error: `Error al consultar Microsoft Graph: ${err.message}` }, { status: 500 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/usuarios GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
