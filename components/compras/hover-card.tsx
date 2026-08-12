"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "bottom";
type Align = "center" | "start";

// Tooltip/popover flotante con portal a <body> (así NO lo recorta el overflow de la
// tabla). Aparece suave, tipo "gota de agua", al pasar el mouse o enfocar. Se
// posiciona con coordenadas fijas calculadas del ancla en cada apertura.
export function HoverCard({
  children,
  content,
  placement = "top",
  align = "center",
  variant = "droplet",
  maxWidth = 300,
  openDelay = 80,
  skipIfFits = false,
  className = "",
}: {
  children: ReactNode;
  content: ReactNode;
  placement?: Placement;
  align?: Align;
  variant?: "droplet" | "panel";
  maxWidth?: number;
  openDelay?: number;
  // Si true, no abre cuando el contenido del ancla ya se ve completo (no truncado).
  skipIfFits?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const show = useCallback(() => {
    clear();
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      if (skipIfFits) {
        const fit = el.querySelector<HTMLElement>("[data-fit]") ?? el;
        if (fit.scrollWidth <= fit.clientWidth + 1) return; // ya se ve completo
      }
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      let left: number;
      if (align === "start") {
        left = Math.min(Math.max(8, r.left), vw - maxWidth - 8);
      } else {
        const cx = r.left + r.width / 2;
        left = Math.min(Math.max(maxWidth / 2 + 8, cx), vw - maxWidth / 2 - 8);
      }
      const top = placement === "top" ? r.top : r.bottom;
      setPos({ left, top });
      setOpen(true);
    }, openDelay);
  }, [align, maxWidth, openDelay, placement, skipIfFits]);

  const hide = useCallback(() => { clear(); setOpen(false); }, []);

  useEffect(() => () => clear(), []);

  return (
    <span
      ref={ref}
      className={`hc-trigger ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && typeof document !== "undefined" && createPortal(
        <div className="oc-scope">
          <div
            className={`hc-pop hc-pop--${placement} hc-pop--${align} hc-pop--${variant}`}
            style={{ left: pos.left, top: pos.top, maxWidth }}
            role="tooltip"
          >
            <span className="hc-pop__arrow" aria-hidden />
            <div className="hc-pop__inner">{content}</div>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
