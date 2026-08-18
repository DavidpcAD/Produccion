import 'server-only';
import { getBCToken } from './bc-client';

// Cliente del API custom de Business Central "adelante/construction/v1.0" — el mismo que
// usa la app de Power Apps para subir presupuestos. Replica el flujo:
//   · workLineBulks  → carga masiva de líneas de presupuesto (versión) vía lineasJSON
//   · workVersions   → registra la versión (REESTUDIO+n)
//   · works          → totales recalculados (venta/costo/indirecto/resultado)
//   · workDecompBulks→ carga masiva del descompuesto (materiales) en payload1..40
const BC_ROOT = process.env.BC_BASE_URL
  ?? `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}`;
const constrDe = (company: string) => `${BC_ROOT}/api/adelante/construction/v1.0/companies(${company})`;
const CONSTR = constrDe(String(process.env.BC_COMPANY_ID));

export function bcConstructionConfigured(): boolean {
  return !!(process.env.BC_TENANT_ID && process.env.BC_CLIENT_ID && process.env.BC_CLIENT_SECRET && process.env.BC_COMPANY_ID);
}

// Compañías de BC donde BUSCAR (solo lectura), en orden: primero la del app
// (BC_COMPANY_ID) y después las que se listen en BC_COMPANY_IDS_LEGACY (ids
// separados por coma). En el environment de Adelante conviven la compañía nueva y
// la anterior, y hay obras cuyo presupuesto quedó únicamente en la anterior: sin
// esto el app las muestra sin presupuesto aunque BC sí lo tenga.
// OJO: todo lo que ESCRIBE (subir versión/descompuesto, área prorrateada) sigue
// yendo solo a BC_COMPANY_ID.
export function bcCompanies(): string[] {
  const principal = String(process.env.BC_COMPANY_ID ?? '').trim();
  const extra = String(process.env.BC_COMPANY_IDS_LEGACY ?? '')
    .split(',').map((c) => c.trim()).filter(Boolean);
  return [principal, ...extra].filter((c, i, a) => c && a.indexOf(c) === i);
}

// Nombre de una compañía (para decir de dónde salió el dato). Se cachea: el
// listado de compañías no cambia entre requests.
let companiasCache: Promise<Map<string, string>> | null = null;
export async function bcCompanyName(companyId: string): Promise<string | null> {
  if (!companiasCache) {
    companiasCache = (async () => {
      const token = await getBCToken();
      const res = await fetch(`${BC_ROOT}/api/v2.0/companies`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      if (!res.ok) throw new Error(`BC companies: ${res.status}`);
      const body = await res.json();
      return new Map<string, string>(((body?.value ?? []) as Array<{ id: string; name?: string; displayName?: string }>)
        .map((c) => [c.id, (c.displayName || c.name || c.id).trim()]));
    })().catch(() => { companiasCache = null; return new Map<string, string>(); });
  }
  return (await companiasCache).get(companyId) ?? null;
}

// Línea de presupuesto (misma forma que colPresupuesto de Power Apps).
export interface BulkLine {
  lineNo?: number;
  lineType: 'Sales' | 'Cost' | 'Indirect' | string; // Venta / Costo / Indirecto
  taskType?: string;   // Capítulo / Partida / ...
  taskNo: string;      // Código (ej. "1.1")
  description: string;
  codeOrder?: string;
  quantity?: number;
  unitAmount?: number;
  lineAmount?: number;
  unitOfMeasure?: string;
  idEncargado?: string | number | null;
  IDVisibles?: string | number | null;
  quantityToProduce?: number;
}

// Línea de descompuesto (materiales).
export interface DecompLine {
  id?: string;
  lineNo?: number;
  taskNo: string;
  taskType?: string;
  description: string;
  no: string;          // código de material (ej. "M10-0023")
  unitCost?: number;
  unitAmount?: number;
  lineAmount?: number;
  codeOrder?: string;
  variantCode?: string;
  performance?: number;
  quantity?: number;
}

async function req(path: string, init: RequestInit, company?: string) {
  const token = await getBCToken();
  const raiz = company ? constrDe(company) : CONSTR;
  const res = await fetch(`${raiz}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.error?.code ?? `${res.status} ${res.statusText}`;
    throw new Error(`BC construction ${path}: ${msg}`);
  }
  return body;
}

// systemId + etag del primer registro de un entity-set (para los singletons "bulk").
async function firstRecord(entity: string): Promise<{ id: string; etag: string }> {
  const token = await getBCToken();
  const res = await fetch(`${CONSTR}/${entity}?$top=1`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const body = await res.json();
  const rec = body?.value?.[0];
  if (!rec) throw new Error(`BC: no hay registro base en ${entity}`);
  return { id: rec.systemId ?? rec.id, etag: rec['@odata.etag'] ?? '*' };
}

// Próxima versión REESTUDIO+n a partir de la base (REESTUDIO3 → REESTUDIO4).
export function nextVersion(verBase?: string | null): string {
  const base = (verBase ?? '').trim();
  if (!base) return 'REESTUDIO1';
  const n = Number(base.replace(/REESTUDIO/i, '')) || 0;
  return `REESTUDIO${n + 1}`;
}

// Próxima versión disponible mirando TODAS las versiones existentes de la obra en BC
// (evita el error "Work Version already exists"). Toma el mayor REESTUDIO n y suma 1.
export async function nextVersionDisponible(worksNo: string): Promise<string> {
  try {
    const body = await req(`workVersions?$filter=${encodeURIComponent(`worksNo eq '${worksNo}'`)}&$top=1000`, { method: 'GET' });
    const codes: string[] = (body?.value ?? []).map((v: { versionCode?: string }) => String(v.versionCode ?? ''));
    let max = 0;
    for (const c of codes) {
      const m = /REESTUDIO\s*(\d+)/i.exec(c);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `REESTUDIO${max + 1}`;
  } catch {
    return 'REESTUDIO1';
  }
}

// Línea de presupuesto leída de BC en vivo (entity workLines del API de construcción).
// Misma estructura que pro_bi.fact_presupuesto: taskType 'Total' = grupo, 'Posting' = partida;
// lineType 'Cost' = costo directo. Sirve de fallback cuando el snapshot ETL no tiene la obra.
export interface WorkLineBC {
  taskNo: string;
  taskType: string;   // 'Total' | 'Posting'
  lineType: string;   // 'Sales' | 'Cost' | 'Indirect Cost'
  description: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  unitOfMeasure: string | null;
  versionCode: string;
}

// Lee TODAS las líneas de presupuesto de una obra desde BC en vivo (todas las versiones/tipos).
// El filtrado (Cost, versión vigente, Total/Posting) lo hace quien la consume.
// Pagina de 5000 en 5000: una obra con varios reestudios pasa fácil de 2000 líneas
// (ej. 7 versiones × 356 líneas) y antes se truncaba silenciosamente.
export async function getWorkLines(worksNo: string, company?: string): Promise<WorkLineBC[]> {
  // Los enums del API vienen con el espacio escapado ("Indirect_x0020_Cost").
  const enumStr = (v: unknown) => String(v ?? '').replace(/_x0020_/g, ' ');
  const PAGINA = 5000;
  const out: WorkLineBC[] = [];
  for (let skip = 0; skip < 40000; skip += PAGINA) {
    const body = await req(
      `workLines?$filter=${encodeURIComponent(`worksNo eq '${worksNo}'`)}&$top=${PAGINA}&$skip=${skip}`,
      { method: 'GET' }, company);
    const page = (body?.value ?? []) as Array<Record<string, unknown>>;
    for (const l of page) {
      out.push({
        taskNo: String(l.taskNo ?? ''),
        taskType: enumStr(l.taskType),
        lineType: enumStr(l.lineType),
        description: String(l.description ?? ''),
        quantity: Number(l.quantity) || 0,
        unitAmount: Number(l.unitAmount) || 0,
        lineAmount: Number(l.lineAmount) || 0,
        unitOfMeasure: (l.unitOfMeasure as string) ?? null,
        versionCode: String(l.versionCode ?? ''),
      });
    }
    if (page.length < PAGINA) break;
  }
  return out;
}

export interface WorkTotals { salesLineAmount?: number; costLineAmount?: number; indirectCostLineAmount?: number; result?: number }

export async function getWork(worksNo: string, company?: string): Promise<(WorkTotals & { no: string; filterVersionCode?: string }) | null> {
  const body = await req(`works?$filter=${encodeURIComponent(`no eq '${worksNo}'`)}&$top=1`, { method: 'GET' }, company);
  return body?.value?.[0] ?? null;
}

// Conjunto de obras (worksNo) que YA tienen al menos una versión de presupuesto en
// BC. Es el signal de "presupuesto cargado": una obra que NO está acá todavía no se
// ha presupuestado. Una sola llamada (todas las versiones) en vez de una por obra.
export async function getObrasConVersion(): Promise<Set<string>> {
  const body = await req(`workVersions?$top=5000`, { method: 'GET' });
  const set = new Set<string>();
  for (const v of (body?.value ?? []) as Array<{ worksNo?: string }>) {
    const no = String(v?.worksNo ?? '').trim();
    if (no) set.add(no);
  }
  return set;
}

// Setea el "Área prorrateada" (m²) en la OBRA (GomJob Works) de BC. Complementa
// setAreaProrrateadaJob (que lo pone en el Job): así el área queda en Obra + Proyecto.
// Busca el work por N° y hace PATCH con If-Match.
export async function setAreaProrrateadaWork(worksNo: string, areaProrrateada: number): Promise<void> {
  const g = await req(`works?$filter=${encodeURIComponent(`no eq '${worksNo}'`)}&$top=1`, { method: 'GET' });
  const w = ((g?.value ?? []) as Array<{ id?: string; '@odata.etag'?: string }>)[0];
  if (!w?.id) throw new Error(`La obra ${worksNo} no existe en BC (works)`);
  await req(`works(${w.id})`, {
    method: 'PATCH',
    headers: { 'If-Match': w['@odata.etag'] ?? '*' },
    body: JSON.stringify({ areaProrrateada }),
  });
}

// Sube la versión de presupuesto (líneas venta/costo/indirecto) vía el singleton bulk,
// y registra la versión. Devuelve la versión creada y los totales recalculados.
export async function subirVersionPresupuesto(worksNo: string, lineas: BulkLine[], _verBase?: string | null): Promise<{ versionCode: string; resultado: string; enviadas: number; totals: WorkTotals | null }> {
  const versionCode = await nextVersionDisponible(worksNo);
  const lineasJSON = JSON.stringify(lineas.map((l, i) => ({
    worksNo, versionCode,
    lineNo: l.lineNo ?? (i + 1),
    lineType: l.lineType,
    taskType: l.taskType ?? '',
    taskNo: l.taskNo,
    description: l.description,
    codeOrder: l.codeOrder ?? '',
    quantity: l.quantity ?? 1,
    unitAmount: l.unitAmount ?? 0,
    lineAmount: l.lineAmount ?? 0,
    unitOfMeasure: l.unitOfMeasure ?? '',
    idEncargado: l.idEncargado ?? null,
    IDVisibles: l.IDVisibles ?? null,
    quantityToProduce: l.quantityToProduce ?? 0,
    reStudy: true,
  })));

  const bulk = await firstRecord('workLineBulks');
  const patchResp = await req(`workLineBulks(${bulk.id})`, {
    method: 'PATCH', headers: { 'If-Match': bulk.etag },
    body: JSON.stringify({ worksNo, lineasJSON, ejecutar: true }),
  });
  const resultado = String((patchResp as { resultado?: unknown })?.resultado ?? '');

  try {
    await req('workVersions', {
      method: 'POST',
      body: JSON.stringify({ worksNo, versionCode, createDateTime: new Date().toISOString(), reStudy: true }),
    });
  } catch (e) {
    // Si la versión ya existía (carrera), no es fatal: las líneas ya se cargaron.
    if (!/already exists/i.test(e instanceof Error ? e.message : '')) throw e;
  }

  const work = await getWork(worksNo);
  return { versionCode, resultado, enviadas: lineas.length, totals: work ? { salesLineAmount: work.salesLineAmount, costLineAmount: work.costLineAmount, indirectCostLineAmount: work.indirectCostLineAmount, result: work.result } : null };
}

// Sube el descompuesto (materiales) como {n,e,d} en payload1..40 (chunks de 2048).
export async function subirDescompuesto(worksNo: string, nuevos: DecompLine[], editados: DecompLine[] = [], eliminados: { id: string }[] = []): Promise<{ chunks: number; resultado: string; enviadas: number }> {
  const payload = JSON.stringify({ n: nuevos.map(n => ({ ...n, worksNo })), e: editados, d: eliminados });
  const CHUNK = 2048;
  const MAX = 40;
  const fields: Record<string, unknown> = { ejecutar: true };
  const chunks = Math.ceil(payload.length / CHUNK);
  if (chunks > MAX) throw new Error(`Descompuesto muy grande (${payload.length} chars > ${MAX * CHUNK}). Subir por lotes.`);
  for (let i = 0; i < MAX; i++) fields[`payload${i + 1}`] = payload.slice(i * CHUNK, (i + 1) * CHUNK);

  // workDecompBulks es una página de tabla TEMPORAL (no un singleton persistente
  // como workLineBulks): no hay registro base que PATCHear. Se INSERTA (POST) el
  // payload y el trigger OnInsert lo procesa cuando ejecutar=true. (Antes hacía
  // firstRecord+PATCH → siempre fallaba con "no hay registro base en workDecompBulks".)
  const postResp = await req('workDecompBulks', {
    method: 'POST',
    body: JSON.stringify(fields),
  });
  return { chunks, enviadas: nuevos.length, resultado: String((postResp as { resultado?: unknown })?.resultado ?? '') };
}
