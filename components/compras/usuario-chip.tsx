"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { iniciales } from "@/lib/compras/helpers";

// Avatar de iniciales que, al pasar el mouse (o enfocar), se expande EN LA MISMA
// LÍNEA a un pill con el nombre completo — sin tooltip flotante. El pill se ancla
// exactamente sobre el avatar y crece hacia la derecha; va en un portal para que
// nunca lo recorte el overflow de la tabla.
export function UsuarioChip({ nombre }: { nombre: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; h: number }>({ left: 0, top: 0, h: 30 });

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const show = useCallback(() => {
    clear();
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ left: r.left, top: r.top, h: r.height });
      setOpen(true);
    }, 60);
  }, []);
  const hide = useCallback(() => { clear(); setOpen(false); }, []);
  useEffect(() => () => clear(), []);

  const ini = iniciales(nombre);
  return (
    <span
      ref={ref}
      className="sol-user"
      tabIndex={0}
      aria-label={nombre}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span className="sol-user__ini" aria-hidden>{ini}</span>
      {open && typeof document !== "undefined" && createPortal(
        <div className="oc-scope">
          <span className="sol-userpop" style={{ left: pos.left, top: pos.top, height: pos.h }}>
            <span className="sol-userpop__ini" aria-hidden>{ini}</span>
            <span className="sol-userpop__name">{nombre}</span>
          </span>
        </div>,
        document.body,
      )}
    </span>
  );
}
