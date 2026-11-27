// Vista de TALLER de la app de maquinaria (perfil mecánico). Lee y escribe el
// mismo esquema `mant` que la web de Mantenimiento:
//
//   · máquinas        → TODAS (mant.Equipos activos), primero las que tienen
//                       algo que hacer: OT abiertas o en proceso, preventivo
//                       vencido, checklist de hoy con problemas…
//   · empezar una OT  → igual que "Iniciar" en la web (en_proceso + equipo en
//                       mantenimiento) y además queda a nombre de quien la
//                       empezó (tecnicoId + responsable).
//   · terminar una OT → igual que "Finalizar" en la web, en UNA transacción:
//                       OT finalizada con cuánto duró, repuestos descontados de
//                       mant.Repuestos con su movimiento de salida, horómetro y
//                       estado del equipo, y el plan preventivo si viene de uno.
//   · repuestos       → mant.Repuestos (consulta). No se toca ningún almacén.
import { getDb, sql } from '@/lib/db';
import { detalleRestante, urgenciaPlan, type UrgenciaPlan } from '@/lib/mantenimiento/planUtils';
import type { Equipo as EquipoMant, PlanMantenimiento } from '@/lib/mantenimiento/types';
import type { OperadorMant } from './maquinaria';

const OFFSET_CR = '-06:00';
const ES_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esId = (v: unknown): v is string => typeof v === 'string' && ES_ID.test(v);

const up = (v: unknown) => String(v ?? '').toUpperCase();
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/** Error que la ruta devuelve tal cual (409, 403…): lo que la persona tiene que saber. */
export class ErrorTaller extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Sin la migración 2026-11-27 las columnas tecnicoId / duracionMinutos no existen. */
export function faltaMigracion(err: unknown): boolean {
  const m = (err as Error)?.message ?? '';
  return /Invalid column name '(tecnicoId|duracionMinutos)'/i.test(m);
}

// ── Máquinas ─────────────────────────────────────────────────────────────────

export interface OtResumen {
  id: string;
  numero: string;
  titulo: string;
  tipo: string;
  prioridad: string;
  estado: 'abierta' | 'en_proceso';
  tecnicoNombre: string | null;
  esMia: boolean;
}

export interface EquipoTaller {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  placa: string | null;
  estado: string;
  horometroActual: number;
  ots: OtResumen[];
  /** Problemas del checklist de hoy (0 si no lo hicieron o salió bien). */
  fallasHoy: number;
  /** El peor de sus planes preventivos activos. */
  preventivo: { urgencia: 'vencido' | 'proximo'; nombre: string } | null;
  /** 0 = nada que hacer. Más alto = más arriba en la lista. */
  urgencia: number;
}

const PESO_PRIORIDAD: Record<string, number> = { urgente: 60, alta: 45, media: 40, baja: 35 };

function calcularUrgencia(e: Omit<EquipoTaller, 'urgencia'>): number {
  let u = 0;
  for (const ot of e.ots) {
    if (ot.esMia) u = Math.max(u, 70); // la que estoy haciendo yo, arriba de todo
    else if (ot.prioridad === 'urgente') u = Math.max(u, 60);
    else if (ot.estado === 'en_proceso') u = Math.max(u, 50);
    else u = Math.max(u, PESO_PRIORIDAD[ot.prioridad] ?? 40);
  }
  if (e.preventivo?.urgencia === 'vencido') u = Math.max(u, 30);
  if (e.fallasHoy > 0) u = Math.max(u, 20);
  if (e.estado === 'fuera_servicio') u = Math.max(u, 15);
  if (e.preventivo?.urgencia === 'proximo') u = Math.max(u, 10);
  return u;
}

function fallasDe(json: unknown): number {
  if (!json) return 0;
  try {
    const arr = JSON.parse(String(json)) as Array<{ hecho?: boolean }>;
    return arr.filter((x) => x && x.hecho === false).length;
  } catch {
    return 0;
  }
}

function planDeFila(f: Record<string, unknown>): PlanMantenimiento {
  let tareas: string[] = [];
  try {
    tareas = f.tareas ? (JSON.parse(String(f.tareas)) as string[]) : [];
  } catch { /* tareas ilegibles: sin tareas */ }
  return {
    id: up(f.id),
    equipoId: up(f.equipoId),
    nombre: String(f.nombre ?? ''),
    tipoIntervalo: (f.tipoIntervalo as PlanMantenimiento['tipoIntervalo']) ?? 'horas',
    intervaloHoras: Number(f.intervaloHoras ?? 0),
    intervaloDias: Number(f.intervaloDias ?? 0),
    umbralAvisoHoras: Number(f.umbralAvisoHoras ?? 0),
    umbralAvisoDias: Number(f.umbralAvisoDias ?? 0),
    ultimaEjecucionHorometro: Number(f.ultimaEjecucionHorometro ?? 0),
    ultimaEjecucionFecha: iso(f.ultimaEjecucionFecha),
    tareas: Array.isArray(tareas) ? tareas.map(String) : [],
    activo: !!f.activo,
  };
}

const RANGO_PLAN: Record<UrgenciaPlan, number> = { vencido: 2, proximo: 1, al_dia: 0, inactivo: 0 };

async function hayColumnaActivo(): Promise<boolean> {
  const db = await getDb();
  const r = await db.request().query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sys.columns WHERE object_id = OBJECT_ID('mant.Equipos') AND name = 'activo'",
  );
  return Number(r.recordset[0]?.n) > 0;
}

/** Todas las máquinas, las que tienen algo que hacer primero. */
export async function equiposTaller(yo: OperadorMant): Promise<EquipoTaller[]> {
  const db = await getDb();
  const filtroActivo = (await hayColumnaActivo()) ? 'WHERE e.activo = 1' : '';
  const r = await db.request()
    .input('yo', sql.UniqueIdentifier, yo.id)
    .query(`
      DECLARE @hoy date = CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '${OFFSET_CR}') AS date);
      SELECT e.id, e.codigo, e.nombre, e.tipo, e.marca, e.modelo, e.placa, e.estado, e.horometroActual,
             hoy.checklist AS chkJson
      FROM mant.Equipos e
      OUTER APPLY (
        SELECT TOP 1 i.checklist FROM mant.InspeccionesDiarias i
        WHERE i.equipoId = e.id
          AND CAST(SWITCHOFFSET(TODATETIMEOFFSET(i.fecha, '+00:00'), '${OFFSET_CR}') AS date) = @hoy
        ORDER BY i.fecha DESC
      ) hoy
      ${filtroActivo};

      SELECT o.id, o.equipoId, o.numero, o.titulo, o.tipo, o.prioridad, o.estado, o.tecnicoId,
             COALESCE(u.nombre, NULLIF(o.responsable, '')) AS tecnicoNombre
      FROM mant.OrdenesTrabajo o LEFT JOIN mant.Usuarios u ON u.id = o.tecnicoId
      WHERE o.estado IN ('abierta', 'en_proceso')
      ORDER BY o.fechaApertura;

      SELECT * FROM mant.PlanesMantenimiento WHERE activo = 1;`);
  const [equipos, ots, planes] = r.recordsets as unknown as Record<string, unknown>[][];

  const otsPorEquipo = new Map<string, OtResumen[]>();
  for (const o of ots) {
    const lista = otsPorEquipo.get(up(o.equipoId)) ?? [];
    lista.push({
      id: up(o.id),
      numero: String(o.numero),
      titulo: String(o.titulo ?? ''),
      tipo: String(o.tipo ?? ''),
      prioridad: String(o.prioridad ?? 'media'),
      estado: o.estado as OtResumen['estado'],
      tecnicoNombre: o.estado === 'en_proceso' && o.tecnicoNombre ? String(o.tecnicoNombre) : null,
      esMia: o.estado === 'en_proceso' && up(o.tecnicoId) === up(yo.id),
    });
    otsPorEquipo.set(up(o.equipoId), lista);
  }

  const lista = equipos.map((f) => {
    const id = up(f.id);
    const horometroActual = Number(f.horometroActual ?? 0);
    const eqMant = { horometroActual } as EquipoMant;
    let preventivo: EquipoTaller['preventivo'] = null;
    for (const p of planes.filter((x) => up(x.equipoId) === id)) {
      const plan = planDeFila(p);
      const u = urgenciaPlan(plan, eqMant);
      if ((u === 'vencido' || u === 'proximo') && RANGO_PLAN[u] > (preventivo ? RANGO_PLAN[preventivo.urgencia] : 0)) {
        preventivo = { urgencia: u, nombre: plan.nombre };
      }
    }
    const base = {
      id,
      codigo: String(f.codigo ?? ''),
      nombre: String(f.nombre ?? ''),
      tipo: (f.tipo as string) ?? null,
      marca: (f.marca as string) ?? null,
      modelo: (f.modelo as string) ?? null,
      placa: (f.placa as string) ?? null,
      estado: String(f.estado ?? 'operativo'),
      horometroActual,
      ots: otsPorEquipo.get(id) ?? [],
      fallasHoy: fallasDe(f.chkJson),
      preventivo,
    };
    return { ...base, urgencia: calcularUrgencia(base) };
  });
  return lista.sort((a, b) => b.urgencia - a.urgencia || a.nombre.localeCompare(b.nombre, 'es'));
}

// ── Detalle de una máquina ───────────────────────────────────────────────────

export interface OtTaller {
  id: string;
  numero: string;
  equipoId: string;
  titulo: string;
  descripcion: string;
  tipo: string;
  prioridad: string;
  estado: string;
  fechaApertura: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  horometroApertura: number;
  tecnicoNombre: string | null;
  esMia: boolean;
  /** Empezada desde la web, sin dueño: cualquier mecánico la puede terminar. */
  sinDueno: boolean;
  duracionMinutos: number | null;
  trabajoRealizado: string | null;
  repuestosUsados: { repuestoId: string | null; nombre: string; cantidad: number }[];
  fotos: number;
}

export interface RepuestoTaller {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
  unidad: string | null;
  stockActual: number;
  stockMinimo: number;
  ubicacionBodega: string | null;
  equipoId: string | null;
  equipoNombre: string | null;
  equipoCodigo: string | null;
}

function otDeFila(f: Record<string, unknown>, yo: OperadorMant): OtTaller {
  let repuestos: OtTaller['repuestosUsados'] = [];
  let fotos = 0;
  try {
    const arr = JSON.parse(String(f.repuestosUsados ?? '[]')) as Array<Record<string, unknown>>;
    repuestos = arr.map((x) => ({ repuestoId: x.repuestoId ? up(x.repuestoId) : null, nombre: String(x.nombre ?? ''), cantidad: Number(x.cantidad ?? 0) }));
  } catch { /* sin repuestos */ }
  try {
    fotos = (JSON.parse(String(f.fotos ?? '[]')) as unknown[]).length;
  } catch { /* sin fotos */ }
  // La descripción de las averías lleva al final "Reportado desde la app…": se deja, es útil.
  return {
    id: up(f.id),
    numero: String(f.numero),
    equipoId: up(f.equipoId),
    titulo: String(f.titulo ?? ''),
    descripcion: String(f.descripcion ?? ''),
    tipo: String(f.tipo ?? ''),
    prioridad: String(f.prioridad ?? 'media'),
    estado: String(f.estado),
    fechaApertura: iso(f.fechaApertura),
    fechaInicio: iso(f.fechaInicio),
    fechaFin: iso(f.fechaFin),
    horometroApertura: Number(f.horometroApertura ?? 0),
    tecnicoNombre: f.tecnicoNombre ? String(f.tecnicoNombre) : null,
    esMia: !!f.tecnicoId && up(f.tecnicoId) === up(yo.id),
    sinDueno: f.estado === 'en_proceso' && !f.tecnicoId,
    duracionMinutos: f.duracionMinutos == null ? null : Number(f.duracionMinutos),
    trabajoRealizado: f.trabajoRealizado ? String(f.trabajoRealizado) : null,
    repuestosUsados: repuestos,
    fotos,
  };
}

const SELECT_OT = `
  SELECT o.id, o.numero, o.equipoId, o.titulo, o.descripcion, o.tipo, o.prioridad, o.estado,
         o.fechaApertura, o.fechaInicio, o.fechaFin, o.horometroApertura, o.tecnicoId, o.duracionMinutos,
         o.trabajoRealizado, o.repuestosUsados, o.fotos,
         COALESCE(u.nombre, NULLIF(o.responsable, '')) AS tecnicoNombre
  FROM mant.OrdenesTrabajo o LEFT JOIN mant.Usuarios u ON u.id = o.tecnicoId`;

const SELECT_REPUESTO = `
  SELECT r.id, r.codigo, r.nombre, r.categoria, r.unidad, r.stockActual, r.stockMinimo, r.ubicacionBodega,
         r.equipoId, e.nombre AS equipoNombre, e.codigo AS equipoCodigo
  FROM mant.Repuestos r LEFT JOIN mant.Equipos e ON e.id = r.equipoId`;

function repuestoDeFila(f: Record<string, unknown>): RepuestoTaller {
  return {
    id: up(f.id),
    codigo: String(f.codigo ?? ''),
    nombre: String(f.nombre ?? ''),
    categoria: (f.categoria as string) || null,
    unidad: (f.unidad as string) || null,
    stockActual: Number(f.stockActual ?? 0),
    stockMinimo: Number(f.stockMinimo ?? 0),
    ubicacionBodega: (f.ubicacionBodega as string) || null,
    equipoId: f.equipoId ? up(f.equipoId) : null,
    equipoNombre: (f.equipoNombre as string) || null,
    equipoCodigo: (f.equipoCodigo as string) || null,
  };
}

export interface DetalleEquipoTaller {
  equipo: Omit<EquipoTaller, 'ots' | 'urgencia' | 'preventivo' | 'fallasHoy'> & { ubicacion: string | null };
  activas: OtTaller[];
  terminadas: OtTaller[];
  checklistHoy: { fecha: string; usuarioNombre: string; problemas: { titulo: string; observacion: string | null }[] } | null;
  planes: { id: string; nombre: string; urgencia: UrgenciaPlan; restante: string; tareas: string[] }[];
  repuestos: RepuestoTaller[];
}

export async function detalleEquipoTaller(equipoId: string, yo: OperadorMant): Promise<DetalleEquipoTaller | null> {
  const db = await getDb();
  const r = await db.request()
    .input('equipoId', sql.UniqueIdentifier, equipoId)
    .query(`
      DECLARE @hoy date = CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '${OFFSET_CR}') AS date);
      SELECT id, codigo, nombre, tipo, marca, modelo, placa, estado, horometroActual, ubicacion FROM mant.Equipos WHERE id = @equipoId;
      ${SELECT_OT} WHERE o.equipoId = @equipoId AND o.estado IN ('abierta', 'en_proceso') ORDER BY o.fechaApertura;
      SELECT TOP 5 x.* FROM (${SELECT_OT} WHERE o.equipoId = @equipoId AND o.estado = 'finalizada') x ORDER BY x.fechaFin DESC;
      SELECT TOP 1 i.fecha, i.checklist, u.nombre AS usuarioNombre
        FROM mant.InspeccionesDiarias i JOIN mant.Usuarios u ON u.id = i.usuarioId
        WHERE i.equipoId = @equipoId
          AND CAST(SWITCHOFFSET(TODATETIMEOFFSET(i.fecha, '+00:00'), '${OFFSET_CR}') AS date) = @hoy
        ORDER BY i.fecha DESC;
      SELECT * FROM mant.PlanesMantenimiento WHERE equipoId = @equipoId AND activo = 1 ORDER BY nombre;
      ${SELECT_REPUESTO} WHERE r.equipoId = @equipoId ORDER BY r.nombre;`);
  const [eqs, activas, terminadas, chk, planes, repuestos] = r.recordsets as unknown as Record<string, unknown>[][];
  const f = eqs[0];
  if (!f) return null;
  const horometroActual = Number(f.horometroActual ?? 0);
  const eqMant = { horometroActual } as EquipoMant;

  let checklistHoy: DetalleEquipoTaller['checklistHoy'] = null;
  if (chk[0]) {
    let problemas: { titulo: string; observacion: string | null }[] = [];
    try {
      const arr = JSON.parse(String(chk[0].checklist ?? '[]')) as Array<{ titulo?: string; hecho?: boolean; observacion?: string }>;
      problemas = arr.filter((x) => x && x.hecho === false).map((x) => ({ titulo: String(x.titulo ?? ''), observacion: x.observacion ? String(x.observacion) : null }));
    } catch { /* checklist ilegible */ }
    checklistHoy = { fecha: iso(chk[0].fecha)!, usuarioNombre: String(chk[0].usuarioNombre ?? ''), problemas };
  }

  return {
    equipo: {
      id: up(f.id),
      codigo: String(f.codigo ?? ''),
      nombre: String(f.nombre ?? ''),
      tipo: (f.tipo as string) ?? null,
      marca: (f.marca as string) ?? null,
      modelo: (f.modelo as string) ?? null,
      placa: (f.placa as string) ?? null,
      estado: String(f.estado ?? 'operativo'),
      horometroActual,
      ubicacion: (f.ubicacion as string) || null,
    },
    activas: activas.map((x) => otDeFila(x, yo)),
    terminadas: terminadas.map((x) => otDeFila(x, yo)),
    checklistHoy,
    planes: planes
      .map(planDeFila)
      .map((p) => ({ id: p.id, nombre: p.nombre, urgencia: urgenciaPlan(p, eqMant), restante: detalleRestante(p, eqMant), tareas: p.tareas }))
      .sort((a, b) => RANGO_PLAN[b.urgencia] - RANGO_PLAN[a.urgencia]),
    repuestos: repuestos.map(repuestoDeFila),
  };
}

// ── Una OT ───────────────────────────────────────────────────────────────────

export async function otDelTaller(otId: string, yo: OperadorMant): Promise<(OtTaller & { equipoNombre: string; equipoTipo: string | null; horometroEquipo: number }) | null> {
  const db = await getDb();
  const r = await db.request()
    .input('id', sql.UniqueIdentifier, otId)
    .query(`
      SELECT x.*, e.nombre AS equipoNombre, e.tipo AS equipoTipo, e.horometroActual AS horometroEquipo
      FROM (${SELECT_OT} WHERE o.id = @id) x JOIN mant.Equipos e ON e.id = x.equipoId`);
  const f = r.recordset[0];
  if (!f) return null;
  return { ...otDeFila(f, yo), equipoNombre: String(f.equipoNombre ?? ''), equipoTipo: f.equipoTipo ?? null, horometroEquipo: Number(f.horometroEquipo ?? 0) };
}

/** Empezar una OT: pasa a en_proceso y queda a nombre de quien la empezó. */
export async function empezarOt(otId: string, yo: OperadorMant): Promise<void> {
  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const r = await tx.request()
      .input('id', sql.UniqueIdentifier, otId)
      .query(`
        SELECT o.estado, o.equipoId, COALESCE(u.nombre, NULLIF(o.responsable, '')) AS tecnicoNombre
        FROM mant.OrdenesTrabajo o WITH (UPDLOCK, ROWLOCK) LEFT JOIN mant.Usuarios u ON u.id = o.tecnicoId
        WHERE o.id = @id`);
    const ot = r.recordset[0];
    if (!ot) throw new ErrorTaller('Esa OT ya no existe.', 404);
    if (ot.estado === 'en_proceso') throw new ErrorTaller(`Esta OT ya la empezó ${ot.tecnicoNombre || 'otra persona'}.`, 409);
    if (ot.estado !== 'abierta') throw new ErrorTaller('Esta OT ya está cerrada.', 409);
    await tx.request()
      .input('id', sql.UniqueIdentifier, otId)
      .input('yo', sql.UniqueIdentifier, yo.id)
      .input('nombre', sql.NVarChar(300), yo.nombre)
      .input('equipoId', sql.UniqueIdentifier, ot.equipoId)
      .query(`
        UPDATE mant.OrdenesTrabajo SET estado = 'en_proceso', fechaInicio = SYSUTCDATETIME(), tecnicoId = @yo, responsable = @nombre WHERE id = @id;
        UPDATE mant.Equipos SET estado = 'mantenimiento' WHERE id = @equipoId AND estado = 'operativo';`);
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

export interface LineaUsada {
  repuestoId: string;
  cantidad: number;
}

export function textoDuracion(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Terminar una OT. Misma transacción que /api/mantenimiento/ots/[id]/finalizar
 * (stock con UPDLOCK para que dos cierres no lo dejen en negativo), más cuánto
 * duró y quién la terminó. El costo de cada repuesto sale de mant.Repuestos, no
 * de lo que mande el teléfono.
 */
export async function terminarOt(args: {
  otId: string;
  yo: OperadorMant;
  duracionMinutos: number;
  trabajoRealizado: string;
  horometroCierre: number | null;
  repuestos: LineaUsada[];
  fotos: string[];
}): Promise<{ numero: string }> {
  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const r = await tx.request()
      .input('id', sql.UniqueIdentifier, args.otId)
      .query(`
        SELECT o.estado, o.equipoId, o.tipo, o.planId, o.horometroApertura, o.numero, o.tecnicoId, o.fotos,
               COALESCE(u.nombre, NULLIF(o.responsable, '')) AS tecnicoNombre, e.horometroActual
        FROM mant.OrdenesTrabajo o WITH (UPDLOCK, ROWLOCK)
        JOIN mant.Equipos e ON e.id = o.equipoId
        LEFT JOIN mant.Usuarios u ON u.id = o.tecnicoId
        WHERE o.id = @id`);
    const ot = r.recordset[0];
    if (!ot) throw new ErrorTaller('Esa OT ya no existe.', 404);
    if (ot.estado === 'finalizada' || ot.estado === 'cancelada') throw new ErrorTaller('Esta OT ya está cerrada.', 409);
    if (ot.estado !== 'en_proceso') throw new ErrorTaller('Primero hay que empezar la OT.', 409);
    if (ot.tecnicoId && up(ot.tecnicoId) !== up(args.yo.id)) {
      throw new ErrorTaller(`Esta OT la está haciendo ${ot.tecnicoNombre || 'otra persona'}: solo esa persona la puede terminar.`, 403);
    }
    const apertura = Number(ot.horometroApertura ?? 0);
    // Sin horómetro nuevo se cierra con el que ya tiene el equipo (nunca menos que el de apertura).
    const horometroCierre = args.horometroCierre ?? Math.max(Number(ot.horometroActual ?? 0), apertura);
    if (horometroCierre < apertura) throw new ErrorTaller(`El horómetro no puede ser menor al de cuando se abrió la OT (${apertura} h).`, 400);

    // Juntar líneas repetidas del mismo repuesto antes de descontar.
    const porRepuesto = new Map<string, number>();
    for (const l of args.repuestos) porRepuesto.set(up(l.repuestoId), (porRepuesto.get(up(l.repuestoId)) ?? 0) + l.cantidad);

    const usados: { repuestoId: string; nombre: string; cantidad: number; costoUnitario: number }[] = [];
    for (const [repuestoId, cantidad] of porRepuesto) {
      const rep = await tx.request()
        .input('id', sql.UniqueIdentifier, repuestoId)
        .query('SELECT nombre, stockActual, costoUnitario, unidad FROM mant.Repuestos WITH (UPDLOCK, ROWLOCK) WHERE id = @id');
      const f = rep.recordset[0];
      if (!f) throw new ErrorTaller('Uno de los repuestos ya no existe en el inventario. Revisá la lista.', 409);
      if (cantidad > Number(f.stockActual ?? 0)) {
        throw new ErrorTaller(`No hay suficiente ${f.nombre}: quedan ${Number(f.stockActual ?? 0)}${f.unidad ? ' ' + f.unidad : ''}.`, 409);
      }
      await tx.request()
        .input('id', sql.UniqueIdentifier, repuestoId)
        .input('cantidad', sql.Decimal(18, 2), cantidad)
        .input('motivo', sql.NVarChar(400), 'OT ' + ot.numero)
        .input('otId', sql.UniqueIdentifier, args.otId)
        .input('responsable', sql.NVarChar(300), args.yo.nombre)
        .query(`
          UPDATE mant.Repuestos SET stockActual = stockActual - @cantidad WHERE id = @id;
          INSERT INTO mant.MovimientosRepuestos (repuestoId, tipo, cantidad, motivo, otId, responsable)
            VALUES (@id, 'salida', @cantidad, @motivo, @otId, @responsable);`);
      usados.push({ repuestoId, nombre: String(f.nombre ?? ''), cantidad, costoUnitario: Number(f.costoUnitario ?? 0) });
    }

    let fotosPrevias: string[] = [];
    try {
      fotosPrevias = JSON.parse(String(ot.fotos ?? '[]'));
    } catch { /* sin fotos previas */ }
    const fotos = [...new Set([...fotosPrevias.map(up), ...args.fotos.map(up)])];
    const pie = `Duró ${textoDuracion(args.duracionMinutos)}. Terminada desde la app por ${args.yo.nombre}.`;
    const trabajo = args.trabajoRealizado ? `${args.trabajoRealizado}\n\n${pie}` : pie;

    await tx.request()
      .input('id', sql.UniqueIdentifier, args.otId)
      .input('yo', sql.UniqueIdentifier, args.yo.id)
      .input('nombre', sql.NVarChar(300), args.yo.nombre)
      .input('trabajo', sql.NVarChar(sql.MAX), trabajo)
      .input('horometroCierre', sql.Decimal(18, 2), horometroCierre)
      .input('duracion', sql.Int, args.duracionMinutos)
      .input('repuestos', sql.NVarChar(sql.MAX), JSON.stringify(usados))
      .input('fotos', sql.NVarChar(sql.MAX), JSON.stringify(fotos))
      .input('equipoId', sql.UniqueIdentifier, ot.equipoId)
      .query(`
        UPDATE mant.OrdenesTrabajo SET estado = 'finalizada', fechaFin = SYSUTCDATETIME(), trabajoRealizado = @trabajo,
          horometroCierre = @horometroCierre, duracionMinutos = @duracion, repuestosUsados = @repuestos, fotos = @fotos,
          tecnicoId = @yo, responsable = @nombre
        WHERE id = @id;
        UPDATE mant.Equipos SET
          horometroActual = CASE WHEN horometroActual > @horometroCierre THEN horometroActual ELSE @horometroCierre END,
          -- Vuelve a operativa solo si no le queda otra OT en proceso (la web la
          -- pasa a operativa siempre; acá no, para no mentir con dos mecánicos).
          estado = CASE WHEN estado = 'mantenimiento' AND NOT EXISTS (
                     SELECT 1 FROM mant.OrdenesTrabajo x WHERE x.equipoId = @equipoId AND x.estado = 'en_proceso' AND x.id <> @id
                   ) THEN 'operativo' ELSE estado END
        WHERE id = @equipoId;`);

    if (ot.tipo === 'preventivo' && ot.planId) {
      await tx.request()
        .input('planId', sql.UniqueIdentifier, ot.planId)
        .input('horometro', sql.Decimal(18, 2), horometroCierre)
        .query('UPDATE mant.PlanesMantenimiento SET ultimaEjecucionHorometro = @horometro, ultimaEjecucionFecha = SYSUTCDATETIME() WHERE id = @planId');
    }

    await tx.commit();
    return { numero: String(ot.numero) };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

// ── Repuestos ────────────────────────────────────────────────────────────────

export async function repuestosTaller(): Promise<RepuestoTaller[]> {
  const db = await getDb();
  const r = await db.request().query(`${SELECT_REPUESTO} ORDER BY e.nombre, r.nombre`);
  return r.recordset.map(repuestoDeFila);
}

// ── Para las rutas ───────────────────────────────────────────────────────────

/** Respuesta de error de una ruta del taller: lo que la persona tiene que saber. */
export function errorDeTaller(ruta: string, err: unknown, quePaso: string) {
  if (err instanceof ErrorTaller) return { body: { error: err.message }, status: err.status };
  if (faltaMigracion(err)) {
    return { body: { error: 'Falta actualizar la base de Mantenimiento para el taller. Avisale a sistemas.' }, status: 503 };
  }
  console.error(ruta, err);
  return { body: { error: `${quePaso} Probá de nuevo.` }, status: 500 };
}
