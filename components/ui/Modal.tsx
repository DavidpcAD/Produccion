'use client';
import { useEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './Button';
import { springs } from '@/lib/springs';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 'drawer' = panel pegado a la DERECHA, a toda altura (como el editor de RH). */
  variant?: 'center' | 'drawer';
}

const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl' };
// Ancho del drawer: el de su size, pero dejando SIEMPRE visible la página de atrás
// (como el editor de RH). En rem, espejo de la escala de Tailwind de arriba.
const anchosDrawer = { sm: '24rem', md: '28rem', lg: '42rem', xl: '56rem', '2xl': '72rem' };

// Lo que se puede enfocar dentro del panel. Se calcula en cada Tab y no una vez al
// abrir, porque el contenido cambia solo: el panel de Cuadrillas tiene pestañas y
// media docena de campos aparecen y desaparecen según cuál esté activa.
const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, footer, size = 'md', variant = 'center' }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  // A dónde devolver el foco al cerrar: al botón que abrió el modal. Sin esto,
  // quien navega con teclado cierra y aparece al principio de la página, y tiene
  // que volver a recorrerla entera para seguir donde estaba.
  const veniaDe = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Al abrir, el foco ENTRA al panel. Antes se quedaba en el <body>: el lector de
  // pantalla no anunciaba el diálogo y con el tabulador había que atravesar toda
  // la página de atrás para llegar a los campos.
  useEffect(() => {
    if (!open) return;
    veniaDe.current = document.activeElement as HTMLElement | null;
    // Un frame de espera: el panel entra animado y todavía no está en el DOM.
    const id = requestAnimationFrame(() => {
      const caja = panel.current;
      if (!caja) return;
      const primero = caja.querySelector<HTMLElement>(FOCUSABLES);
      (primero ?? caja).focus();
    });
    return () => {
      cancelAnimationFrame(id);
      // Al cerrar (o desmontar) el foco vuelve de donde salió, si sigue en pantalla.
      const destino = veniaDe.current;
      if (destino && document.contains(destino)) destino.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      // Encierro del tabulador: mientras el diálogo está abierto, el foco no se va
      // a la página de atrás — que está tapada por el velo y no se puede usar.
      const caja = panel.current;
      if (!caja) return;
      const lista = [...caja.querySelectorAll<HTMLElement>(FOCUSABLES)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!lista.length) { e.preventDefault(); caja.focus(); return; }
      const primero = lista[0], ultimo = lista[lista.length - 1];
      const actual = document.activeElement;
      if (!e.shiftKey && (actual === ultimo || !caja.contains(actual))) { e.preventDefault(); primero.focus(); }
      else if (e.shiftKey && (actual === primero || !caja.contains(actual))) { e.preventDefault(); ultimo.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        // z-[70]: por ENCIMA del menú lateral (.app-nav, z-index 60) y de su velo
        // (.app-nav-overlay, 55). Con z-50 el menú abierto en tablet se pintaba sobre
        // el modal y el velo del menú lo dejaba gris. Ver la escala en globals.css.
        <div className={`fixed inset-0 z-[70] flex ${variant === 'drawer' ? 'items-stretch justify-end' : 'items-center justify-center p-4'}`}>
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.settling}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={variant === 'drawer'
              ? 'relative w-full bg-ds-surface rounded-l-ds-lg shadow-ds-01 flex flex-col h-full max-h-full'
              : `relative w-full ${sizes[size]} bg-ds-surface rounded-ds-lg shadow-ds-01 flex flex-col max-h-[90vh]`}
            // El panel nunca tapa toda la pantalla: por angosta que sea la ventana,
            // la página de atrás queda visible a la izquierda (como el editor de RH).
            style={variant === 'drawer' ? { maxWidth: `min(${anchosDrawer[size]}, 100vw - 6rem)` } : undefined}
            initial={variant === 'drawer' ? { x: '100%' } : { opacity: 0, scale: 0.95, y: 12 }}
            animate={variant === 'drawer' ? { x: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={variant === 'drawer' ? { x: '100%' } : { opacity: 0, scale: 0.95, y: 12 }}
            transition={springs.expanding}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-ds-gray-100">
              <h2 className="text-sub-sm font-bold text-ds-ink">{title}</h2>
              <motion.button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="p-1.5 rounded-ds text-ds-gray-400 hover:text-ds-ink hover:bg-ds-gray-100 transition-colors"
                whileTap={{ scale: 0.9 }}
                transition={springs.snappy}
              >
                <X size={20} weight="bold" />
              </motion.button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className={`px-6 py-4 border-t border-ds-gray-100 flex justify-end gap-3 bg-ds-gray-100/50 ${variant === 'drawer' ? 'rounded-bl-ds-lg' : 'rounded-b-ds-lg'}`}>
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', danger, loading }: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-body text-ds-gray-500">{message}</p>
    </Modal>
  );
}

