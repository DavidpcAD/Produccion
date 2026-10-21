"use client";

// Historial de fallas: qué OT cuenta como falla, carga de los tipos de falla
// y las series (colores) del gráfico. Lo usan la pantalla Fallas, la ficha del
// equipo y el detalle de OT.
//
// Regla (decidida con Steven, 2026-10-21): es FALLA toda OT correctiva, más
// cualquier otra OT a la que Mantenimiento le asigne un tipo de falla (ej. un
// preventivo donde se encontró algo roto). Las canceladas NO cuentan (suelen
// ser reportes por error o duplicados). La fecha de la falla es la apertura.

import { useCallback, useEffect, useState } from "react";
import { apiGet, aplanarDocs } from "./api";
import type { OrdenTrabajo, TipoFalla } from "./types";

export function esFalla(ot: OrdenTrabajo): boolean {
  if (ot.estado === "cancelada") return false;
  return ot.tipo === "correctivo" || !!ot.tipoFallaId;
}

export function useTiposFalla() {
  const [tipos, setTipos] = useState<TipoFalla[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      const r = await apiGet("/api/tiposFalla");
      setTipos(aplanarDocs<TipoFalla>(r));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    let vigente = true;
    apiGet("/api/tiposFalla")
      .then((r) => vigente && setTipos(aplanarDocs<TipoFalla>(r)))
      .catch((err) => vigente && setError((err as Error).message));
    return () => {
      vigente = false;
    };
  }, []);

  return { tipos, error, recargar };
}

// ── Series del gráfico ─────────────────────────────────────────────────────
// Colores validados con el validador de paleta (dataviz) en claro y oscuro.
// Solo 3 tipos con color propio: los 3 primeros tonos de la paleta pasan
// TODOS los pares (las líneas se cruzan), un 4.º tono ya no. El resto de los
// tipos se agrupa en "Otras" (gris continuo) y "Sin clasificar" va en gris
// punteado. Ver mnt-fal en FallasPorDia.css.
export const MAX_TIPOS_CON_COLOR = 3;
export const SIN_CLASIFICAR = "sin";
export const OTRAS = "otras";

export interface SerieFalla {
  clave: string; // id del tipo, OTRAS o SIN_CLASIFICAR
  etiqueta: string;
  clase: string; // sufijo CSS del color: t1 | t2 | t3 | otras | sin
}

/**
 * Elige los tipos con color propio según el total HISTÓRICO de fallas (todas
 * las OTs, sin filtros), para que cambiar el rango o el equipo NO repinte las
 * líneas: el color sigue al tipo, no a su puesto en la vista actual.
 */
export function seriesDeFallas(fallas: OrdenTrabajo[], tipos: TipoFalla[]): SerieFalla[] {
  const conteo = new Map<string, number>();
  for (const ot of fallas) if (ot.tipoFallaId) conteo.set(ot.tipoFallaId, (conteo.get(ot.tipoFallaId) ?? 0) + 1);
  const principales = [...conteo.entries()]
    .sort((a, b) => b[1] - a[1] || nombreTipo(a[0], tipos).localeCompare(nombreTipo(b[0], tipos)))
    .slice(0, MAX_TIPOS_CON_COLOR)
    .map(([id], i) => ({ clave: id, etiqueta: nombreTipo(id, tipos), clase: `t${i + 1}` }));
  const hayOtras = conteo.size > MAX_TIPOS_CON_COLOR;
  return [
    ...principales,
    ...(hayOtras ? [{ clave: OTRAS, etiqueta: "Otras", clase: "otras" }] : []),
    { clave: SIN_CLASIFICAR, etiqueta: "Sin clasificar", clase: "sin" }
  ];
}

/** A qué serie va una falla dada la lista de series. */
export function serieDe(ot: OrdenTrabajo, series: SerieFalla[]): string {
  if (!ot.tipoFallaId) return SIN_CLASIFICAR;
  return series.some((s) => s.clave === ot.tipoFallaId) ? ot.tipoFallaId : OTRAS;
}

export function nombreTipo(id: string | null | undefined, tipos: TipoFalla[]): string {
  if (!id) return "Sin clasificar";
  return tipos.find((t) => t.id === id)?.nombre ?? "Tipo desconocido";
}
