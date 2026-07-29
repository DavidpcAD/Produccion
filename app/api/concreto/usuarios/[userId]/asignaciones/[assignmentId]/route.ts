import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ErrorGraph, ErrorGraphDeps, quitarRol } from '@/lib/concreto/graph-usuarios';

// DELETE /api/concreto/usuarios/[userId]/asignaciones/[assignmentId]
// Quita un rol de un usuario. SOLO ADMIN (nivelAdmin >= 4).

function esGuidValido(s: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string; assignmentId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido (solo admin)' }, { status: 403 });

  const { userId, assignmentId } = await params;
  if (!userId || !esGuidValido(userId)) {
    return NextResponse.json({ error: `userId inválido: "${userId}"` }, { status: 400 });
  }
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentId requerido' }, { status: 400 });
  }

  try {
    await quitarRol(userId, assignmentId);
    console.log(`Asignación ${assignmentId} de user ${userId} quitada por ${session.cedula}.`);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorGraphDeps) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    if (err instanceof ErrorGraph) {
      console.error('quitar-rol Graph error:', err.message);
      if (err.status === 404) return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 });
      return NextResponse.json({ error: `Error al consultar Microsoft Graph: ${err.message}` }, { status: 500 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('quitar-rol error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
