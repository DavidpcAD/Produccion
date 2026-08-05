import type { JWTPayload } from './auth';

// ─────────────────────────────────────────────────────────────────────────
// Modelo nuevo (AdelanteSBX): la tabla dbo.Rol NO tiene NivelAdmin, pero el
// control de acceso de la app se basa en niveles (1=empleado, 2=admin,
// 4=superadmin). Aquí se centraliza la correspondencia Rol→nivel.
// Para ajustar permisos, edita SOLO este mapa.
//   1 Administrador        -> 4 (superadmin: gestiona roles y apps)
//   2 Maestro de Obras     -> 1
//   3 Ingeniero Residente  -> 2 (admin: proyectos/cuadrillas/usuarios/auditoría)
//   4 Jefe de Cuadrillas   -> 2
//   5 Proveeduría          -> 1
//   6 Facturador Bodega    -> 1
// ─────────────────────────────────────────────────────────────────────────
export const ROLE_LEVEL_BY_ID: Record<number, number> = {
  1: 4,
  2: 1,
  3: 2,
  4: 2,
  5: 1,
  6: 1,
};

// Fallback por nombre (por si los IDs cambian en otra instancia). Se compara en
// minúsculas y sin espacios extra. Aquí se define qué rol da qué nivel.
const ROLE_LEVEL_BY_NAME: Record<string, number> = {
  'superadministrador': 4,
  'super administrador': 4,
  'superadmin': 4,
  'super admin': 4,
  'administrador': 4,
  // Roles de Producción: el nivel debe alcanzar las acciones de SUS módulos
  // (Partidas, Concreto y Órdenes de Compra exigen N4; Desembolsos N1). El
  // acceso a OTROS módulos lo bloquea el filtro por módulo (sidebar + layout).
  'presupuestista': 4,
  'ingeniero obra gris': 4,
  'ingeniero acabados': 4,
  'ingeniero electromecanico': 4,
  'ingeniero electromecánico': 4,
  'digitacion general': 4,
  'digitación general': 4,
  'digitacion maderas': 4,
  'digitación maderas': 4,
  'digitador': 4,
  'contabilidad': 1,
  // Roles legacy (otras apps) que aún aparecen:
  'ingeniero residente': 2,
  'jefe de cuadrillas': 2,
  'maestro de obras': 1,
  'proveeduría': 1,
  'proveeduria': 1,
  'facturador bodega': 1,
};

/** Calcula el nivelAdmin efectivo a partir de los roles del usuario. */
export function computeNivelAdmin(
  roles: Array<{ idRol: number; nombre?: string }>,
): number {
  let max = 0;
  for (const r of roles) {
    const byName = r.nombre ? ROLE_LEVEL_BY_NAME[r.nombre.trim().toLowerCase()] : undefined;
    const byId = ROLE_LEVEL_BY_ID[r.idRol];
    // El NOMBRE manda: con el nuevo set de roles los IDs 1–6 ya no coinciden con
    // el mapa viejo, así que el nombre del rol es la fuente confiable del nivel.
    const lvl = byName ?? byId ?? 1; // todo rol asignado da acceso básico (1)
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
  | 'dashboard' | 'presupuesto' | 'ingenieria' | 'concreto' | 'desembolsos' | 'admin';

export const MODULOS_TODOS: Modulo[] =
  ['dashboard', 'presupuesto', 'ingenieria', 'concreto', 'desembolsos', 'admin'];

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
  if (n === 'ingenieria' || n === 'ingeniería' || n === 'ingeniero' || n.startsWith('ingeniero ')) return ['ingenieria'];
  if (n === 'administracion' || n === 'administración') {
    if (t === 'digitacion' || t === 'digitación') return ['concreto'];
    if (t === 'contabilidad' || t === 'contabilidad general') return ['desembolsos'];
    return undefined; // "Administracion" sin tipo reconocido → no scopea (fallback)
  }
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
export function computeAllowedModules(
  roles: Array<{ idRol: number; nombre?: string; tipo?: string }>,
): Modulo[] | null {
  const mods = new Set<Modulo>(['dashboard']);
  let known = false;
  for (const r of roles) {
    const m = modulosDeRol(r.nombre, r.tipo);
    if (m === undefined) continue;
    known = true;
    if (m === '*') return [...MODULOS_TODOS];
    for (const x of m) mods.add(x);
  }
  return known ? [...mods] : null;
}

/** Módulo de Producción al que pertenece una ruta (para gatear páginas). */
export function getRouteModule(pathname: string): Modulo {
  const p = pathname;
  if (p === '/' ) return 'dashboard';
  // Catálogos que viven bajo /avance pero son del dominio de Partidas (Presupuesto).
  if (p.startsWith('/avance/tipos-casa') || p.startsWith('/avance/sprints') || p.startsWith('/avance/sub-partidas')) return 'presupuesto';
  if (p.startsWith('/obras') || p.startsWith('/proyectos') || p.startsWith('/partidas') || p.startsWith('/presupuesto')) return 'presupuesto';
  if (p.startsWith('/avance') || p.startsWith('/cuadrillas') || p.startsWith('/encargados') || p.startsWith('/compras')) return 'ingenieria';
  if (p.startsWith('/concreto')) return 'concreto';
  if (p.startsWith('/desembolsos')) return 'desembolsos';
  if (p.startsWith('/utilidades') || p.startsWith('/reporte-h4') || p.startsWith('/roles') || p.startsWith('/apps') || p.startsWith('/cuentas') || p.startsWith('/usuarios') || p.startsWith('/auditoria')) return 'admin';
  return 'dashboard';
}

export function getInitials(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}
