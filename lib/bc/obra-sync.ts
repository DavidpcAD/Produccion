import 'server-only';
import { fetchConReloj } from '../bc-timeout';
import { odataStr } from '../odata';
import { getBCToken } from '../bc-client';

// ─── Editar una obra que existe en Business Central ─────────────────────────
// Lo que se cambia de una obra de BC en el editor (ObraEditModal) tiene que
// quedar igual en BC; si BC no lo acepta, no se guarda en ningún lado y se dice
// por qué. Antes solo viajaba el área prorrateada y el resto (nombre,
// descripción…) quedaba únicamente en el sistema.
//
//   Editor                   BC
//   ─────────────────────    ───────────────────────────────────────────────
//   Nombre mostrado          Obra.Description (BC la copia al proyecto y al CC)
//                            + nombre del almacén de la obra
//   Descripción              Obra y proyecto: "Description 2" (AdelanteAPI ≥ 1.2.27.0)
//   Estado                   Proyecto.Status (Planning/Quote/Open/Completed)
//   Fecha inicio / fin       Proyecto: Starting Date / Ending Date
//   Gerente de proyecto      Proyecto: Person Responsible (código de Recurso)
//   Encargado                Proyecto: ID Encargado (el AL lo copia a obra y tareas)
//   Área prorrateada         Obra y proyecto: Area Prorrateada
//
// AC/CC no van: BC es el dueño (ver ObraEditModal). Tipo de obra, proyecto,
// ubicación, almacén físico, precios de maquinaria y las marcas BC/Procore no
// existen en BC.
//
// Probado contra Sandbox con la obra ZZC-02 (2026-11-03):
//   · La Description de la OBRA, BC la copia sola al proyecto y al valor de
//     dimensión CC. La del proyecto vuelve a la obra pero NO al CC: por eso se
//     escribe en la obra. El almacén no la recibe nunca.
//   · BC valida las fechas en el orden de la página (primero inicio, después
//     fin): pasar las dos hacia adelante, con el inicio nuevo después del fin
//     viejo, lo rechaza aunque el resultado sea válido. Ver actualizarObraEnBC.
//   · Lo que BC no permite vuelve como 400 con el motivo («Starting Date must be
//     equal to or earlier than Ending Date», «Person Responsible … cannot be found
//     in the related table (Resource)»). Ese texto es la respuesta para el usuario.

const BC_ROOT = process.env.BC_BASE_URL
  ?? `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}`;
const COMPANY = String(process.env.BC_COMPANY_ID);
const WORKS = `${BC_ROOT}/api/adelante/construction/v1.0/companies(${COMPANY})/works`;
const JOBS = `${BC_ROOT}/api/adelante/project/v1.0/companies(${COMPANY})/jobs`;
/** Página publicada como web service (OData V4), por clave. */
const pagina = (nombre: string, clave: string) => `${BC_ROOT}/ODataV4/${nombre}(${clave})?company=${COMPANY}`;
const lit = (v: string) => `'${encodeURIComponent(odataStr(v))}'`;

/** Estados del proyecto en BC. El bloqueo NO es un estado: va por /api/obras/[id]/bloqueo. */
export const ESTADOS_BC = ['Planning', 'Quote', 'Open', 'Completed'] as const;
/** Largo máximo en BC (Description es Text[100], Description 2 es Text[50]). */
export const LARGO_BC = { nombre: 100, descripcion: 50 } as const;
const LARGO_NOMBRE_CC = 50; // Dimension Value.Name
const SIN_FECHA = '0001-01-01'; // "sin fecha" de BC

/** Solo los campos que el usuario cambió (undefined = no se toca en BC). */
export interface CambiosObraBC {
  nombre?: string;
  descripcion?: string;
  estado?: (typeof ESTADOS_BC)[number];
  fechaInicio?: string; // YYYY-MM-DD, '' = sin fecha
  fechaFin?: string;
  gerente?: string;
  encargado?: string;
  areaProrrateada?: number;
}

export interface ResultadoSyncObra {
  /** Qué se escribió en BC, en palabras del editor (para el aviso de la pantalla). */
  enviados: string[];
  /** Lo que no llegó a BC sin ser un rechazo (ej. la extensión todavía no publica el campo). */
  avisos: string[];
}

const txt = (v: unknown) => String(v ?? '').trim();
const ymd = (v: unknown): string => {
  if (!v) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  const d = s.slice(0, 10);
  return d < '1753-01-01' ? '' : d; // 0001-01-01 = sin fecha
};
const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Compara lo que manda el editor contra la fila actual de dbo.Obra y devuelve
 * solo lo que cambió en campos que viven en BC. Se compara contra la fila y no
 * contra BC a propósito: así un dato viejo que BC no acepta (un gerente escrito
 * a mano, por ejemplo) no traba la edición de otro campo.
 *
 * Las reglas que BC aplicaría de todos modos (largos, inicio ≤ fin, estados
 * válidos) se chequean acá para cortar antes de tocar BC y decirlo en español.
 */
export function cambiosParaBC(
  actual: Record<string, unknown>,
  body: Record<string, unknown>,
): { cambios: CambiosObraBC; error?: string } {
  const c: CambiosObraBC = {};

  const nombre = txt(body.nombreMostrado);
  if (nombre !== txt(actual.nombreMostrado)) {
    if (!nombre) return { cambios: c, error: 'El nombre no puede quedar vacío: en Business Central es la descripción de la obra.' };
    if (nombre.length > LARGO_BC.nombre) return { cambios: c, error: `El nombre tiene ${nombre.length} caracteres y Business Central acepta hasta ${LARGO_BC.nombre}.` };
    c.nombre = nombre;
  }

  const descripcion = txt(body.descripcion);
  if (descripcion !== txt(actual.descripcion)) {
    if (descripcion.length > LARGO_BC.descripcion) return { cambios: c, error: `La descripción tiene ${descripcion.length} caracteres y Business Central acepta hasta ${LARGO_BC.descripcion}.` };
    c.descripcion = descripcion;
  }

  const estado = txt(body.estado);
  const estadoAntes = txt(actual.estado);
  if (estado.toLowerCase() !== estadoAntes.toLowerCase()) {
    if (/^blocked$/i.test(estado) || /^blocked$/i.test(estadoAntes)) {
      return { cambios: c, error: 'Para bloquear o desbloquear la obra usá el botón «Bloquear» / «Desbloquear» del detalle: además del estado, avisa a postventa en BC.' };
    }
    const bc = ESTADOS_BC.find((e) => e.toLowerCase() === estado.toLowerCase());
    if (!bc) return { cambios: c, error: `«${estado || '(vacío)'}» no es un estado de Business Central. Los válidos: ${ESTADOS_BC.join(', ')}.` };
    c.estado = bc;
  }

  const inicio = ymd(body.fechaInicio);
  const fin = ymd(body.fechaFin);
  if (inicio && fin && inicio > fin) return { cambios: c, error: 'La fecha de inicio no puede ser posterior a la de fin (regla de Business Central).' };
  if (inicio !== ymd(actual.fechaInicio)) c.fechaInicio = inicio;
  if (fin !== ymd(actual.fechaFin)) c.fechaFin = fin;

  const gerente = txt(body.gerenteProyecto);
  if (gerente !== txt(actual.gerenteProyecto)) c.gerente = gerente;
  const encargado = txt(body.idEncargado);
  if (encargado !== txt(actual.idEncargado)) c.encargado = encargado;

  const area = numero(body.areaProrrateadaM2);
  if (area !== numero(actual.areaProrrateadaM2)) c.areaProrrateada = area ?? 0;

  return { cambios: c };
}

class ErrorBC extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function bc<T = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getBCToken();
  const res = await fetchConReloj(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  const text = await res.text();
  let body: { error?: { message?: string } } = {};
  try { body = text ? JSON.parse(text) : {}; } catch { /* BC a veces responde HTML */ }
  if (!res.ok) {
    // El CorrelationId solo le sirve a soporte de Microsoft; al usuario lo confunde.
    const msg = String(body?.error?.message ?? `BC ${res.status}`).replace(/\s*CorrelationId:[\s\S]*$/i, '').trim();
    throw new ErrorBC(msg, res.status);
  }
  return body as T;
}

// PATCH de campos sueltos: If-Match '*' porque se acaba de leer y solo se tocan
// esos campos; con el etag, el PATCH del proyecto (que el AL propaga a la obra)
// invalidaba el de la obra y el segundo PATCH daba 412.
const patch = (url: string, campos: Record<string, unknown>) =>
  bc(url, { method: 'PATCH', headers: { 'If-Match': '*' }, body: JSON.stringify(campos) });

async function buscar(entidad: string, no: string, campos: string): Promise<Record<string, string> | null> {
  const r = await bc<{ value?: Record<string, string>[] }>(
    `${entidad}?$filter=${encodeURIComponent(`no eq '${odataStr(no)}'`)}&$select=${campos}&$top=1`);
  return r.value?.[0] ?? null;
}

/** GET por clave de una página OData; null si no existe (404). */
async function leerPagina(url: string): Promise<Record<string, string> | null> {
  try {
    return await bc<Record<string, string>>(url);
  } catch (e) {
    if (e instanceof ErrorBC && e.status === 404) return null;
    throw e;
  }
}

// ¿La API publica "Description 2"? Llega con AdelanteAPI 1.2.27.0. El "sí" se
// cachea para siempre; el "no", 5 min (mismo criterio que tasasSoportadas()).
let desc2Cache: { valor: Promise<boolean>; expira: number } | null = null;
function descripcion2Soportada(): Promise<boolean> {
  if (desc2Cache && Date.now() < desc2Cache.expira) return desc2Cache.valor;
  const valor = Promise.all([
    bc(`${WORKS}?$top=1&$select=no,description2`),
    bc(`${JOBS}?$top=1&$select=no,description2`),
  ]).then(() => true, () => false);
  desc2Cache = { valor, expira: Date.now() + 5 * 60 * 1000 };
  valor.then((ok) => { if (ok) desc2Cache = { valor, expira: Number.POSITIVE_INFINITY }; });
  return valor;
}

// El mensaje de BC nombra el campo en inglés; se agrega cuál es en el editor.
const CAMPOS_EDITOR: [RegExp, string][] = [
  [/Person Responsible/i, 'Gerente de proyecto'],
  [/Starting Date|Ending Date/i, 'Fechas'],
  [/\bStatus\b/i, 'Estado'],
  [/ID Encargado/i, 'Encargado'],
  [/Description 2/i, 'Descripción'],
  [/Description/i, 'Nombre mostrado'],
  [/Area Prorrateada/i, 'Área prorrateada'],
];
function explicar(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const campo = CAMPOS_EDITOR.find(([re]) => re.test(msg))?.[1];
  return campo ? `${msg} (campo «${campo}»)` : msg;
}

/**
 * Escribe en BC los cambios de una obra. Lanza con el motivo de BC si algo no
 * se acepta; el que llama NO debe guardar en la base en ese caso.
 *
 * Orden: primero el proyecto (es donde BC valida: estado, fechas, responsable),
 * en un solo PATCH para que un rechazo no deje nada a medias; después la obra.
 */
export async function actualizarObraEnBC(obraNo: string, cambios: CambiosObraBC): Promise<ResultadoSyncObra> {
  const c = { ...cambios };
  const enviados: string[] = [];
  const avisos: string[] = [];

  if (c.descripcion !== undefined && !(await descripcion2Soportada())) {
    avisos.push('La descripción quedó guardada solo en el sistema: este Business Central todavía no deja escribirla (falta publicar AdelanteAPI 1.2.27.0).');
    delete c.descripcion;
  }

  const work = await buscar(WORKS, obraNo, 'id,description');
  if (!work) throw new Error(`La obra ${obraNo} no existe en Business Central.`);

  // 1) Proyecto (Job)
  const delJob: Record<string, unknown> = {};
  if (c.estado !== undefined) delJob.status = c.estado;
  if (c.fechaInicio !== undefined) delJob.startingDate = c.fechaInicio || SIN_FECHA;
  if (c.fechaFin !== undefined) delJob.endingDate = c.fechaFin || SIN_FECHA;
  if (c.gerente !== undefined) delJob.personResponsible = c.gerente;
  if (c.encargado !== undefined) delJob.idEncargadoText = c.encargado;
  if (c.descripcion !== undefined) delJob.description2 = c.descripcion;
  if (c.areaProrrateada !== undefined) delJob.areaProrrateada = c.areaProrrateada;
  let jobTocado = false;
  if (Object.keys(delJob).length > 0) {
    const job = await buscar(JOBS, obraNo, 'id,endingDate');
    if (!job) throw new Error(`El proyecto (Job) de la obra ${obraNo} no existe en Business Central.`);
    // BC valida el inicio contra el fin que YA tiene: si el inicio nuevo cae después
    // de ese fin, se escribe primero todo lo demás (con el fin nuevo) y el inicio al final.
    const finBC = ymd(job.endingDate);
    const inicioAlFinal = !!c.fechaInicio && !!finBC && c.fechaInicio > finBC;
    const { startingDate, ...resto } = delJob;
    const primero = inicioAlFinal ? resto : delJob;
    try {
      if (Object.keys(primero).length > 0) await patch(`${JOBS}(${job.id})`, primero);
      jobTocado = true;
      if (inicioAlFinal) await patch(`${JOBS}(${job.id})`, { startingDate });
    } catch (e) {
      throw new Error(`Business Central no aceptó el cambio: ${explicar(e)}`);
    }
  }

  // 2) Obra (GomJob Works)
  const delWork: Record<string, unknown> = {};
  if (c.nombre !== undefined) delWork.description = c.nombre;
  if (c.descripcion !== undefined) delWork.description2 = c.descripcion;
  if (c.areaProrrateada !== undefined) delWork.areaProrrateada = c.areaProrrateada;
  if (Object.keys(delWork).length > 0) {
    try {
      await patch(`${WORKS}(${work.id})`, delWork);
    } catch (e) {
      throw new Error(jobTocado
        ? `Business Central actualizó el proyecto pero rechazó la obra: ${explicar(e)}`
        : `Business Central no aceptó el cambio: ${explicar(e)}`);
    }
  }

  if (c.nombre !== undefined) avisos.push(...(await propagarNombre(obraNo, c.nombre, txt(work.description))));

  if (c.nombre !== undefined) enviados.push('nombre');
  if (c.descripcion !== undefined) enviados.push('descripción');
  if (c.estado !== undefined) enviados.push('estado');
  if (c.fechaInicio !== undefined || c.fechaFin !== undefined) enviados.push('fechas');
  if (c.gerente !== undefined) enviados.push('gerente');
  if (c.encargado !== undefined) enviados.push('encargado');
  if (c.areaProrrateada !== undefined) enviados.push('área prorrateada');
  return { enviados, avisos };
}

/**
 * El nombre de la obra también es el del proyecto, el del valor de dimensión CC
 * (Code = N° de obra) y el del almacén de la obra (Code = N° de obra, hasta 10
 * caracteres): así los crea AdelanteObra_CreateWork. BC copia solo los dos
 * primeros; acá se verifica que lo haya hecho y se renombra el almacén.
 *
 * El CC y el almacén se renombran solo si tenían el nombre viejo, vacío o «POR
 * DEFINIR»/«SIN DEFINIR»: si alguien les puso un nombre propio (en Production,
 * ALM-SSO = «Almacén Salud y Seguridad Ocupacional»), se respeta. Si algo de esto
 * falla no se deshace nada: la obra ya quedó renombrada, se avisa.
 */
async function propagarNombre(obraNo: string, nombre: string, anterior: string): Promise<string[]> {
  const avisos: string[] = [];
  const norm = (s: unknown) => txt(s).toLowerCase();
  const reemplazable = (actual: unknown) =>
    !norm(actual) || norm(actual) === norm(anterior) || /^(por|sin) definir$/.test(norm(actual));

  try {
    const job = await buscar(JOBS, obraNo, 'id,description');
    if (job && job.description !== nombre) await patch(`${JOBS}(${job.id})`, { description: nombre });
  } catch (e) {
    avisos.push(`El proyecto (Job) no tomó el nombre nuevo: ${explicar(e)}`);
  }

  const destinos: [string, string, number][] = [
    ['el centro de costo (CC)', pagina('Valores_dimensión_Excel', `Dimension_Code='CC',Code=${lit(obraNo)}`), LARGO_NOMBRE_CC],
    ['el almacén de la obra', pagina('Ficha_almacén_Excel', lit(obraNo.slice(0, 10))), LARGO_BC.nombre],
  ];
  for (const [que, url, largo] of destinos) {
    const nuevo = nombre.slice(0, largo);
    try {
      const fila = await leerPagina(url);
      if (fila && fila.Name !== nuevo && reemplazable(fila.Name)) await patch(url, { Name: nuevo });
    } catch (e) {
      avisos.push(`No se pudo renombrar ${que} en Business Central: ${explicar(e)}`);
    }
  }
  return avisos;
}
