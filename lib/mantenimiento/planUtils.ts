// Deriva el estado de urgencia de un plan de mantenimiento comparando el
// horómetro/fecha actual del equipo contra el intervalo configurado — la
// misma regla "lo que ocurra primero" que describe sql/schema2.sql para
// tipoIntervalo = "ambos".

import type { Equipo, PlanMantenimiento } from "./types";

export type UrgenciaPlan = "vencido" | "proximo" | "al_dia" | "inactivo";
export type TonoPill = "red" | "yellow" | "green" | "gray" | "black";

export function urgenciaPlan(plan: PlanMantenimiento, equipo: Equipo | undefined): UrgenciaPlan {
  if (!plan.activo || !equipo) return "inactivo";

  let restanteHoras = Infinity;
  if (plan.tipoIntervalo !== "dias") {
    restanteHoras = plan.ultimaEjecucionHorometro + plan.intervaloHoras - equipo.horometroActual;
  }

  let restanteDias = Infinity;
  if (plan.tipoIntervalo !== "horas" && plan.ultimaEjecucionFecha) {
    const diasTranscurridos = Math.floor((Date.now() - new Date(plan.ultimaEjecucionFecha).getTime()) / (24 * 3600 * 1000));
    restanteDias = plan.intervaloDias - diasTranscurridos;
  }

  if (restanteHoras <= 0 || restanteDias <= 0) return "vencido";
  if (restanteHoras <= plan.umbralAvisoHoras || restanteDias <= plan.umbralAvisoDias) return "proximo";
  return "al_dia";
}

export function detalleRestante(plan: PlanMantenimiento, equipo: Equipo | undefined): string {
  if (!equipo) return "";
  const partes: string[] = [];
  if (plan.tipoIntervalo !== "dias") {
    const restante = plan.ultimaEjecucionHorometro + plan.intervaloHoras - equipo.horometroActual;
    partes.push(restante > 0 ? `${restante.toFixed(0)}h restantes` : `${Math.abs(restante).toFixed(0)}h vencido`);
  }
  if (plan.tipoIntervalo !== "horas" && plan.ultimaEjecucionFecha) {
    const diasTranscurridos = Math.floor((Date.now() - new Date(plan.ultimaEjecucionFecha).getTime()) / (24 * 3600 * 1000));
    const restanteDias = plan.intervaloDias - diasTranscurridos;
    partes.push(restanteDias > 0 ? `${restanteDias}d restantes` : `${Math.abs(restanteDias)}d vencido`);
  }
  return partes.join(" / ");
}

// Cuenta regresiva simple de mantenimiento preventivo, sin necesidad de un
// PlanMantenimiento formal — la misma cuenta que ya traía el Excel de
// levantamiento de maquinaria: asume que el service cae en cada múltiplo del
// intervalo (horómetro 715 con intervalo 400 -> próximo service a las 800,
// faltan 85h). Menos preciso que un Plan real (que sabe cuándo fue el último
// service de verdad), pero funciona para cualquier equipo con solo
// horometroActual + intervaloHorasPreventivo cargados.
export function horasRestantesSimple(equipo: Pick<Equipo, "horometroActual" | "intervaloHorasPreventivo"> | null | undefined): number | null {
  const intervalo = Number(equipo?.intervaloHorasPreventivo) || 0;
  if (!intervalo) return null;
  const horometro = Number(equipo?.horometroActual) || 0;
  // Igual que la fórmula del Excel de levantamiento (MOD(-horómetro, intervalo)):
  // un horómetro que cae justo en un múltiplo del intervalo (0, 400, 800...)
  // da 0 restantes — "recién tocaría service ahora", no "falta el intervalo entero".
  return ((-horometro % intervalo) + intervalo) % intervalo;
}

// Misma cuenta que horasRestantesSimple, pero por kilometraje -- para
// vehículos de carretera (camiones, busetas, pickups, vagonetas) a los que
// se les da servicio por km recorridos, no por horas de motor.
export function kilometrosRestantesSimple(
  equipo: Pick<Equipo, "kilometraje" | "intervaloKilometrajePreventivo"> | null | undefined
): number | null {
  const intervalo = Number(equipo?.intervaloKilometrajePreventivo) || 0;
  if (!intervalo) return null;
  const km = Number(equipo?.kilometraje) || 0;
  return ((-km % intervalo) + intervalo) % intervalo;
}

// Cuenta regresiva por calendario (ultimaFechaMantenimiento /
// proximaFechaMantenimiento). A diferencia de horasRestantesSimple /
// kilometrosRestantesSimple, acá la "próxima fecha" no se calcula sola: se
// toma directo del dato que carga el usuario, porque el intervalo real de
// cada equipo varía y no siempre es por horómetro o kilometraje (revisión
// técnica, pólizas, contratos de servicio, etc.).
export function diasHastaProximoMantenimiento(
  equipo: Pick<Equipo, "proximaFechaMantenimiento"> | null | undefined
): number | null {
  const fecha = equipo?.proximaFechaMantenimiento;
  if (!fecha) return null;
  const ms = new Date(fecha).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - Date.now()) / (24 * 3600 * 1000));
}

export function toneFechaProxima(dias: number | null): TonoPill {
  if (dias == null) return "gray";
  if (dias <= 0) return "red";
  if (dias <= 15) return "yellow";
  return "green";
}

export function toneRestante(restante: number | null, intervalo: number): TonoPill {
  if (restante == null) return "gray";
  const umbral = (Number(intervalo) || 0) * 0.1; // aviso dentro del último 10% del intervalo
  if (restante <= 0) return "red";
  if (restante <= Math.max(umbral, 10)) return "yellow";
  return "green";
}

// Se mantiene el nombre anterior como alias -- mismo cálculo, ahora
// compartido con kilometrosRestantesSimple vía toneRestante.
export const toneHorasRestantes = toneRestante;

export const ETIQUETAS_URGENCIA: Record<UrgenciaPlan, string> = {
  vencido: "Vencido",
  proximo: "Próximo",
  al_dia: "Al día",
  inactivo: "Inactivo"
};

export const TONOS_URGENCIA: Record<UrgenciaPlan, TonoPill> = {
  vencido: "red",
  proximo: "yellow",
  al_dia: "green",
  inactivo: "gray"
};
