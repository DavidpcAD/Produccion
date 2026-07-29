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
const CONSTR = `${BC_ROOT}/api/adelante/construction/v1.0/companies(${process.env.BC_COMPANY_ID})`;

export function bcConstructionConfigured(): boolean {
  return !!(process.env.BC_TENANT_ID && process.env.BC_CLIENT_ID && process.env.BC_CLIENT_SECRET && process.env.BC_COMPANY_ID);
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

async function req(path: string, init: RequestInit) {
  const token = await getBCToken();
  const res = await fetch(`${CONSTR}/${path}`, {
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

export interface WorkTotals { salesLineAmount?: number; costLineAmount?: number; indirectCostLineAmount?: number; result?: number }

export async function getWork(worksNo: string): Promise<(WorkTotals & { no: string; filterVersionCode?: string }) | null> {
  const body = await req(`works?$filter=${encodeURIComponent(`no eq '${worksNo}'`)}&$top=1`, { method: 'GET' });
  return body?.value?.[0] ?? null;
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
