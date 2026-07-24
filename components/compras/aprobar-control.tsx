'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ds/Icon/Icon';

interface Props {
  onApprove: () => void;
  onReject?: () => void;
  approveLabel?: string;
  rejectLabel?: string;
  busy?: boolean;
  oneWay?: boolean;    // solo aprobar (ej. aprobación en lote)
  title?: string;      // texto de la orden a mostrar en el overlay móvil
}

// Control de aprobación responsivo:
//  · Escritorio → botones del Design System (Rechazar / Aprobar).
//  · Celular/tablet → patrón tipo Pinterest: se toca la orden, se "levanta" con el fondo
//    oscurecido y aparecen las opciones flotantes (Aprobar / Rechazar) para elegir.
export function AprobarControl({ onApprove, onReject, approveLabel = 'Aprobar', rejectLabel = 'Rechazar', busy = false, oneWay = false, title }: Props) {
  const twoWay = !oneWay && !!onReject;
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Escritorio: botones */}
      <div className="hidden sm:flex items-center justify-end gap-2">
        {twoWay && (
          <Button variant="danger" onClick={onReject} disabled={busy} icon={<Icon name="close" size="sm" color="currentColor" />}>
            {rejectLabel}
          </Button>
        )}
        <Button onClick={onApprove} loading={busy} icon={<Icon name="check" size="sm" color="currentColor" />}>
          {approveLabel}
        </Button>
      </div>

      {/* Celular / tablet */}
      <div className="sm:hidden">
        {twoWay ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={busy}
            className="w-full h-12 rounded-full bg-black text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-60"
          >
            {busy ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Icon name="check" size="sm" color="currentColor" /> Revisar orden</>}
          </button>
        ) : (
          <Button className="w-full justify-center" onClick={onApprove} loading={busy} icon={<Icon name="check" size="sm" color="currentColor" />}>
            {approveLabel}
          </Button>
        )}
      </div>

      {/* Overlay tipo Pinterest (móvil): orden resaltada + acciones flotantes */}
      {twoWay && (
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[60] sm:hidden flex flex-col items-center justify-center gap-6 p-6"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
            >
              {/* Tarjeta de la orden "levantada" */}
              <motion.div
                initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 12 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-ds-lg bg-white shadow-ds-03 p-5 text-center"
              >
                <p className="text-ds-gray-400 text-body-sm mb-1">Orden seleccionada</p>
                <p className="text-black font-bold text-lg leading-tight">{title ?? 'Orden'}</p>
                <p className="text-ds-gray-400 text-body-sm mt-3">Elegí una acción:</p>
              </motion.div>

              {/* Acciones flotantes grandes */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                transition={{ delay: 0.04 }}
                onClick={(e) => e.stopPropagation()}
                className="flex items-stretch gap-4 w-full max-w-sm"
              >
                <button
                  type="button"
                  onClick={() => { setOpen(false); onReject?.(); }}
                  className="flex-1 rounded-ds-lg bg-ds-red text-white py-5 flex flex-col items-center gap-2 font-bold active:scale-95 transition shadow-ds-03"
                >
                  <span className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center"><Icon name="close" size="md" color="currentColor" /></span>
                  {rejectLabel}
                </button>
                <button
                  type="button"
                  onClick={() => { setOpen(false); onApprove(); }}
                  className="flex-1 rounded-ds-lg bg-brand text-black py-5 flex flex-col items-center gap-2 font-bold active:scale-95 transition shadow-ds-03"
                >
                  <span className="w-11 h-11 rounded-full bg-black/10 flex items-center justify-center"><Icon name="check" size="md" color="currentColor" /></span>
                  {approveLabel}
                </button>
              </motion.div>

              <button type="button" onClick={() => setOpen(false)} className="text-white/70 text-sm font-semibold">Cancelar</button>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
