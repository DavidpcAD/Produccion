import { ROLES_APP, type RolApp, type UsuarioConRoles } from './tipos-deps';

/**
 * Gestión de roles de usuarios en la App Registration del API (Entra ID).
 *
 * Portado de `graph-client.ts` + `gestion-roles.ts` de la app original. Los
 * roles son App Roles (Admin / Operador / Laboratorio / Ingenieria). Asignar un
 * rol = crear un `appRoleAssignment` en el Service Principal del Enterprise App.
 *
 * DEPENDENCIA EXTERNA NO INSTALADA: @azure/identity no está en package.json. Se
 * importa de forma dinámica para obtener el token de Microsoft Graph
 * (DefaultAzureCredential). Si no está instalada, las operaciones lanzan
 * ErrorGraphDeps(501) y las rutas responden 501. No usamos
 * @microsoft/microsoft-graph-client: pegamos a Graph con fetch (solo 4
 * endpoints).
 *
 * Env vars:
 *   Camino rápido (evita permiso Application.Read.All):
 *     AZURE_API_SP_ID       — object id del Service Principal del API.
 *     ROLE_ID_ADMIN         — GUID del App Role Admin.
 *     ROLE_ID_OPERADOR      — GUID del App Role Operador.
 *     ROLE_ID_LABORATORIO   — GUID del App Role Laboratorio.
 *     ROLE_ID_INGENIERIA    — GUID del App Role Ingenieria (opcional).
 *   Fallback (resuelve vía Graph, requiere Application.Read.All en la MI):
 *     AZURE_API_CLIENT_ID   — client_id (appId) de la App Registration del API.
 *   Auth de la MI (DefaultAzureCredential): AZURE_TENANT_ID / AZURE_CLIENT_ID /
 *   AZURE_CLIENT_SECRET, o Managed Identity en Azure. Permisos Graph de la MI:
 *   User.Read.All + AppRoleAssignment.ReadWrite.All.
 */

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class ErrorGraphDeps extends Error {
  status: number;
  codigo: string;
  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorGraphDeps';
    this.status = status;
    this.codigo = codigo;
  }
}

export class ErrorGraph extends Error {
  readonly status: number;
  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.name = 'ErrorGraph';
    this.status = status;
  }
}

// ─── Token de Graph (import dinámico de @azure/identity) ──────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _credential: any = null;
async function obtenerTokenGraph(): Promise<string> {
  if (!_credential) {
    // Specifier en variable: TS/el bundler no lo resuelven estáticamente (el
    // paquete puede no estar instalado). Si falta en runtime, el import falla → 501.
    const pkgIdentity = '@azure/identity';
    const identity = await import(pkgIdentity).catch(() => null);
    if (!identity) {
      throw new ErrorGraphDeps(
        501,
        'GRAPH_NO_CONFIG',
        'Gestión de usuarios no configurada: falta el SDK @azure/identity y las envs de Graph.',
      );
    }
    _credential = new identity.DefaultAzureCredential();
  }
  const t = await _credential.getToken(GRAPH_SCOPE);
  if (!t) throw new ErrorGraph('No se pudo obtener token de Microsoft Graph para la MI.', 500);
  return t.token;
}

interface GraphRequestOptions {
  metodo?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  body?: unknown;
  esperaJson?: boolean;
  consistencyLevelEventual?: boolean;
}

async function graphFetch<T = unknown>(
  path: string,
  options: GraphRequestOptions = {},
): Promise<T | null> {
  const { metodo = 'GET', body, esperaJson = true, consistencyLevelEventual } = options;
  const token = await obtenerTokenGraph();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (consistencyLevelEventual) headers.ConsistencyLevel = 'eventual';

  const r = await fetch(`${GRAPH_BASE}${path}`, {
    method: metodo,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!r.ok) {
    let detalle = '';
    try {
      detalle = JSON.stringify(await r.json());
    } catch {
      detalle = await r.text().catch(() => '');
    }
    throw new ErrorGraph(`Graph ${metodo} ${path} → ${r.status}: ${detalle}`, r.status);
  }

  if (!esperaJson || r.status === 204) return null;
  return (await r.json()) as T;
}

// ─── Cache de SP id y de roles → GUID ─────────────────────────────────────────

interface CacheSp {
  spId: string;
  rolesByValue: Map<string, string>;
}
let cacheSp: CacheSp | null = null;

async function resolverSpYRoles(): Promise<CacheSp> {
  if (cacheSp) return cacheSp;

  // Camino RÁPIDO: usar los IDs de env (evita el round-trip a Graph que
  // requiere Application.Read.All).
  const spIdEnv = process.env.AZURE_API_SP_ID;
  const rolAdminEnv = process.env.ROLE_ID_ADMIN;
  const rolOperadorEnv = process.env.ROLE_ID_OPERADOR;
  const rolLaboratorioEnv = process.env.ROLE_ID_LABORATORIO;

  if (spIdEnv && rolAdminEnv && rolOperadorEnv && rolLaboratorioEnv) {
    const rolesByValue = new Map<string, string>([
      ['Admin', rolAdminEnv],
      ['Operador', rolOperadorEnv],
      ['Laboratorio', rolLaboratorioEnv],
    ]);
    const rolIngenieriaEnv = process.env.ROLE_ID_INGENIERIA;
    if (rolIngenieriaEnv) rolesByValue.set('Ingenieria', rolIngenieriaEnv);
    cacheSp = { spId: spIdEnv, rolesByValue };
    return cacheSp;
  }

  // Fallback: resolver vía Graph (requiere Application.Read.All en la MI).
  const appId = process.env.AZURE_API_CLIENT_ID;
  if (!appId) {
    throw new ErrorGraphDeps(
      501,
      'GRAPH_NO_CONFIG',
      'Gestión de usuarios no configurada: faltan AZURE_API_SP_ID + ROLE_ID_* (o AZURE_API_CLIENT_ID).',
    );
  }

  const filtro = encodeURIComponent(`appId eq '${appId}'`);
  const sps = await graphFetch<{
    value: Array<{ id: string; appRoles: Array<{ id: string; value: string }> }>;
  }>(`/servicePrincipals?$filter=${filtro}&$select=id,appRoles`);
  const sp = sps?.value?.[0];
  if (!sp) throw new ErrorGraph(`No se encontró Service Principal para appId ${appId}.`, 404);

  const rolesByValue = new Map<string, string>();
  for (const r of sp.appRoles ?? []) rolesByValue.set(r.value, r.id);
  for (const esperado of ROLES_APP) {
    if (esperado !== 'Ingenieria' && !rolesByValue.has(esperado)) {
      throw new ErrorGraph(`App Role "${esperado}" no existe en el Service Principal.`, 500);
    }
  }

  cacheSp = { spId: sp.id, rolesByValue };
  return cacheSp;
}

// ─── Operaciones del dominio ──────────────────────────────────────────────────

/** Lista los usuarios que tienen AL MENOS un rol asignado en la app. */
export async function listarUsuariosAsignados(): Promise<UsuarioConRoles[]> {
  const { spId, rolesByValue } = await resolverSpYRoles();
  const rolesById = new Map<string, RolApp>();
  for (const [value, id] of rolesByValue) rolesById.set(id, value as RolApp);

  let r: {
    value: Array<{
      id: string;
      principalId: string;
      principalDisplayName: string;
      principalType: string;
      appRoleId: string;
    }>;
  } | null = null;
  try {
    r = await graphFetch(`/servicePrincipals/${spId}/appRoleAssignedTo?$top=999`);
  } catch (e) {
    // Permiso Application.Read.All aún propagándose → lista vacía (no 500).
    if (e instanceof ErrorGraph && e.status === 403) return [];
    throw e;
  }

  const assignments = (r?.value ?? []).filter(
    (a) =>
      a.principalType === 'User' &&
      a.appRoleId !== '00000000-0000-0000-0000-000000000000' &&
      rolesById.has(a.appRoleId),
  );

  const porUsuario = new Map<
    string,
    { nombre: string; roles: Array<{ rol: RolApp; assignmentId: string }> }
  >();
  for (const a of assignments) {
    const rol = rolesById.get(a.appRoleId);
    if (!rol) continue;
    const entry = porUsuario.get(a.principalId) ?? { nombre: a.principalDisplayName, roles: [] };
    entry.roles.push({ rol, assignmentId: a.id });
    porUsuario.set(a.principalId, entry);
  }

  const usuarios: UsuarioConRoles[] = [];
  for (const [oid, datos] of porUsuario) {
    let email = '';
    try {
      const u = await graphFetch<{ mail: string | null; userPrincipalName: string | null }>(
        `/users/${oid}?$select=mail,userPrincipalName`,
      );
      email = u?.mail ?? u?.userPrincipalName ?? '';
    } catch {
      /* user pudo haber sido borrado */
    }
    usuarios.push({ oid, nombre: datos.nombre, email, roles: datos.roles });
  }

  usuarios.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return usuarios;
}

/** Busca usuarios del tenant por displayName / mail / userPrincipalName. */
export async function buscarUsuarios(q: string, limite: number): Promise<UsuarioConRoles[]> {
  const { spId, rolesByValue } = await resolverSpYRoles();
  const rolesById = new Map<string, RolApp>();
  for (const [value, id] of rolesByValue) rolesById.set(id, value as RolApp);

  const qSafe = q.replace(/'/g, "''");
  const filtro = encodeURIComponent(
    `startswith(displayName,'${qSafe}') or startswith(mail,'${qSafe}') or startswith(userPrincipalName,'${qSafe}')`,
  );
  const r = await graphFetch<{
    value: Array<{
      id: string;
      displayName: string;
      mail: string | null;
      userPrincipalName: string | null;
    }>;
  }>(
    `/users?$filter=${filtro}&$count=true&$top=${limite}&$select=id,displayName,mail,userPrincipalName`,
    { consistencyLevelEventual: true },
  );

  const users = r?.value ?? [];
  if (users.length === 0) return [];

  const usuarios: UsuarioConRoles[] = [];
  for (const u of users) {
    let roles: Array<{ rol: RolApp; assignmentId: string }> = [];
    try {
      const ar = await graphFetch<{
        value: Array<{ id: string; appRoleId: string; resourceId: string }>;
      }>(`/users/${u.id}/appRoleAssignments?$select=id,appRoleId,resourceId`);
      roles = (ar?.value ?? [])
        .filter((a) => a.resourceId === spId && rolesById.has(a.appRoleId))
        .map((a) => ({ rol: rolesById.get(a.appRoleId) as RolApp, assignmentId: a.id }));
    } catch {
      /* devolvemos al user sin roles */
    }
    usuarios.push({
      oid: u.id,
      nombre: u.displayName,
      email: u.mail ?? u.userPrincipalName ?? '',
      roles,
    });
  }
  return usuarios;
}

/** Asigna un rol a un usuario. Idempotente: si ya lo tiene, devuelve el existente. */
export async function asignarRol(
  userId: string,
  rol: RolApp,
): Promise<{ assignmentId: string; yaExistia: boolean }> {
  const { spId, rolesByValue } = await resolverSpYRoles();
  const appRoleId = rolesByValue.get(rol);
  if (!appRoleId) {
    throw new ErrorGraphDeps(
      400,
      'ROL_DESCONOCIDO',
      `Rol "${rol}" no configurado (falta su ROLE_ID_* en el entorno).`,
    );
  }

  try {
    const r = await graphFetch<{ id: string }>(`/users/${userId}/appRoleAssignments`, {
      metodo: 'POST',
      body: { principalId: userId, resourceId: spId, appRoleId },
    });
    if (!r) throw new ErrorGraph('Graph no devolvió el assignment creado.', 500);
    return { assignmentId: r.id, yaExistia: false };
  } catch (e) {
    if (
      e instanceof ErrorGraph &&
      (e.status === 400 || e.status === 409) &&
      e.message.includes('Permission being assigned already exists')
    ) {
      const ar = await graphFetch<{
        value: Array<{ id: string; appRoleId: string; resourceId: string }>;
      }>(`/users/${userId}/appRoleAssignments?$select=id,appRoleId,resourceId`);
      const existente = (ar?.value ?? []).find(
        (a) => a.resourceId === spId && a.appRoleId === appRoleId,
      );
      if (existente) return { assignmentId: existente.id, yaExistia: true };
    }
    throw e;
  }
}

/** Quita un rol específico de un usuario (assignmentId viene del listado). */
export async function quitarRol(userId: string, assignmentId: string): Promise<void> {
  await graphFetch(`/users/${userId}/appRoleAssignments/${assignmentId}`, {
    metodo: 'DELETE',
    esperaJson: false,
  });
}
