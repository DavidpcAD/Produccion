import type { JWTPayload } from './auth';

// ─────────────────────────────────────────────────────────────────────────
// La tabla dbo.Rol NO tiene NivelAdmin, pero el control de acceso de la app se
// basa en niveles (1=empleado, 2=admin, 4=superadmin). Acá se centraliza la
// correspondencia Rol→nivel; para ajustar permisos, editá SOLO estos mapas.
//
// El nivel se resuelve por MÓDULOS (roles de Producción) o por NOMBRE (roles
// legacy de otras apps), nunca por idRol. Antes había un `ROLE_LEVEL_BY_ID`
// ({1:4, 2:1, 3:2, 4:2, 5:1, 6:1}) como último recurso, y un id no significa lo
// mismo en cada base: en AdelantePRO los idRol 4 y 5 son "Digitacion general" y
// "Digitacion maderas" (del app de Digitación), no "Jefe de Cuadrillas" y
// "Proveeduría". Atar un permiso a ese número es atarlo a una coincidencia.
// ─────────────────────────────────────────────────────────────────────────

// Fallback por nombre (por si los IDs cambian en otra instancia). Se compara en
// minúsculas y sin espacios extra. Aquí se define qué rol da qué nivel.
const ROLE_LEVEL_BY_NAME: Record<string, number> = {
  'superadministrador': 4,
  'super administrador': 4,
  'superadmin': 4,
  'super admin': 4,
  'administrador': 4,
  'contabilidad': 1,
  // OJO: acá NO van los roles de Producción (Ingenieria, Presupuestista,
  // Administracion…). Su nivel se DERIVA de sus módulos en `nivelDeRol`, que es
  // lo correcto, y listarlos por nombre además es peligroso: los nombres se
  // repiten entre apps. Estaban 'digitacion general|maderas' y 'digitador' → 4
  // pensando en el rol *Administracion·Digitacion* de Producción, pero esos son
  // TAMBIÉN los nombres de los roles del app de Digitación (idApp 1). Desde que
  // ambos padrones viven en AdelantePRO, seis usuarios de Digitación
  // (mauricio, jessi, fabian, jerson, bryan, alessandra) quedaban con nivel 4
  // en Producción —sin ningún rol de idApp 10— y con eso pasaban el nivel 4 que
  // exige /compras. Se quitaron: ellos siguen igual en SU app, que no usa este
  // archivo, y en Producción caen al nivel que les da su rol legacy.
  // Roles legacy (otras apps) que aún aparecen:
  'ingeniero residente': 2,
  'jefe de cuadrillas': 2,
  'maestro de obras': 1,
  'proveeduría': 1,
  'proveeduria': 1,
  'facturador bodega': 1,
};

// Nivel que exige cada módulo (la acción más alta que contiene). El nivel de un
// rol de Producción se DERIVA de sus módulos, así no depende de calzar nombres.
const MODULE_LEVEL: Record<string, number> = {
  dashboard: 1, presupuesto: 4, ingenieria: 4, avance: 2, concreto: 4, desembolsos: 1,
  // Bodega solo crea y ve SUS pedidos: no aprueba ni registra en BC, así que su
  // rol no debe elevar el nivel del usuario (con 4 entraría a todo lo demás).
  bodega: 1,
  // Recepción de material y facturas. Mismo criterio que bodega: no eleva el nivel.
  recepcion: 1,
  admin: 4,
};

/** Calcula el nivelAdmin efectivo a partir de los roles del usuario.
 *  Para roles de Producción (idApp 10) el nivel se deriva de sus módulos
 *  (rol+tipo); para los legacy de otras apps se usa el mapa por nombre/ID. */
/** Nivel de UN rol. Roles de Producción: se deriva de sus módulos (rol+tipo);
 *  roles de otras apps: por nombre. Sin coincidencia, el mínimo (1). */
export function nivelDeRol(r: { nombre?: string; idApp?: number; tipo?: string }): number {
  const porNombre = r.nombre ? ROLE_LEVEL_BY_NAME[r.nombre.trim().toLowerCase()] : undefined;
  if (r.idApp !== undefined && r.idApp !== PROD_APP_ID) {
    // Rol de OTRA app: nivel legacy por nombre (no lo eleva el modelo nuevo).
    return porNombre ?? 1;
  }
  const m = modulosDeRol(r.nombre, r.tipo);
  if (m === '*') return 4;
  if (m) return Math.max(...m.map((mod) => MODULE_LEVEL[mod] ?? 1));
  return porNombre ?? 1;
}

export function computeNivelAdmin(
  roles: Array<{ idRol: number; nombre?: string; idApp?: number; tipo?: string }>,
): number {
  let max = 0;
  for (const r of roles) {
    const lvl = nivelDeRol(r);
    if (lvl > max) max = lvl;
  }
  return max;
}

export function requireMinLevel(session: JWTPayload | null, level: number): boolean {
  if (!session) return false;
  return session.nivelAdmin >= level;
}

export function getRouteLevel(pathname: string): number {
  if (pathname.startsWith('/login')) return 0;
  // Órdenes de Compra (Ingeniería / Proveeduría / Aprobación): por ahora SOLO superadmin,
  // hasta definir los roles reales (Ingeniería / Gerencia / etc.). Cubre páginas y API.
  if (pathname.startsWith('/compras') || pathname.startsWith('/api/compras')) return 4;
  // Integración BC: escribir a BC (reportar/registrar) exige superadmin (N4); ver
  // el listado/detalle/presupuestos desde N2. Los /api/bc/{dimensions,jobs,tasks,
  // inventory-groups} existentes quedan intactos (default N1, los usa el editor de obras).
  if (pathname.startsWith('/api/bc/reportar') || pathname.startsWith('/api/bc/registrar')) return 4;
  if (pathname.startsWith('/api/bc/preview') || pathname.startsWith('/api/bc/resumen')) return 2;
  if (pathname.startsWith('/api/presupuestos')) return 2;
  if (pathname.startsWith('/bc')) return 2;
  if (pathname.startsWith('/apps')) return 4;
  if (pathname.startsWith('/roles')) return 4;
  if (pathname.startsWith('/cuentas')) return 4;
  if (pathname.startsWith('/obras')) return 2;
  if (pathname.startsWith('/usuarios/nuevo') || pathname.startsWith('/usuarios/') && pathname.includes('/editar')) return 2;
  if (pathname.startsWith('/proyectos') || pathname.startsWith('/cuadrillas')) return 2;
  if (pathname.startsWith('/encargados')) return 2;
  if (pathname.startsWith('/auditoria')) return 2;
  if (pathname.startsWith('/usuarios')) return 1;
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Acceso por ROL → MÓDULOS (modelo de Producción). Cada rol de Producción entra
// solo a sus módulos; Super Admin a todos. Los roles de OTRAS apps no cuentan
// aquí: si un usuario no tiene ningún rol de Producción, computeAllowedModules
// devuelve null (el front cae al filtro por nivel de siempre, así nadie queda
// sin menú). Para ajustar qué ve cada rol, editá SOLO estos mapas.
// ─────────────────────────────────────────────────────────────────────────
export type Modulo =
  | 'dashboard' | 'presupuesto' | 'ingenieria' | 'avance' | 'concreto' | 'desembolsos'
  // Dos cosas distintas dentro de Órdenes de Compra:
  //   · 'bodega'    (rol "Bodega", ej. jersonm) PIDE material para el stock de bodega:
  //     lo mismo que un ingeniero, solo en "Mis solicitudes".
  //   · 'recepcion' RECIBE el material y sus facturas ("Órdenes por recibir" /
  //     "Recibidas"). Lo lleva Fábrica de Maderas, que pide Y recibe lo suyo.
  | 'bodega' | 'recepcion' | 'admin';

/** ── Interruptor de "Avance de obra" ──────────────────────────────────────
 *  El módulo está incompleto, así que NO sale a producción todavía: en `false`
 *  desaparece del menú, del dashboard y de sus rutas — nadie entra a /avance,
 *  ni Super Admin. Los catálogos que viven bajo /avance (tipos de casa,
 *  sprints, sub-partidas, pesos) son de Presupuesto y siguen abiertos.
 *  Para volver a publicarlo: poner `true`. Nada más. */
export const AVANCE_OBRA_ACTIVO = false;

const MODULOS_BASE: Modulo[] =
  ['dashboard', 'presupuesto', 'ingenieria', 'avance', 'concreto', 'desembolsos', 'bodega', 'recepcion', 'admin'];

/** Módulos publicados (los apagados no salen para nadie). */
export const MODULOS_TODOS: Modulo[] =
  MODULOS_BASE.filter((m) => m !== 'avance' || AVANCE_OBRA_ACTIVO);

/** ¿El módulo está publicado? (respeta los interruptores de arriba). */
export function moduloPublicado(m: Modulo): boolean {
  return MODULOS_TODOS.includes(m);
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/**
 * Módulos de un rol de Producción, según su NOMBRE y su TIPO (dbo.TipoRol).
 * Los roles de Producción (idApp 10) comparten nombre (Administracion ×3,
 * Ingenieria ×3) y se distinguen por el tipo — igual que en la pantalla de roles.
 * '*' = todo · undefined = no es rol de Producción (no cuenta).
 */
function modulosDeRol(nombre?: string, tipo?: string): Modulo[] | '*' | undefined {
  const n = norm(nombre), t = norm(tipo);
  // Super Admin (por nombre o por tipo de "Administracion")
  if (n.startsWith('superadmin') || n === 'super admin' || n === 'administrador' ||
      t === 'super admin' || t === 'superadmin' || t === 'superadministrador') return '*';
  if (n === 'presupuestista') return ['presupuesto'];
  // Ingeniería = Órdenes de Compra + Cuadrillas ('ingenieria') y Avance de obra
  // ('avance'). Si Avance está apagado, computeAllowedModules lo saca.
  if (n === 'ingenieria' || n === 'ingeniería' || n === 'ingeniero' || n.startsWith('ingeniero ')) return ['ingenieria', 'avance'];
  if (n === 'administracion' || n === 'administración') {
    if (t === 'digitacion' || t === 'digitación') return ['concreto'];
    if (t === 'contabilidad' || t === 'contabilidad general') return ['desembolsos'];
    // Administración de LOCALES (ej. milenav): pide material igual que un ingeniero,
    // así que lleva el mismo módulo que Bodega (solo "Mis solicitudes", ver
    // modulosDeRuta). No recibe material ni entra a proveeduría/aprobación.
    if (t.startsWith('local')) return ['bodega'];
    return undefined; // "Administracion" sin tipo reconocido → no scopea (fallback)
  }
  // El mismo rol si en RH quedó con todo en el NOMBRE ("Administracion Locales")
  // en vez de nombre + tipo.
  if (n.startsWith('administracion') && n.includes('local')) return ['bodega'];
  // Bodega (ej. jersonm): hace lo mismo que un ingeniero —pedir material—, pero solo
  // en esa parte de Órdenes de Compra (ver modulosDeRuta). NO recibe: la recepción
  // del material vive del lado de proveeduría.
  if (n === 'bodega') return ['bodega'];
  // Fábrica de Maderas: caso especial —ellos mismos piden el material Y lo reciben—,
  // así que llevan los dos módulos.
  if (n.startsWith('fabrica') && n.includes('madera')) return ['bodega', 'recepcion'];
  // Legacy / nombres explícitos
  if (n.startsWith('digitacion') || n.startsWith('digitación') || n === 'digitador') return ['concreto'];
  if (n === 'contabilidad') return ['desembolsos'];
  return undefined;
}

/**
 * Módulos permitidos para un usuario según sus roles de Producción (rol + tipo).
 * → `null` significa "sin rol de Producción": el front usa el filtro por nivel
 *   de siempre (fallback seguro, no deja a nadie sin menú).
 */
/** idApp de la app Producción en dbo.Rol. Solo estos roles definen el acceso. */
export const PROD_APP_ID = 10;

export function computeAllowedModules(
  roles: Array<{ idRol: number; nombre?: string; idApp?: number; tipo?: string }>,
): Modulo[] | null {
  const mods = new Set<Modulo>(['dashboard']);
  let known = false;
  // Solo cuentan los roles de Producción (idApp 10). Los de otras apps (ej. un
  // "Administrador" legacy) NO deben dar acceso aquí.
  for (const r of roles) {
    if (r.idApp !== undefined && r.idApp !== PROD_APP_ID) continue;
    const m = modulosDeRol(r.nombre, r.tipo);
    if (m === undefined) continue;
    known = true;
    if (m === '*') return [...MODULOS_TODOS];
    for (const x of m) mods.add(x);
  }
  // Los módulos apagados (ver AVANCE_OBRA_ACTIVO) no se entregan a nadie.
  return known ? [...mods].filter(moduloPublicado) : null;
}

/** Etiqueta de rol para mostrar en el pie del menú: el rol de Producción
 *  (idApp 10) con su tipo — "Ingenieria · Electrico", "Presupuestista · General".
 *  Toma el primer rol de Producción con nombre; si no hay ninguno devuelve
 *  undefined y el front cae a la etiqueta por nivel (no deja a nadie sin rótulo).
 *  El tipo solo existe en producción (dbo.TipoRol); en dev muestra solo el nombre. */
export function rolLabelDeUsuario(
  roles: Array<{ nombre?: string; idApp?: number; tipo?: string }>,
): string | undefined {
  const prod = roles.find(
    (r) => (r.idApp === undefined || r.idApp === PROD_APP_ID) && (r.nombre ?? '').trim(),
  );
  if (!prod) return undefined;
  const nombre = (prod.nombre ?? '').trim();
  const tipo = (prod.tipo ?? '').trim();
  return tipo ? `${nombre} · ${tipo}` : nombre;
}

/** Módulo de Producción al que pertenece una ruta (para gatear páginas). */
export function getRouteModule(pathname: string): Modulo {
  const p = pathname;
  if (p === '/' ) return 'dashboard';
  // Business Central (integración de avance + presupuestos por obra) = dominio Presupuesto.
  if (p.startsWith('/bc') || p.startsWith('/api/bc') || p.startsWith('/api/presupuestos')) return 'presupuesto';
  // Catálogos que viven bajo /avance pero son del dominio de Partidas (Presupuesto).
  // Catálogos de obra (pestañas de /partidas): viven bajo /avance pero son de
  // Presupuesto, así que NO los apaga el interruptor de Avance de obra.
  if (p.startsWith('/avance/tipos-casa') || p.startsWith('/avance/sprints') ||
      p.startsWith('/avance/sub-partidas') || p.startsWith('/avance/pesos')) return 'presupuesto';
  if (p.startsWith('/obras') || p.startsWith('/proyectos') || p.startsWith('/partidas') || p.startsWith('/presupuesto')) return 'presupuesto';
  // Aprobación OC es solo de Super Admin (no de los ingenieros).
  if (p.startsWith('/compras/aprobacion')) return 'admin';
  if (p.startsWith('/avance')) return 'avance';
  if (p.startsWith('/cuadrillas') || p.startsWith('/encargados') || p.startsWith('/compras')) return 'ingenieria';
  if (p.startsWith('/concreto')) return 'concreto';
  if (p.startsWith('/desembolsos')) return 'desembolsos';
  if (p.startsWith('/utilidades') || p.startsWith('/reporte-h4') || p.startsWith('/roles') || p.startsWith('/apps') || p.startsWith('/cuentas') || p.startsWith('/usuarios') || p.startsWith('/auditoria')) return 'admin';
  return 'dashboard';
}

// Subsecciones de Órdenes de Compra que son SOLO de Ingeniería (Bodega no entra):
// las otras etapas del flujo y las herramientas del ingeniero.
const COMPRAS_SOLO_INGENIERIA =
  /^\/(?:api\/)?compras\/proveeduria/;
const COMPRAS_INGENIERIA_INTERNO =
  /^\/compras\/ingenieria\/(?:matriz|clasificaciones|plantillas|inventarios|seguimiento|devoluciones)/;
// Dentro de /compras/facturacion conviven DOS oficios: la RECEPCIÓN del material
// (bodeguero: por recibir, recibidas, el detalle y el registro de la recepción) y
// lo de CONTABILIDAD (Kattya: notas de crédito, cargos sobre factura, todas,
// archivo). El bodeguero entra solo a lo primero.
const COMPRAS_SOLO_CONTABILIDAD =
  /^\/compras\/facturacion\/(?:notas-credito|cargo|todas|archivo)/;

/**
 * Módulos que ABREN una ruta. Casi todas tienen uno solo (`getRouteModule`); las
 * de Órdenes de Compra se comparten:
 *   · /compras/ingenieria y las APIs del módulo → 'ingenieria' + 'bodega'
 *     (crear y ver pedidos; es lo único que hace Bodega)
 *   · proveeduría, facturación y las herramientas del ingeniero → 'ingenieria'
 *   · aprobación → 'admin' (como ya definía getRouteModule)
 * Se usa para gatear en el proxy y para armar el menú.
 */
export function modulosDeRuta(pathname: string): Modulo[] {
  if (pathname.startsWith('/compras') || pathname.startsWith('/api/compras')) {
    if (pathname.startsWith('/compras/aprobacion')) return ['admin'];
    // Las APIs del módulo las comparten los tres roles de Órdenes de Compra: no
    // están partidas por etapa (el scope real lo hace la pantalla). La excepción
    // son las notas de crédito, que son de contabilidad.
    if (pathname.startsWith('/api/compras')) {
      if (pathname.startsWith('/api/compras/notas-credito')) return ['ingenieria'];
      return ['ingenieria', 'bodega', 'recepcion'];
    }
    if (COMPRAS_SOLO_CONTABILIDAD.test(pathname)) return ['ingenieria'];
    // Recepción de material: el bodeguero (y también ingeniería).
    if (pathname.startsWith('/compras/facturacion')) return ['ingenieria', 'recepcion'];
    if (COMPRAS_SOLO_INGENIERIA.test(pathname) || COMPRAS_INGENIERIA_INTERNO.test(pathname)) return ['ingenieria'];
    return ['ingenieria', 'bodega'];
  }
  return [getRouteModule(pathname)];
}

/** ¿Los módulos de un usuario abren esta ruta? `modules` undefined = sin rol de
 *  Producción (quien llama decide el fallback, normalmente el nivel). */
export function rutaPermitida(pathname: string, modules: string[] | undefined): boolean {
  if (!modules) return false;
  return modulosDeRuta(pathname).some((m) => modules.includes(m));
}

export function getInitials(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}
