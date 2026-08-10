import 'server-only';
import { getBCToken } from '@/lib/bc-client';

/**
 * Cliente de Business Central para la entidad OData `Obra_Production_Lines`
 * (GomJob Works Production Line) — la que usa la app AD Obras Control para
 * reportar/registrar el avance de producción por partida.
 *
 *   · leer      → GET líneas de una obra (o varias) con su Quantity/Registered.
 *   · reportar  → PATCH Quantity (0–1) de una partida. Solo INCREMENTA.
 *   · registrar → POST a la acción del web service del partner (bloqueado hasta
 *                 que BC lo publique; hasta entonces devuelve RegistrarNoDisponible).
 *
 * Reutiliza el token OAuth S2S de lib/bc-client (getBCToken). Direccionamiento:
 * si hay BC_COMPANY (nombre de compañía) usa el segmento Company('<nombre>');
 * si no, cae al parámetro ?company=<BC_COMPANY_ID> (GUID) — el mismo env que ya
 * usa el resto de la integración BC de Produccion.
 */

const BC_ROOT =
  process.env.BC_BASE_URL ??
  `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}`;

const ENTITY = process.env.BC_PRODUCTION_ENTITY ?? 'Obra_Production_Lines';
const REGISTRAR_ACTION = process.env.BC_REGISTRAR_ACTION ?? 'ObraRegistrarProd_RegistrarObra';

const COMPANY_NAME = process.env.BC_COMPANY; // nombre → Company('nombre')
const COMPANY_ID = process.env.BC_COMPANY_ID; // GUID → ?company=<id>

/** ¿Hay credenciales + referencia de compañía para hablar con BC? */
export function bcProductionConfigured(): boolean {
  return !!(
    process.env.BC_TENANT_ID &&
    process.env.BC_CLIENT_ID &&
    process.env.BC_CLIENT_SECRET &&
    (process.env.BC_BASE_URL || process.env.BC_ENVIRONMENT) &&
    (COMPANY_NAME || COMPANY_ID)
  );
}

/** ¿El web service de "Registrar" está habilitado (env BC_REGISTRAR_HABILITADO)? */
export function registrarDisponible(): boolean {
  return !!process.env.BC_REGISTRAR_HABILITADO;
}

// Raíz de la entidad, con o sin segmento Company('…').
function entityRoot(): string {
  return COMPANY_NAME
    ? `${BC_ROOT}/ODataV4/Company('${COMPANY_NAME}')/${ENTITY}`
    : `${BC_ROOT}/ODataV4/${ENTITY}`;
}

// Une una query ($filter, $top, …) a la entidad, agregando company= si aplica.
function entityUrl(query: string): string {
  const base = entityRoot();
  const companyQ = COMPANY_NAME ? '' : `company=${COMPANY_ID}`;
  const parts = [query, companyQ].filter(Boolean).join('&');
  return parts ? `${base}?${parts}` : base;
}

// URL de un registro por clave (para PATCH), con company= si aplica.
function keyUrl(obra: string, taskNo: string): string {
  const key = `(Works_No='${obra}',Task_No='${taskNo}')`;
  return COMPANY_NAME
    ? `${BC_ROOT}/ODataV4/Company('${COMPANY_NAME}')/${ENTITY}${key}`
    : `${BC_ROOT}/ODataV4/${ENTITY}${key}?company=${COMPANY_ID}`;
}

// URL de la acción no enlazada de "Registrar".
function actionUrl(): string {
  return COMPANY_NAME
    ? `${BC_ROOT}/ODataV4/Company('${COMPANY_NAME}')/${REGISTRAR_ACTION}`
    : `${BC_ROOT}/ODataV4/${REGISTRAR_ACTION}?company=${COMPANY_ID}`;
}

export interface LineaBC {
  Works_No: string;
  Task_No: string;
  Task_Type: string;
  Description: string;
  Quantity: number;
  Unit_Amount: number;
  Line_Amount: number;
  Registered_Quantity: number;
  Registered_Amount: number;
  Outstanding_Quantity: number;
  Outstanding_Amount: number;
}

/** Lee todas las líneas de producción de una obra. */
export async function leerLineasObra(obra: string): Promise<LineaBC[]> {
  const tok = await getBCToken();
  const url = entityUrl(`$filter=Works_No eq '${obra}'&$top=200`);
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`BC read ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return ((await r.json()) as { value: LineaBC[] }).value;
}

/** Lee las líneas de producción de varias obras (un request por lista, paginado). */
export async function leerLineasObras(obras: string[]): Promise<LineaBC[]> {
  if (obras.length === 0) return [];
  const tok = await getBCToken();
  const filtro = obras.map((o) => `Works_No eq '${o}'`).join(' or ');
  let url: string | null = entityUrl(`$filter=${encodeURIComponent(filtro)}&$top=5000`);
  const acc: LineaBC[] = [];
  while (url) {
    const r: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`BC read ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { value: LineaBC[]; '@odata.nextLink'?: string };
    acc.push(...j.value);
    url = j['@odata.nextLink'] ?? null;
  }
  return acc;
}

/** Reporta (PATCH Quantity 0–1) una partida. */
export async function escribirQuantity(obra: string, taskNo: string, qty: number): Promise<void> {
  const tok = await getBCToken();
  const r = await fetch(keyUrl(obra, taskNo), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      'If-Match': '*',
    },
    body: JSON.stringify({ Quantity: qty }),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`BC PATCH ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

/** Error específico cuando el web service de Registrar todavía no existe. */
export class RegistrarNoDisponible extends Error {}

/** Registra (postea) la obra. Requiere el web service del partner (acción OData). */
export async function registrarObra(obra: string, fecha: string): Promise<string> {
  const tok = await getBCToken();
  const r = await fetch(actionUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ worksNo: obra, fechaRegistro: fecha }),
    cache: 'no-store',
  });
  if (r.status === 404) {
    throw new RegistrarNoDisponible(
      'El web service de Registrar aún no está publicado en BC. Pedilo al partner (ver docs/integracion-bc-registrar.md).',
    );
  }
  const txt = await r.text();
  if (!r.ok) throw new Error(`BC Registrar ${r.status}: ${txt.slice(0, 300)}`);
  return txt;
}
