"use client";

// NOT-IN-DS: el DS no tiene modal (README: "Planned"). Portal al <body>,
// trampa de foco, Escape, scroll del fondo bloqueado — ver useDialogA11y.
// `min-width: 0` en .modal es a propósito: es un item de grid centrado, y un
// item de grid tiene min-width:auto por defecto — una tabla adentro lo
// estira más allá de su max-width y el diálogo sale cortado por los lados.

import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "./useDialogA11y";

export function Modal({
  open,
  title,
  wide,
  onClose,
  footer,
  children
}: {
  open: boolean;
  title: string;
  wide?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  useDialogA11y(open, onClose, contenedorRef);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "grid",
        placeItems: "center",
        background: "color-mix(in srgb, var(--ds-color-black) 45%, transparent)",
        padding: "var(--ds-space-4)"
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contenedorRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="modal"
        style={{
          minWidth: 0,
          width: "100%",
          maxWidth: wide ? 720 : 480,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--ds-surface)",
          color: "var(--ds-text)",
          borderRadius: "var(--ds-radius-lg)",
          boxShadow: "var(--ds-shadow-03-big)"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--ds-space-5)",
            borderBottom: "1px solid var(--ds-color-gray-100)"
          }}
        >
          <h2 id={tituloId} style={{ margin: 0, fontSize: "var(--ds-font-size-subtitle)", fontWeight: "var(--ds-font-weight-semibold)" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ds-color-gray-400)", fontSize: 22, lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "var(--ds-space-5)", overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--ds-space-2)",
              padding: "var(--ds-space-4) var(--ds-space-5)",
              borderTop: "1px solid var(--ds-color-gray-100)"
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
