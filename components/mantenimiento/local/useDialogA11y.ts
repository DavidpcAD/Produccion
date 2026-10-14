"use client";

// Lo que hace falta para que un overlay (Modal, Drawer, ConfirmDialog) sea
// accesible de verdad, factorizado una sola vez:
// 1. Portal al <body> — un overlay position:fixed se posiciona contra el
//    viewport SOLO si ningún ancestro tiene transform/filter. La entrada
//    animada de .page rompía esto, así que el overlay tiene que vivir fuera.
// 2. Trampa de foco: Tab/Shift+Tab ciclan adentro, foco al primer elemento
//    al abrir, y de vuelta al disparador al cerrar.
// 3. Escape cierra (con onClose en un ref para que el efecto no se re-arme
//    en cada render y no robe el foco mientras el padre tipea).
// 4. Bloquea el scroll del fondo mientras está abierto.

import { useEffect, useRef } from "react";

const SELECTOR_ENFOCABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useDialogA11y(abierto: boolean, onClose: () => void, contenedorRef: React.RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const disparadorRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!abierto) return;
    disparadorRef.current = document.activeElement;

    const previoOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const primerFoco = contenedorRef.current?.querySelector<HTMLElement>(SELECTOR_ENFOCABLE);
    primerFoco?.focus();

    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !contenedorRef.current) return;
      const enfocables = Array.from(contenedorRef.current.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE));
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alTeclado);
    return () => {
      document.removeEventListener("keydown", alTeclado);
      document.body.style.overflow = previoOverflow;
      if (disparadorRef.current instanceof HTMLElement) disparadorRef.current.focus();
    };
  }, [abierto, contenedorRef]);
}
