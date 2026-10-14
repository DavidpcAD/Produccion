"use client";

// NOT-IN-DS: el DS no tiene un patrón de modal/drawer para escritorio — solo
// trae `Sheet`, que es un FAB que se convierte en hoja inferior pensada para
// mobile (402px). Para las pantallas de tabla de esta app (Equipos, OTs,
// Repuestos, Planes) se necesita un panel lateral de escritorio, así que este
// stub reutiliza `Button` del DS para su cabecera, y comparte con `Modal` la
// misma accesibilidad (portal, trampa de foco, Escape, scroll bloqueado).

import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { useDialogA11y } from "./useDialogA11y";

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onClose, contenedorRef);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 500 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "color-mix(in srgb, var(--ds-color-black) 45%, transparent)" }}
      />
      <div
        ref={contenedorRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(480px, 100vw)",
          background: "var(--ds-surface)",
          color: "var(--ds-text)",
          boxShadow: "var(--ds-shadow-03-big)",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "var(--ds-space-5)",
            borderBottom: "1px solid var(--ds-color-gray-100)"
          }}
        >
          <div>
            <div style={{ fontSize: "var(--ds-font-size-subtitle)", fontWeight: "var(--ds-font-weight-semibold)" }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: "var(--ds-font-size-body-sm)", color: "var(--ds-color-gray-400)", marginTop: 4 }}>{subtitle}</div>
            )}
          </div>
          <Button ariaLabel="Cerrar" layout="icon" size="sm" color="white" icon="close" onClick={onClose} />
        </div>
        <div style={{ padding: "var(--ds-space-5)", overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: "var(--ds-space-4) var(--ds-space-5)",
              borderTop: "1px solid var(--ds-color-gray-100)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--ds-space-2)"
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
