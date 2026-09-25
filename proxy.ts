import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './lib/auth';
import { getRouteLevel, getRouteModule, moduloPublicado, rutaPermitida } from './lib/permissions';

/** Prefijos cuyo acceso va por MÓDULO del rol de Producción y no por nivel.
 *
 *  Ojo con agregar acá: solo sirve para módulos CERRADOS, o sea cuyas pantallas
 *  llaman únicamente a APIs del mismo módulo. Presupuesto, Obras o Cuadrillas no
 *  lo son —las pantallas de Compras leen /api/obras, por ejemplo—, así que
 *  gatearlos por módulo rompería pantallas ajenas. Para esos casos el permiso se
 *  verifica en la ruta (ver lib/compras/guard.ts y lib/concreto/guard.ts). */
const POR_MODULO = ['/compras', '/api/compras', '/concreto', '/api/concreto'];

const SESION_VENCIDA = 'Tu sesión terminó. Entrá de nuevo.';

/** Una ruta de API NUNCA debe contestar con un redirect.
 *
 *  El `fetch` del navegador sigue el redirect solo, reenvía el POST a `/login`
 *  —que es una página, no una API— y recibe un 405 sin JSON. La pantalla se
 *  queda con un "no se pudo" genérico y el usuario no se entera de que lo único
 *  que pasó fue que se le venció la sesión: eso fue el 25/09/2026 con Luis
 *  Roberto creando una subpartida, y el 26/08/2026 con las órdenes que decían
 *  "lanzado" sin haber tocado BC.
 *
 *  Entonces: a /api/* se le contesta con el estado real y JSON, que es lo que la
 *  pantalla sabe leer; a las páginas, el redirect de siempre. */
function rechazar(
  request: NextRequest,
  pathname: string,
  opts: { status: number; error: string; destino: string; sesion?: boolean },
) {
  if (pathname.startsWith('/api/')) {
    const res = NextResponse.json({ error: opts.error }, { status: opts.status });
    res.headers.set('Cache-Control', 'no-store');
    // Marca para el cliente: este 401 es la sesión y no un permiso, así que la
    // app manda al login sin preguntar (ver hooks/useSession.ts). Los 401 que
    // devuelve cada ruta por su cuenta no la llevan y se siguen manejando ahí.
    if (opts.sesion) res.headers.set('x-sesion', 'vencida');
    return res;
  }
  return NextResponse.redirect(new URL(opts.destino, request.url));
}

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
    // Sin cookie puede ser que nunca entró (página → login pelado, sin avisos
    // raros) o que se le venció, porque la cookie dura lo mismo que el token.
    // Una llamada a /api/* sale siempre de una pantalla ya abierta: ahí es la
    // sesión la que se acabó.
    return rechazar(request, pathname, {
      status: 401, error: SESION_VENCIDA, sesion: true, destino: '/login',
    });
  }

  const session = verifyToken(token);
  if (!session) {
    // Token vencido o revocado: el login lo dice y devuelve a donde estaba.
    // Solo el pathname, sin el query: ahí viaja el `_rsc` de las navegaciones
    // de Next y cualquier parámetro que no tiene por qué quedar en un enlace.
    return rechazar(request, pathname, {
      status: 401, error: SESION_VENCIDA, sesion: true,
      destino: `/login?sesion=vencida&volver=${encodeURIComponent(pathname)}`,
    });
  }

  // Órdenes de Compra y Concreto: el acceso va por MÓDULO del rol de Producción,
  // no por nivel. En Compras, antes exigía nivel 4 ("solo superadmin hasta definir
  // los roles"), y con eso Bodega no podía ni crear un pedido salvo volviéndola
  // superadmin. Ahora: Ingeniería entra a todo el módulo, Bodega solo a crear/ver
  // pedidos (ver modulosDeRuta), Aprobación sigue siendo de Super Admin, y quien
  // no tenga rol de Producción no entra. En Concreto el problema era el contrario:
  // la ruta pedía nivel 1, así que CUALQUIERA que entrara al app llegaba a la
  // pantalla; ahora pide el módulo 'concreto'.
  //
  // OJO: el token de una sesión abierta ANTES de este cambio no trae `modules`.
  // En ese caso se cae al nivel de siempre (nadie pierde el acceso que ya tenía);
  // en el próximo login el token ya viene con módulos y manda el rol.
  //
  // Esto es una comprobación OPTIMISTA: sirve para no pintarle a nadie una
  // pantalla que no puede usar. El permiso de verdad lo verifica cada ruta con
  // su guard (lib/compras/guard.ts, lib/concreto/guard.ts), porque `proxy.ts` no
  // es —ni debe ser— la solución de autorización (doc de Next: 01-getting-started/16-proxy).
  if (POR_MODULO.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    const permitido = session.modules
      ? rutaPermitida(pathname, session.modules)
      : session.nivelAdmin >= requiredLevel;
    if (!permitido) {
      return rechazar(request, pathname, {
        status: 403, error: 'No autorizado', destino: '/?error=forbidden',
      });
    }
  } else if (session.nivelAdmin < requiredLevel) {
    return rechazar(request, pathname, {
      status: 403, error: 'No autorizado', destino: '/?error=forbidden',
    });
  }

  // Módulo apagado (Avance de obra, ver AVANCE_OBRA_ACTIVO): la ruta no existe
  // para nadie, ni escribiéndola a mano. Los catálogos bajo /avance
  // (tipos-casa, sprints, sub-partidas, pesos) son de Presupuesto y sí pasan.
  if (!moduloPublicado(getRouteModule(pathname))) {
    return rechazar(request, pathname, {
      status: 404, error: 'Módulo no disponible', destino: '/',
    });
  }

  // Antes se devolvían acá `x-user-id` y `x-nivel-admin`. Eran cabeceras de
  // RESPUESTA (NextResponse.next() no reescribe las de la request), así que no
  // las leía nadie del lado del servidor: lo único que hacían era publicarle al
  // navegador —y a cualquier proxy o log del camino— el id interno y el nivel de
  // privilegio del usuario. Se quitaron. Si algún día hace falta pasarle datos de
  // sesión a la ruta, se hace con `NextResponse.next({ request: { headers } })`;
  // igual la ruta ya tiene la sesión firmada con `getSession()`.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
