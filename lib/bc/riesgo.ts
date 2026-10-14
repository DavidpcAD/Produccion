/**
 * Guardia contra el sobreavance de producción en Business Central.
 *
 * CONTEXTO (incidente 2026-10-01, obras VB-5.01, VC-F.12 y otras). Es un bug de
 * la extensión GomJob, tabla `GomJob Works Production Line` (70720578). Ahí hay
 * DOS campos «pendiente» que NO se calculan igual:
 *
 *   Outstanding Quantity (110) = Quantity (103)         − Registered Quantity (112)
 *   Outstanding Amount   (109) = Maximum Quantity (200) − Registered Quantity (112)  × precio
 *
 * Mientras las líneas se cargaban por Excel las dos coincidían, porque la
 * Maximum Quantity subía junto con la Quantity. Cuando las líneas se crean con
 * «Traer tareas de proyecto» (page 70720581, lookup temporal 70720612) llegan con
 * Maximum Quantity = 1 y Quantity = 0: el Importe pendiente nace con el 100 % del
 * presupuesto. Confirmado en el inspector de BC sobre VC-F.12 línea 1.1, con
 * registrado 0,8875: Outstanding Amount = 725.399,30377985962 = (1 − 0,8875) ×
 * 6.447.993,81. Como el proceso de Registrar postea LO PENDIENTE (ver
 * docs/integracion-bc-registrar.md), registrar esa obra genera el asiento del
 * presupuesto completo — un sobreavance de cientos de millones con las cantidades
 * en cero. Revalidar la Quantity de la línea en BC lo recalcula bien: la fórmula
 * sana existe, solo que el copiado de tareas no la corre.
 *
 * La app nunca escribió esos campos (solo hace PATCH Quantity), pero sí puede
 * disparar el posteo. Por eso acá se detecta la línea envenenada ANTES de tocar
 * BC y se bloquea la obra entera: si una sola línea arrastra presupuesto que la
 * Cantidad no justifica, un Registrar de esa obra lo postea igual.
 *
 * La regla se comprobó contra las 2.199 líneas Posting reales de BC (117 obras):
 * no marca NINGUNA —535 de ellas tienen Cantidad 0, registrado 0 e Importe
 * pendiente 0, que es lo sano—. Sobre la pantalla del incidente (VB-5.01) marca
 * 13 de 17 líneas y ₡43.957.113 en riesgo; deja pasar las dos cuyo avance sí
 * justifica el pendiente (1.1 y 1.2) y las dos de precio 0 (Maderas y Extras).
 */

/** Campos de `Obra_Production_Lines` que necesita la evaluación. */
export interface LineaProduccionRiesgo {
  Quantity: number;
  Unit_Amount: number;
  Outstanding_Quantity: number;
  Outstanding_Amount: number;
  Registered_Quantity: number;
}

export type MotivoRiesgo =
  /** La línea está sana: BC no postearía más de lo que la Cantidad justifica. */
  | 'ok'
  /** BC postearía presupuesto que la Cantidad no pidió (Cantidad máxima ≠ Cantidad). */
  | 'pendiente_sin_cantidad'
  /** Ya se registró más de lo que dice la Cantidad (Cantidad pendiente negativa). */
  | 'registrado_de_mas';

export interface RiesgoLinea {
  /** ₡ que BC postearía por esta línea al Registrar (su Importe pendiente). */
  pendiente_bc: number;
  /** ₡ que la Cantidad reportada justifica: max(0, Cantidad pendiente) × precio. */
  pendiente_legitimo: number;
  /** Exceso = pendiente_bc − pendiente_legitimo (nunca negativo). */
  riesgo: number;
  inconsistente: boolean;
  motivo: MotivoRiesgo;
}

/** Tolerancia en ₡ para el redondeo de BC. Por debajo de esto no es un hallazgo. */
export const TOLERANCIA_RIESGO = 1;

/** Tolerancia de cantidad (fracción 0–1) para la Cantidad pendiente negativa. */
const TOLERANCIA_QTY = 1e-6;

/**
 * Evalúa una línea de producción de BC. No consulta nada: solo compara lo que BC
 * postearía (`Outstanding_Amount`) contra lo que la Cantidad reportada justifica.
 */
export function evaluarRiesgo(l: LineaProduccionRiesgo): RiesgoLinea {
  const pendienteBc = Number(l.Outstanding_Amount) || 0;
  const outQty = Number(l.Outstanding_Quantity) || 0;
  const unit = Number(l.Unit_Amount) || 0;
  const pendienteLegitimo = Math.max(0, outQty) * unit;
  const riesgo = Math.max(0, pendienteBc - pendienteLegitimo);
  const motivo: MotivoRiesgo =
    riesgo > TOLERANCIA_RIESGO
      ? 'pendiente_sin_cantidad'
      : outQty < -TOLERANCIA_QTY
        ? 'registrado_de_mas'
        : 'ok';
  return {
    pendiente_bc: pendienteBc,
    pendiente_legitimo: pendienteLegitimo,
    riesgo,
    inconsistente: motivo !== 'ok',
    motivo,
  };
}

/** Texto para la pantalla y para el error de la API. */
export function explicarRiesgo(motivo: MotivoRiesgo): string {
  switch (motivo) {
    case 'pendiente_sin_cantidad':
      return 'BC postearía presupuesto que nadie pidió: su Importe pendiente no corresponde a la Cantidad. Revisá la Cantidad máxima de la línea en BC.';
    case 'registrado_de_mas':
      return 'Ya se registró más de lo que dice la Cantidad (Cantidad pendiente negativa en BC).';
    default:
      return '';
  }
}
