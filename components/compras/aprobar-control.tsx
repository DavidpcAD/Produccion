'use client';
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ds/Icon/Icon';

interface Props {
  onApprove: () => void;
  onReject?: () => void;
  approveLabel?: string;
  rejectLabel?: string;
  busy?: boolean;
  oneWay?: boolean;
  title?: string;
}

type Target = 'reject' | 'approve' | null;

// Aprobación responsiva:
//  · Escritorio → botones del Design System.
//  · Celular/tablet → gesto tipo Pinterest: MANTENÉS presionada la orden, aparecen las
//    opciones flotantes y —sin soltar— arrastrás hasta la que querés; al SOLTAR encima
//    se ejecuta. También sirve como tap (abre y tocás la opción).
export function AprobarControl({ onApprove, onReject, approveLabel = 'Aprobar', rejectLabel = 'Rechazar', busy = false, oneWay = false, title }: Props) {
  const twoWay = !oneWay && !!onReject;
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<Target>(null);
  const draggingRef = useRef(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);

  function hitTest(x: number, y: number): Target {
    const inside = (el: HTMLElement | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    if (inside(rejectRef.current)) return 'reject';
    if (inside(approveRef.current)) return 'approve';
    return null;
  }

  function clearHold() { if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; } }
  function fire(t: Target) {
    if (t === 'approve') onApprove();
    else if (t === 'reject') onReject?.();
  }

  function onPointerDown(e: React.PointerEvent) {
    if (busy) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    holdRef.current = setTimeout(() => { draggingRef.current = true; setHovered(null); setOpen(true); }, 240);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    setHovered(hitTest(e.clientX, e.clientY));
  }
  function onPointerUp(e: React.PointerEvent) {
    clearHold();
    if (draggingRef.current) {
      draggingRef.current = false;
      const t = hitTest(e.clientX, e.clientY);
      setOpen(false); setHovered(null);
      fire(t);
    } else {
      // Fue un tap corto → dejamos el overlay abierto para elegir tocando.
      setOpen(true);
    }
  }
  function onPointerCancel() { clearHold(); draggingRef.current = false; setHovered(null); setOpen(false); }

  const optBtn = (t: Exclude<Target, null>) => {
    const on = hovered === t;
    const isApprove = t === 'approve';
    return (
      'flex-1 rounded-ds-lg py-6 flex flex-col items-center gap-2 font-bold shadow-ds-03 transition-transform ' +
      (isApprove ? 'bg-brand text-black ' : 'bg-ds-red text-white ') +
      (on ? 'scale-105 ring-4 ring-white' : 'scale-100')
    );
  };

  return (
    <>
      {/* Escritorio: botones */}
      <div className="hidden sm:flex items-center justify-end gap-3">
        {twoWay && (
          <Button variant="outline" size="sm" onClick={onReject} disabled={busy} className="whitespace-nowrap">{rejectLabel}</Button>
        )}
        <Button size="sm" onClick={onApprove} loading={busy} icon={<Icon name="check" size="sm" color="currentColor" />} className="whitespace-nowrap">{approveLabel}</Button>
      </div>

      {/* Celular / tablet */}
      <div className="sm:hidden">
        {twoWay ? (
          <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            disabled={busy}
            style={{ touchAction: 'none' }}
            className="w-full h-12 rounded-full bg-black text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-60 select-none"
          >
            {busy ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Icon name="check" size="sm" color="currentColor" /> Mantené presionado para aprobar o rechazar</>}
          </button>
        ) : (
          <Button className="w-full justify-center" onClick={onApprove} loading={busy} icon={<Icon name="check" size="sm" color="currentColor" />}>{approveLabel}</Button>
        )}
      </div>

      {/* Overlay tipo Pinterest */}
      {twoWay && (
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[60] sm:hidden flex flex-col items-center justify-center gap-6 p-6"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { if (!draggingRef.current) setOpen(false); }}
              style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)', touchAction: 'none' }}
            >
              <motion.div
                initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 12 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-ds-lg bg-ds-surface shadow-ds-03 p-5 text-center select-none"
              >
                <p className="text-ds-gray-400 text-body-sm mb-1">Orden seleccionada</p>
                <p className="text-ds-ink font-bold text-sub-sm leading-tight">{title ?? 'Orden'}</p>
                <p className="text-ds-gray-400 text-body-sm mt-3">Arrastrá hasta una opción y soltá (o tocá):</p>
              </motion.div>

              <div className="flex items-stretch gap-4 w-full max-w-sm select-none" onClick={(e) => e.stopPropagation()}>
                <button ref={rejectRef} type="button" onClick={() => { setOpen(false); onReject?.(); }} className={optBtn('reject')}>
                  <span className="w-11 h-11 rounded-full bg-ds-surface/20 flex items-center justify-center"><Icon name="close" size="md" color="currentColor" /></span>
                  {rejectLabel}
                </button>
                <button ref={approveRef} type="button" onClick={() => { setOpen(false); onApprove(); }} className={optBtn('approve')}>
                  <span className="w-11 h-11 rounded-full bg-black/10 flex items-center justify-center"><Icon name="check" size="md" color="currentColor" /></span>
                  {approveLabel}
                </button>
              </div>

              <button type="button" onClick={() => setOpen(false)} className="text-white/70 text-sm font-semibold">Cancelar</button>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
