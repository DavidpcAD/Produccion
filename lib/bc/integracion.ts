import 'server-only';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import sql from 'mssql';
import {
  type LineaBC,
  escribirQuantity,
  leerLineasObra,
  leerLineasObras,
  registrarDisponible,
} from './production-lines';

/**
 * Integración ObrasControl → Business Central (comparación OC vs BC por partida).
 *
 * El % acumulado por partida sale del roll-up ponderado por `peso_partida` — la
 * misma lógica del reporte (lib/avance/reportes.ts), aquí condensada en un query
 * por obra (o uno para todas). Reportar solo INCREMENTA (regla "BC no baja").
 *
 * Tablas: esquema pro_obc de AdelanteSBX (getAdelanteDb). Portado de
 * adelante-obrascontrol (obc.*), prefijando pro_obc.*.
 */

const UMBRAL = 0.05; // % mínimo de diferencia para reportar

/** Una partida en el preview de integración BC (comparación OC vs BC). */
export interface BcPartidaPreview {
  /** Código de partida (= Task_No en BC, ej. '1.1'). */
  partida: string;
  nombre: string;
  /** % acumulado en ObrasControl (0–100); null si OC no trackea esa partida. */
  oc_pct: number | null;
  /** % actual en BC (Quantity·100). */
  bc_pct: number;
  /** Quantity actual en BC (0–1). */
  bc_quantity: number;
  /** Δ = oc_pct − bc_pct; null si oc_pct es null. */
  delta: number | null;
  /** Valor total de la línea (₡, Line_Amount cuando Quantity=1). */
  unit_amount: number;
  /** Ya registrado (posteado) en BC (0–1). */
  registrado_qty: number;
  /** ₡ que se registraría si se reporta OC y luego se registra. */
  monto_a_registrar: number;
  /** true si al reportar subiría (oc_pct > bc_pct + umbral). */
  se_reportaria: boolean;
}

/** Respuesta del preview de una obra (detalle). */
export interface BcPreview {
  obra: string;
  configurado: boolean;
  registrar_disponible: boolean;
  partidas: BcPartidaPreview[];
  total_a_registrar: number;
  monto_registrado: number;
  n_cambios: number;
  ya_registrado: boolean;
  produccion_inicializada: boolean;
}

export type EstadoBcObra = 'en_ejecucion' | 'en_espera' | 'finalizada';

/** Una obra en el listado-resumen de integración BC. */
export interface BcResumenObra {
  obra: string;
  estado: EstadoBcObra;
  monto_registrado: number;
  monto_a_registrar: number;
  n_cambios: number;
  ya_registrado: boolean;
  produccion_inicializada: boolean;
}

/** Respuesta del listado de integración BC. */
export interface BcResumen {
  configurado: boolean;
  registrar_disponible: boolean;
  obras: BcResumenObra[];
  total_registrado: number;
  total_a_registrar: number;
}

/** Resultado de reportar una partida. */
export interface BcReporteResultado {
  partida: string;
  quantity: number;
  ok: boolean;
  mensaje?: string;
}

// % acumulado por partida en ObrasControl, ponderado por peso_partida. La misma
// forma de ponderar que reportes.ts: COALESCE(obra_pesos, catálogo) por tipo de casa.
const ROLLUP_SELECT = `
  SUM(ISNULL(a.pct_completado, 0) * COALESCE(opp.peso, catp.peso))
    / NULLIF(SUM(COALESCE(opp.peso, catp.peso)), 0) AS pct`;
const ROLLUP_JOINS = `
  FROM pro_obc.obra_estado e
  JOIN pro_obc.sub_partidas sp ON sp.activo = 1
  JOIN pro_obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = e.tipo_casa
  JOIN pro_obc.partidas p ON p.id = sp.partida_id
  LEFT JOIN pro_obc.obra_pesos opp
    ON opp.obra_codigo = e.obra_codigo AND opp.ambito = 'partida'
   AND opp.scope_id = sp.partida_id AND opp.sub_partida_id = sp.id
  LEFT JOIN pro_obc.sub_partida_pesos_partida catp
    ON catp.partida_id = sp.partida_id AND catp.tipo_casa = e.tipo_casa
   AND catp.sub_partida_id = sp.id
  LEFT JOIN pro_obc.avance_sub_partidas a
    ON a.obra_codigo = e.obra_codigo AND a.sub_partida_id = sp.id`;

/** % acumulado por partida en OC (live) para una obra. */
async function rollupPartidas(obra: string): Promise<Map<string, number>> {
  const pool = await getAdelanteDb();
  const r = await pool
    .request()
    .input('obra', sql.NVarChar(20), obra)
    .query<{ partida: string; pct: number }>(`
      SELECT p.codigo AS partida, ${ROLLUP_SELECT}
      ${ROLLUP_JOINS}
      WHERE e.obra_codigo = @obra AND e.tipo_casa IS NOT NULL
        AND COALESCE(opp.peso, catp.peso) IS NOT NULL
      GROUP BY p.codigo
    `);
  const m = new Map<string, number>();
  for (const row of r.recordset) m.set(row.partida.trim().toUpperCase(), Number(row.pct) || 0);
  return m;
}

/**
 * Roll-up por partida para TODAS las obras del listado BC (un solo query).
 * Incluye en ejecución, congeladas (en_espera) Y finalizadas: una obra que
 * terminó puede tener producción final sin reportar a BC.
 */
async function rollupTodas(): Promise<{
  pcts: Map<string, Map<string, number>>;
  estados: Map<string, EstadoBcObra>;
}> {
  const pool = await getAdelanteDb();
  const r = await pool.request().query<{
    obra: string;
    estado: EstadoBcObra;
    partida: string;
    pct: number;
  }>(`
    SELECT e.obra_codigo AS obra, e.estado, p.codigo AS partida, ${ROLLUP_SELECT}
    ${ROLLUP_JOINS}
    WHERE e.estado IN ('en_ejecucion', 'en_espera', 'finalizada') AND e.tipo_casa IS NOT NULL
      AND COALESCE(opp.peso, catp.peso) IS NOT NULL
    GROUP BY e.obra_codigo, e.estado, p.codigo
  `);
  const pcts = new Map<string, Map<string, number>>();
  const estados = new Map<string, EstadoBcObra>();
  for (const row of r.recordset) {
    const obra = row.obra.trim();
    if (!pcts.has(obra)) pcts.set(obra, new Map());
    (pcts.get(obra) as Map<string, number>).set(row.partida.trim().toUpperCase(), Number(row.pct) || 0);
    estados.set(obra, row.estado);
  }
  return { pcts, estados };
}

interface CalculoObra {
  partidas: BcPartidaPreview[];
  total_a_registrar: number;
  monto_registrado: number;
  n_cambios: number;
  produccion_inicializada: boolean;
}

/** Compara el roll-up de OC con las líneas Posting de BC de una obra. */
function calcularObra(oc: Map<string, number>, lineas: LineaBC[]): CalculoObra {
  const partidas: BcPartidaPreview[] = [];
  let total = 0;
  let registrado = 0;
  let unitTotal = 0; // Σ precio unitario → si 0, producción sin inicializar
  let nCambios = 0;
  for (const l of lineas) {
    if (l.Task_Type === 'Total') continue; // las Total las recalcula BC
    unitTotal += Number(l.Unit_Amount) || 0;
    const key = String(l.Task_No).trim().toUpperCase();
    const ocPct = oc.has(key) ? (oc.get(key) as number) : null;
    const bcQty = Number(l.Quantity) || 0;
    const bcPct = bcQty * 100;
    const seReportaria = ocPct != null && ocPct > bcPct + UMBRAL;
    const targetQty = seReportaria ? (ocPct as number) / 100 : bcQty;
    const reg = Number(l.Registered_Quantity) || 0;
    const unit = Number(l.Unit_Amount) || 0;
    const montoARegistrar = Math.max(0, targetQty - reg) * unit;
    if (seReportaria) nCambios++;
    total += montoARegistrar;
    registrado += Number(l.Registered_Amount) || 0;
    partidas.push({
      partida: l.Task_No,
      nombre: l.Description,
      oc_pct: ocPct,
      bc_pct: bcPct,
      bc_quantity: bcQty,
      delta: ocPct != null ? ocPct - bcPct : null,
      unit_amount: unit,
      registrado_qty: reg,
      monto_a_registrar: Math.round(montoARegistrar * 100) / 100,
      se_reportaria: seReportaria,
    });
  }
  partidas.sort((a, b) => a.partida.localeCompare(b.partida, 'es', { numeric: true }));
  return {
    partidas,
    total_a_registrar: Math.round(total * 100) / 100,
    monto_registrado: Math.round(registrado * 100) / 100,
    n_cambios: nCambios,
    produccion_inicializada: unitTotal > 0,
  };
}

/** Preview de una obra (detalle). */
export async function construirPreview(obra: string): Promise<BcPreview> {
  const [oc, lineas] = await Promise.all([rollupPartidas(obra), leerLineasObra(obra)]);
  const c = calcularObra(oc, lineas);
  return {
    obra,
    configurado: true,
    registrar_disponible: registrarDisponible(),
    partidas: c.partidas,
    total_a_registrar: c.total_a_registrar,
    monto_registrado: c.monto_registrado,
    n_cambios: c.n_cambios,
    ya_registrado: c.n_cambios === 0,
    produccion_inicializada: c.produccion_inicializada,
  };
}

/** Resumen de las obras del listado BC (pantalla principal). */
export async function construirResumen(): Promise<BcResumen> {
  const { pcts: porObra, estados } = await rollupTodas();
  const obras = [...porObra.keys()];
  const lineas = await leerLineasObras(obras);
  const lineasPorObra = new Map<string, LineaBC[]>();
  for (const l of lineas) {
    const o = String(l.Works_No).trim();
    if (!lineasPorObra.has(o)) lineasPorObra.set(o, []);
    (lineasPorObra.get(o) as LineaBC[]).push(l);
  }
  const filas: BcResumenObra[] = [];
  let totReg = 0;
  let totAReg = 0;
  for (const obra of obras) {
    const estado = estados.get(obra) ?? 'en_ejecucion';
    const c = calcularObra(porObra.get(obra) as Map<string, number>, lineasPorObra.get(obra) ?? []);
    // Finalizadas: solo mientras tengan producción sin reportar. Al quedar al día
    // salen de la lista (siguen accesibles por URL directa /bc/integracion/{obra}).
    if (estado === 'finalizada' && c.n_cambios === 0) continue;
    totReg += c.monto_registrado;
    totAReg += c.total_a_registrar;
    filas.push({
      obra,
      estado,
      monto_registrado: c.monto_registrado,
      monto_a_registrar: c.total_a_registrar,
      n_cambios: c.n_cambios,
      ya_registrado: c.n_cambios === 0,
      produccion_inicializada: c.produccion_inicializada,
    });
  }
  filas.sort((a, b) => a.obra.localeCompare(b.obra, 'es', { numeric: true }));
  return {
    configurado: true,
    registrar_disponible: registrarDisponible(),
    obras: filas,
    total_registrado: Math.round(totReg * 100) / 100,
    total_a_registrar: Math.round(totAReg * 100) / 100,
  };
}

/**
 * Reporta a BC las partidas de una obra que subirían (se_reportaria). Si `filtro`
 * viene, solo esas. Escribe Quantity = oc_pct/100. Devuelve el resultado por partida.
 */
export async function reportarObra(
  obra: string,
  filtro?: string[],
): Promise<BcReporteResultado[]> {
  const set = filtro ? new Set(filtro.map((p) => p.toUpperCase())) : null;
  const preview = await construirPreview(obra);
  const aReportar = preview.partidas.filter(
    (p) => p.se_reportaria && (!set || set.has(p.partida.toUpperCase())),
  );
  const resultados: BcReporteResultado[] = [];
  for (const p of aReportar) {
    const qty = Math.round(((p.oc_pct as number) / 100) * 10000) / 10000;
    try {
      await escribirQuantity(obra, p.partida, qty);
      resultados.push({ partida: p.partida, quantity: qty, ok: true });
    } catch (err) {
      resultados.push({
        partida: p.partida,
        quantity: qty,
        ok: false,
        mensaje: err instanceof Error ? err.message : 'Error',
      });
    }
  }
  return resultados;
}
