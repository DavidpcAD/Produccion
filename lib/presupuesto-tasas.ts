/**
 * Las 2 tasas que Business Central guarda en la OBRA (tabla GomJob Works, campos de
 * la extensión Goom Job Global Localization) y que el presupuestista tiene que VER
 * antes de subir el presupuesto:
 *
 *   · Tax Pcnt. (231)             → «% tasa»           = coste indirecto / venta × 100
 *   · After-sales Tax Pcnt. (233) → «% tasa postventa» = postventa       / venta × 100
 *
 * «Postventa» es la línea de indirectos con código CI.PV (descripción "Postventa");
 * el resto de los indirectos es CI.SC (Costos Servicios Centrales). En el snapshot de
 * BC hay exactamente UNA línea CI.PV por obra+versión donde existe (165 de 179; las
 * 14 sin ella son obras administrativas sin indirectos).
 *
 * Comprobado contra VN-B.22 en BC: indirecto 27.341.029,26 / venta 87.920.306,88 →
 * 31,10 (BC: 31,1) · postventa 694.725,846988 / venta → 0,79 (BC: 0,79).
 *
 * Módulo PURO (sin 'server-only') a propósito: lo usan la pantalla de carga —para
 * mostrar las tasas antes de enviar— y /api/presupuesto —que las recalcula del lado
 * del servidor sobre las mismas líneas, sin confiar en lo que manda el cliente.
 */

/** Código de la línea de indirectos que representa la postventa. */
export const CODIGO_POSTVENTA = 'CI.PV';

/**
 * Rango válido de un porcentaje de tasa. Los campos de BC declaran MinValue 0 /
 * MaxValue 100, pero eso solo frena la captura A MANO en la ficha: por la API el
 * PATCH acepta cualquier número (probado en Sandbox: 150 y -5 entran con HTTP 200 y
 * quedan guardados). Así que el rango lo tiene que cuidar el app.
 */
export const TASA_MIN = 0;
export const TASA_MAX = 100;

/** Lo mínimo que hace falta de una línea del Excel para calcular las tasas. */
export interface LineaImporte {
  taskNo: string;
  taskType?: string;
  description?: string;
  lineAmount?: number;
}

export interface TasasObra {
  /** Σ líneas de Venta (solo Posting). */
  venta: number;
  /** Σ líneas de Indirectos (solo Posting) = postventa + servicios centrales. */
  indirecto: number;
  /** Importe de la línea CI.PV. */
  postventa: number;
  /** Tax Pcnt. (231), 2 decimales. null si no hay venta (no se puede dividir). */
  taxPcnt: number | null;
  /** After-sales Tax Pcnt. (233), 2 decimales. null si no hay venta. */
  afterSalesTaxPcnt: number | null;
  /** Hay indirectos pero no se encontró la línea de postventa (CI.PV). */
  faltaPostventa: boolean;
  /**
   * Alguna de las dos tasas cae fuera de 0–100. Señal de que el Excel está mal
   * (p.ej. indirectos > venta): NO se manda a BC, porque BC lo aceptaría igual.
   */
  fueraDeRango: boolean;
}

const dos = (n: number) => Math.round(n * 100) / 100;
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Los Capítulos van como taskType 'Total' (rollup de sus partidas): sumarlos
// duplicaría el importe. Solo cuentan las líneas Posting.
const esPosting = (l: LineaImporte) => (l.taskType ?? '').trim().toLowerCase() !== 'total';
const suma = (ls: LineaImporte[]) => ls.reduce((s, l) => s + (Number(l.lineAmount) || 0), 0);

// La línea de postventa: por código (CI.PV) y, de respaldo, por descripción — hay
// obras viejas donde la descripción es "Costes indirectos postventa".
const esPostventa = (l: LineaImporte) =>
  (l.taskNo ?? '').trim().toUpperCase() === CODIGO_POSTVENTA ||
  /postventa/i.test(sinTildes(l.description ?? ''));

/**
 * Calcula las 2 tasas a partir de las líneas parseadas del Excel, tal como vienen
 * de /api/presupuesto/parse (`plantilla.porTipo`).
 */
export function calcularTasas(porTipo: Record<string, LineaImporte[] | undefined>): TasasObra {
  const ventas = (porTipo['Sales'] ?? []).filter(esPosting);
  // El parser usa la clave 'Indirect Cost'; BulkLine.lineType admite 'Indirect'.
  const indirectos = (porTipo['Indirect Cost'] ?? porTipo['Indirect'] ?? []).filter(esPosting);
  const lineasPV = indirectos.filter(esPostventa);

  const venta = suma(ventas);
  const indirecto = suma(indirectos);
  const postventa = suma(lineasPV);
  const pct = (v: number) => (venta > 0 ? dos((v / venta) * 100) : null);

  const taxPcnt = pct(indirecto);
  const afterSalesTaxPcnt = pct(postventa);
  const fuera = (v: number | null) => v != null && (v < TASA_MIN || v > TASA_MAX);

  return {
    venta,
    indirecto,
    postventa,
    taxPcnt,
    afterSalesTaxPcnt,
    faltaPostventa: indirectos.length > 0 && lineasPV.length === 0,
    fueraDeRango: fuera(taxPcnt) || fuera(afterSalesTaxPcnt),
  };
}
