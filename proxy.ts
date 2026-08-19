import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './lib/auth';
import { getRouteLevel, getRouteModule, moduloPublicado } from './lib/permissions';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const requiredLevel = getRouteLevel(pathname);
  if (requiredLevel === 0) return NextResponse.next();

  const token = request.cookies.get('adelante_session')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = verifyToken(token);
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session.nivelAdmin < requiredLevel) {
    return NextResponse.redirect(new URL('/?error=forbidden', request.url));
  }

  // Módulo apagado (Avance de obra, ver AVANCE_OBRA_ACTIVO): la ruta no existe
  // para nadie, ni escribiéndola a mano. Los catálogos bajo /avance
  // (tipos-casa, sprints, sub-partidas, pesos) son de Presupuesto y sí pasan.
  if (!moduloPublicado(getRouteModule(pathname))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const res = NextResponse.next();
  res.headers.set('x-user-id', String(session.idCol));
  res.headers.set('x-nivel-admin', String(session.nivelAdmin));
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
