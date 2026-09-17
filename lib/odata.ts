/**
 * Literales de texto en filtros OData (Business Central).
 *
 * En OData un literal va entre comillas simples y la comilla de adentro se
 * escapa duplicándola. Interpolar el valor crudo tiene dos consecuencias: una
 * obra o un artículo con apóstrofe rompe la consulta, y un valor que venga del
 * usuario puede cerrar el literal y agregar condiciones al filtro.
 *
 * Ojo con el orden: `encodeURIComponent` NO escapa la comilla simple, así que
 * codificar el valor no sustituye a esto. Primero se escapa el literal, después
 * se codifica el filtro COMPLETO:
 *
 *     `?$filter=${encodeURIComponent(`no eq '${odataStr(obra)}'`)}`
 */
export function odataStr(v: string): string {
  return String(v ?? '').replace(/'/g, "''");
}
