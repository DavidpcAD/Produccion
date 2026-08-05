let bcToken: { access_token: string; expires_at: number } | null = null;

export async function getBCToken(): Promise<string> {
  if (bcToken && Date.now() < bcToken.expires_at - 60000) {
    return bcToken.access_token;
  }

  const url = `https://login.microsoftonline.com/${process.env.BC_TENANT_ID}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.BC_CLIENT_ID!,
      client_secret: process.env.BC_CLIENT_SECRET!,
      scope: 'https://api.businesscentral.dynamics.com/.default',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`BC auth failed: ${data.error_description ?? data.error ?? res.status}`);
  }

  bcToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  return bcToken.access_token;
}

// Raíz del entorno BC. Acepta BC_BASE_URL (ej. .../v2.0/{tenant}/Sandbox) o la
// construye desde BC_TENANT_ID + BC_ENVIRONMENT. Así funciona con cualquiera de
// las dos convenciones de env que hay en los App Services de Adelante.
const BC_ROOT = process.env.BC_BASE_URL
  ?? `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}`;

const BASE = `${BC_ROOT}/api/adelante/project/v1.0/companies(${process.env.BC_COMPANY_ID})`;

export async function getJobs() {
  const token = await getBCToken();
  const res = await fetch(`${BASE}/jobs`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return res.json();
}

export interface PostventaObra { no: string; description: string }

/** Obras Postventa (PV-…) desde BC — alimenta el selector al bloquear una obra. */
export async function getPostventaObras(): Promise<PostventaObra[]> {
  const token = await getBCToken();
  const res = await fetch(`${BASE}/postventaObras`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? `BC ${res.status}`);
  }
  const rows = (data as { value?: Array<{ no?: string; description?: string }> }).value ?? [];
  return rows.map(r => ({ no: r.no ?? '', description: r.description ?? '' })).filter(r => r.no);
}

export async function getJobTasks(jobNo: string) {
  const token = await getBCToken();
  const filter = encodeURIComponent(`jobNo eq '${jobNo}' and jobTaskType eq 'Posting'`);
  const res = await fetch(`${BASE}/jobTasks?$filter=${filter}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return res.json();
}

// ─── Escritura hacia BC (crear obra/proyecto) ───────────────────────────────
// Acciones OData V4 de codeunit del web service `AdelanteObra` (extensión AL en
// el repo OrdenesCompra). Mismo token/scope/env que getJobs; solo cambia la base
// (/ODataV4/ en vez de /api/...). Flujo real GomJob:
//   CreateWork (obra + dimensiones AC/CC) → CreateProject (Job desde la obra).

/** Devuelve true si las credenciales de BC están configuradas en el entorno. */
export function bcConfigured(): boolean {
  return Boolean(
    process.env.BC_TENANT_ID && // siempre necesario para el token OAuth
      process.env.BC_CLIENT_ID &&
      process.env.BC_CLIENT_SECRET &&
      process.env.BC_COMPANY_ID &&
      (process.env.BC_BASE_URL || process.env.BC_ENVIRONMENT),
  );
}

const ODATA_BASE = `${BC_ROOT}/ODataV4`;

/** POST a una acción OData V4 de codeunit; devuelve el JSON de respuesta. */
async function odataAction(action: string, body: unknown): Promise<Record<string, unknown>> {
  const token = await getBCToken();
  const url = `${ODATA_BASE}/${action}?company=${process.env.BC_COMPANY_ID}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? `BC ${res.status}`);
  }
  return data;
}

export interface DimensionValue {
  code: string;
  name: string;
}

/**
 * Valores permitidos de una dimensión (code='AC' → área de costeo,
 * code='CC' → centro de costo) para poblar los combobox del wizard.
 * La acción devuelve `value` como string JSON: hay que parsearlo.
 */
export async function getDimensionValues(dimensionCode: string): Promise<DimensionValue[]> {
  const data = await odataAction('AdelanteObra_GetDimensionValues', { dimensionCode });
  const raw = data.value;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ code?: string; name?: string }>;
    return parsed.map((r) => ({ code: r.code ?? '', name: r.name ?? '' }));
  } catch {
    return [];
  }
}

/**
 * Grupos de registro de inventario (MATERIALES, SUMINISTROS, MAQUINARIA…) para
 * el multi-select del wizard. La acción devuelve `value` como string JSON.
 */
export async function getInventoryPostingGroups(): Promise<DimensionValue[]> {
  const data = await odataAction('AdelanteObra_GetInventoryPostingGroups', {});
  const raw = data.value;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ code?: string; name?: string }>;
    return parsed.map((r) => ({ code: r.code ?? '', name: r.name ?? '' }));
  } catch {
    return [];
  }
}

export interface CreateWorkInput {
  obraNo: string;
  description: string;
  description2?: string;
  areaCosteo?: string;
  centroCosto?: string;
  /** Grupos de registro de inventario separados por coma (ej. "MATERIALES,SUMINISTROS").
   *  El AL crea la Config. registro inventario del almacén contra la cuenta fija. */
  tiposInventario?: string;
}

/**
 * Crea la Obra en BC con sus dimensiones por defecto (AC/CC).
 * Idempotente: si la obra ya existe en BC, no lanza (se continúa a CreateProject).
 */
// El AL devuelve de forma intermitente un error de concurrencia optimista
// ("...not up-to-date...") al guardar el registro Work. Reintentamos solo esa
// condición unas pocas veces (mitigación mientras se corrige el AL de raíz).
function isConcurrencyError(msg: string): boolean {
  return /not up-to-date|no est[áa] actualizada|cannot be saved because/i.test(msg);
}

async function withConcurrencyRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isConcurrencyError(msg)) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function createWork(input: CreateWorkInput): Promise<void> {
  await withConcurrencyRetry(async () => {
    try {
      await odataAction('AdelanteObra_CreateWork', {
        obraNo: input.obraNo,
        description: input.description,
        description2: input.description2 ?? '',
        areaCosteo: input.areaCosteo ?? '',
        centroCosto: input.centroCosto ?? '',
        tiposInventario: input.tiposInventario ?? '',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/ya existe/i.test(msg)) return; // la obra ya está en BC: seguimos al proyecto
      throw err;
    }
  });
}

/** Crea el proyecto (Job) en BC a partir de la obra. Llamar una sola vez por obra. */
export async function createProject(obraNo: string): Promise<void> {
  await withConcurrencyRetry(() => odataAction('AdelanteObra_CreateProject', { obraNo }));
}

/**
 * Bloquea/desbloquea la obra en BC (web service AdelanteObra). Pasos:
 *   1) Obra (GomJob Works) → Bloqueado
 *   2) Proyecto (Job) → Bloqueado = Todo (All) / ninguno
 *   3) Valor de dimensión CC (Code = N° obra) → Bloqueado
 *   4) Postventa: al bloquear, alta de la actividad "Auxiliar" en la obra PV
 *      indicada por `postventaNo` (la elige el usuario); al desbloquear, la marca
 *      como revertida.
 * `blocked=false` revierte. `postventaNo` es el N° de la obra Postventa (PV-…).
 */
export async function setObraBlocked(obraNo: string, blocked: boolean, postventaNo = ''): Promise<void> {
  await withConcurrencyRetry(() => odataAction('AdelanteObra_SetObraBlocked', { obraNo, blocked, postventaNo }));
}

/**
 * Actualiza las TAREAS DEL PROYECTO (Job) desde la Obra — el botón "Actualizar
 * tareas proyecto" de la GomJob Works Card (dirección Obra→Job). Se llama DESPUÉS
 * de subir el presupuesto (workLineBulks/workVersions); sin esto las tareas del Job
 * quedan en 0 (venta/coste/indirecto). Idempotente (upsert de tareas).
 * Ojo: NO confundir con syncTasksToWorks del API construction, que va al revés.
 */
export async function actualizarTareasProyecto(obraNo: string): Promise<void> {
  await withConcurrencyRetry(() => odataAction('AdelanteObra_UpdateProjectTasks', { obraNo }));
}

/**
 * Setea el "Área prorrateada" (m²) en el Proyecto (Job) de BC. El campo vive en el
 * Job (extensión, field 50300), expuesto en la API `jobs` — no en GomJob Works. Se
 * busca el Job por N° y se hace PATCH. Lanza si el Job aún no existe en BC.
 */
export async function setAreaProrrateadaJob(obraNo: string, areaProrrateada: number): Promise<void> {
  const token = await getBCToken();
  const g = await fetch(`${BASE}/jobs?$filter=${encodeURIComponent(`no eq '${obraNo}'`)}&$top=1`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  const gd = (await g.json().catch(() => ({}))) as { value?: Array<{ id?: string; '@odata.etag'?: string }> };
  const job = gd.value?.[0];
  if (!job?.id) throw new Error(`El proyecto (Job) de la obra ${obraNo} no existe en BC`);
  const p = await fetch(`${BASE}/jobs(${job.id})`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'If-Match': job['@odata.etag'] ?? '*',
    },
    cache: 'no-store',
    body: JSON.stringify({ areaProrrateada }),
  });
  if (!p.ok) {
    const d = (await p.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(d.error?.message ?? `BC ${p.status}`);
  }
}
