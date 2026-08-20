import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './lib/auth';
import { getRouteLevel, getRouteModule, moduloPublicado, rutaPermitida } from './lib/permissions';

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

  // Órdenes de Compra: el acceso va por MÓDULO del rol de Producción, no por
  // nivel. Antes exigía nivel 4 ("solo superadmin hasta definir los roles"), y
  // con eso Bodega no podía ni crear un pedido salvo volviéndola superadmin.
  // Ahora: Ingeniería entra a todo el módulo, Bodega solo a crear/ver pedidos
  // (ver modulosDeRuta), Aprobación sigue siendo de Super Admin, y quien no
  // tenga rol de Producción no entra.
  // OJO: el token de una sesión abierta ANTES de este cambio no trae `modules`.
  // En ese caso se cae al nivel de siempre (nadie pierde el acceso que ya tenía);
  // en el próximo login el token ya viene con módulos y manda el rol.
  const esCompras = pathname.startsWith('/compras') || pathname.startsWith('/api/compras');
  if (esCompras) {
    const permitido = session.modules
      ? rutaPermitida(pathname, session.modules)
      : session.nivelAdmin >= requiredLevel;
    if (!permitido) {
      return pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'No autorizado' }, { status: 403 })
        : NextResponse.redirect(new URL('/?error=forbidden', request.url));
    }
  } else if (session.nivelAdmin < requiredLevel) {
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
