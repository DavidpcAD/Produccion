"use client";

// NOT-IN-DS: no hay componente de Tabla en el Adelante Design System (README:
// "Planned"). Sigue el patrón de la guía de UI de Compras Adelante (mismos
// tokens del DS, así que combina con Button/Card/Form):
// - Encabezado negro con esquinas de los extremos redondeadas.
// - Columnas ordenables (clic en el encabezado), con el criterio recordado
//   en sessionStorage por `tablaKey` — vence a los 30 min, como "en qué
//   estaba buscando" en vez de "cómo quiero ver esto" (eso sí se recordaría
//   toda la sesión, pero acá no hay show/hide de columnas todavía).
// - Sombras de scroll horizontal SIN JS, con background-attachment:local
//   (aparecen solas del lado que tiene contenido escondido).
// - Columna de acción pegada al borde derecho (position:sticky), opcional
//   por columna vía `sticky: true` — solo tiene sentido en tablas que de
//   verdad desbordan, y con poca especificidad para que el tinte de fila
//   (ej. "vencido") le gane y la celda pegada herede el color de su fila.
// - "Volver a la fila": si `tablaKey` coincide con lo último que se marcó
//   antes de entrar a un detalle (ver marcarFilaParaVolver), esa fila se
//   resalta 2.2s al volver.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";

export interface ColumnaTabla<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  sticky?: boolean;
  align?: "left" | "right";
}

interface EstadoOrden {
  columna: string;
  direccion: "asc" | "desc";
  guardadoEn: number;
}

const VENCIMIENTO_ORDEN_MS = 30 * 60 * 1000;

function leerOrdenGuardado(tablaKey?: string): EstadoOrden | null {
  if (!tablaKey || typeof window === "undefined") return null;
  try {
    const crudo = sessionStorage.getItem(`tabla:${tablaKey}:orden`);
    if (!crudo) return null;
    const guardado: EstadoOrden = JSON.parse(crudo);
    if (Date.now() - guardado.guardadoEn > VENCIMIENTO_ORDEN_MS) return null;
    return guardado;
  } catch {
    return null;
  }
}

function guardarOrden(tablaKey: string, columna: string, direccion: "asc" | "desc") {
  try {
    sessionStorage.setItem(`tabla:${tablaKey}:orden`, JSON.stringify({ columna, direccion, guardadoEn: Date.now() }));
  } catch {
    // sessionStorage puede fallar en navegación privada — simplemente no se recuerda.
  }
}

// Se llama ANTES de navegar a un detalle, desde la propia pantalla de lista
// (onRowClick), para que la tabla sepa a qué fila volver a resaltar.
export function marcarFilaParaVolver(tablaKey: string, id: string) {
  try {
    sessionStorage.setItem(`tabla:${tablaKey}:volver`, id);
  } catch {
    // no molesta si no se puede recordar — la fila simplemente no se resalta al volver.
  }
}

export function Table<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyMessage = "Sin resultados.",
  tablaKey
}: {
  columns: ColumnaTabla<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  tablaKey?: string;
}) {
  const [orden, setOrden] = useState<EstadoOrden | null>(() => leerOrdenGuardado(tablaKey));
  const [filaVuelta, setFilaVuelta] = useState<string | null>(null);
  const filaVueltaRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (!tablaKey || typeof window === "undefined") return;
    try {
      const id = sessionStorage.getItem(`tabla:${tablaKey}:volver`);
      if (id) {
        setFilaVuelta(id);
        sessionStorage.removeItem(`tabla:${tablaKey}:volver`);
        const quitar = setTimeout(() => setFilaVuelta(null), 2200);
        return () => clearTimeout(quitar);
      }
    } catch {
      // sin sessionStorage no hay "volver a la fila" — no es crítico.
    }
  }, [tablaKey]);

  useEffect(() => {
    if (filaVuelta && filaVueltaRef.current) {
      filaVueltaRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [filaVuelta]);

  const filasOrdenadas = useMemo(() => {
    if (!orden) return rows;
    const col = columns.find((c) => c.key === orden.columna);
    if (!col) return rows;
    const obtenerValor = col.sortValue ?? ((row: T) => (row as Record<string, unknown>)[col.key] as string | number);
    const copia = [...rows];
    copia.sort((a, b) => {
      const va = obtenerValor(a);
      const vb = obtenerValor(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""));
      return orden.direccion === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [rows, orden, columns]);

  function alClicEncabezado(col: ColumnaTabla<T>) {
    if (!col.sortValue && !(col.key in (rows[0] ?? {}))) return; // columna sin dato ordenable (ej. "acciones")
    const direccion: "asc" | "desc" = orden?.columna === col.key && orden.direccion === "asc" ? "desc" : "asc";
    const nuevo = { columna: col.key, direccion, guardadoEn: Date.now() };
    setOrden(nuevo);
    if (tablaKey) guardarOrden(tablaKey, col.key, direccion);
  }

  return (
    <div style={{ borderRadius: "var(--ds-radius-lg)", boxShadow: "var(--ds-shadow-01)", overflow: "hidden" }}>
      <div
        className="ds-table-wrap"
        style={{
          overflowX: "auto",
          backgroundColor: "var(--ds-surface)",
          backgroundImage:
            "linear-gradient(to right, var(--ds-surface), transparent 32px)," +
            "linear-gradient(to left, var(--ds-surface), transparent 32px)," +
            "linear-gradient(to right, color-mix(in srgb, var(--ds-text) 16%, transparent), transparent 14px)," +
            "linear-gradient(to left, color-mix(in srgb, var(--ds-text) 16%, transparent), transparent 14px)",
          backgroundPosition: "0 0, 100% 0, 0 0, 100% 0",
          backgroundRepeat: "no-repeat",
          backgroundSize: "32px 100%, 32px 100%, 14px 100%, 14px 100%",
          backgroundAttachment: "local, local, scroll, scroll"
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--ds-font-family)" }}>
          <thead>
            <tr style={{ background: "var(--ds-color-black)" }}>
              {columns.map((col, i) => {
                const esOrdenable = rows.length > 0 && col.key in (rows[0] as object);
                const activa = orden?.columna === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={esOrdenable ? () => alClicEncabezado(col) : undefined}
                    style={{
                      textAlign: col.align === "right" ? "right" : "left",
                      padding: "var(--ds-space-3) var(--ds-space-4)",
                      fontSize: "var(--ds-font-size-body-sm)",
                      fontWeight: "var(--ds-font-weight-semibold)",
                      color: "var(--ds-color-white)",
                      whiteSpace: "nowrap",
                      cursor: esOrdenable ? "pointer" : "default",
                      borderTopLeftRadius: i === 0 ? "var(--ds-radius-md)" : undefined,
                      borderTopRightRadius: i === columns.length - 1 ? "var(--ds-radius-md)" : undefined,
                      userSelect: "none"
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {col.header}
                      {esOrdenable && (
                        <Icon
                          name={activa && orden!.direccion === "asc" ? "open" : "close"}
                          size="sm"
                          color={activa ? "var(--ds-color-green-100)" : "rgba(255,255,255,0.35)"}
                        />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} style={{ padding: "var(--ds-space-6)", textAlign: "center", color: "var(--ds-color-gray-400)" }}>
                  {emptyMessage}
                </td>
              </tr>
            )}
            {filasOrdenadas.map((row) => {
              const id = getRowKey(row);
              const esVuelta = filaVuelta === id;
              return (
                <tr
                  key={id}
                  ref={esVuelta ? filaVueltaRef : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    borderTop: "1px solid var(--ds-color-gray-100)",
                    cursor: onRowClick ? "pointer" : "default",
                    background: esVuelta ? "color-mix(in srgb, var(--ds-color-green-100) 18%, transparent)" : "transparent",
                    transition: "background 400ms ease"
                  }}
                  onMouseEnter={(e) => {
                    if (onRowClick && !esVuelta) e.currentTarget.style.background = "var(--ds-color-gray-100)";
                  }}
                  onMouseLeave={(e) => {
                    if (!esVuelta) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={col.sticky ? "ds-col-fija" : undefined}
                      style={{
                        padding: "var(--ds-space-3) var(--ds-space-4)",
                        fontSize: "var(--ds-font-size-body-md)",
                        color: "var(--ds-text)",
                        verticalAlign: "middle",
                        textAlign: col.align === "right" ? "right" : "left",
                        background: col.sticky ? "inherit" : undefined
                      }}
                    >
                      {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as ReactNode}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type TonoPill = "gray" | "green" | "red" | "yellow" | "black";

const TONOS_PILL: Record<TonoPill, { bg: string; fg: string }> = {
  gray: { bg: "var(--ds-color-gray-100)", fg: "var(--ds-color-gray-500)" },
  green: { bg: "var(--ds-color-green-100)", fg: "var(--ds-color-white)" },
  red: { bg: "var(--ds-color-red-200)", fg: "var(--ds-color-white)" },
  yellow: { bg: "var(--ds-color-yellow)", fg: "var(--ds-color-black)" },
  black: { bg: "var(--ds-color-black)", fg: "var(--ds-color-white)" }
};

export function Pill({ children, tone = "gray" }: { children: ReactNode; tone?: TonoPill }) {
  const t = TONOS_PILL[tone] || TONOS_PILL.gray;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: "var(--ds-radius-xl)",
        background: t.bg,
        color: t.fg,
        fontSize: "var(--ds-font-size-body-sm)",
        fontWeight: "var(--ds-font-weight-semibold)",
        whiteSpace: "nowrap"
      }}
    >
      {/* El color nunca es el único portador de significado — un punto acompaña el texto. */}
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", opacity: 0.7 }} />
      {children}
    </span>
  );
}
