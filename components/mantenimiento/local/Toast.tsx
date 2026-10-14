"use client";

// NOT-IN-DS: Adelante Design System no tiene componente de Toast todavía
// (README lo marca como "Planned"). Este stub usa los tokens del DS para no
// desentonar, pero no vive en components/ds — candidato a que el equipo de
// diseño lo formalice más adelante.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type TipoToast = "exito" | "error" | "info";

interface ToastItem {
  id: number;
  mensaje: string;
  tipo: TipoToast;
}

interface ToastApi {
  exito: (mensaje: string) => void;
  error: (mensaje: string) => void;
  info: (mensaje: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// La duración depende del largo del texto, no es fija: con un tiempo fijo
// para todos, los avisos largos (el que trae el número con el que algo
// quedó registrado) se iban antes de poder anotarlos.
function vidaToast(texto: string): number {
  return Math.min(12000, 3200 + texto.length * 45);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const mostrar = useCallback((mensaje: string, tipo: TipoToast = "info") => {
    const id = ++idRef.current;
    setToasts((actual) => [...actual, { id, mensaje, tipo }]);
    setTimeout(() => {
      setToasts((actual) => actual.filter((t) => t.id !== id));
    }, vidaToast(mensaje));
  }, []);

  const value = useRef<ToastApi>({
    exito: (m) => mostrar(m, "exito"),
    error: (m) => mostrar(m, "error"),
    info: (m) => mostrar(m, "info")
  }).current;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 100, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tipo === "error" ? "alert" : "status"}
            aria-live={t.tipo === "error" ? "assertive" : "polite"}
            style={{
              minWidth: 220,
              maxWidth: 360,
              padding: "12px 16px",
              borderRadius: "var(--ds-radius-md)",
              color: "var(--ds-color-white)",
              background: t.tipo === "error" ? "var(--ds-color-red-200)" : t.tipo === "exito" ? "var(--ds-color-green-200)" : "var(--ds-color-black)",
              fontFamily: "var(--ds-font-family)",
              fontSize: "var(--ds-font-size-label)",
              boxShadow: "var(--ds-shadow-03-big)",
              animation: "ds-toast-in 180ms ease both"
            }}
          >
            {t.mensaje}
          </div>
        ))}
      </div>
      <style>{`@keyframes ds-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
