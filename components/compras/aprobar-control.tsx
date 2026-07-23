'use client';
import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ds/Icon/Icon';

interface Props {
  onApprove: () => void;
  onReject?: () => void;
  approveLabel?: string;
  rejectLabel?: string;
  busy?: boolean;
  oneWay?: boolean; // solo aprobar (ej. aprobación en lote)
}

// Control de aprobación responsivo:
//  · Escritorio → botones del Design System (Rechazar / Aprobar).
//  · Celular    → gesto tipo Tinder: se arrastra la tarjeta (derecha = aprobar,
//                 izquierda = rechazar). En modo oneWay es un botón en ambos.
export function AprobarControl({ onApprove, onReject, approveLabel = 'Aprobar', rejectLabel = 'Rechazar', busy = false, oneWay = false }: Props) {
  const swipeable = !oneWay && !!onReject;
  return (
    <>
      {/* Escritorio: botones */}
      <div className="hidden sm:flex items-center justify-end gap-2">
        {swipeable && (
          <Button variant="danger" onClick={onReject} disabled={busy} icon={<Icon name="close" size="sm" color="currentColor" />}>
            {rejectLabel}
          </Button>
        )}
        <Button onClick={onApprove} loading={busy} icon={<Icon name="check" size="sm" color="currentColor" />}>
          {approveLabel}
        </Button>
      </div>

      {/* Celular */}
      <div className="sm:hidden">
        {swipeable ? (
          <SwipeApprove onApprove={onApprove} onReject={onReject!} approveLabel={approveLabel} rejectLabel={rejectLabel} busy={busy} />
        ) : (
          <Button className="w-full justify-center" onClick={onApprove} loading={busy} icon={<Icon name="check" size="sm" color="currentColor" />}>
            {approveLabel}
          </Button>
        )}
      </div>
    </>
  );
}

function SwipeApprove({ onApprove, onReject, approveLabel, rejectLabel, busy }: {
  onApprove: () => void; onReject: () => void; approveLabel: string; rejectLabel: string; busy: boolean;
}) {
  const x = useMotionValue(0);
  const THRESH = 96;
  // Fondo que va tiñendo verde (derecha) o rojo (izquierda) según el arrastre.
  const bg = useTransform(x, [-THRESH, -8, 8, THRESH],
    ['var(--ds-color-red-100, #c96c6c)', '#ffffff', '#ffffff', 'var(--ds-color-green-100, #add010)']);
  const rejectOpacity = useTransform(x, [-THRESH, -20, 0], [1, 0.4, 0]);
  const approveOpacity = useTransform(x, [0, 20, THRESH], [0, 0.4, 1]);

  function handleEnd(_e: unknown, info: PanInfo) {
    if (busy) { animate(x, 0); return; }
    if (info.offset.x > THRESH) { onApprove(); animate(x, 0); }
    else if (info.offset.x < -THRESH) { onReject(); animate(x, 0); }
    else animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 });
  }

  return (
    <div className="relative select-none touch-pan-y">
      {/* Etiquetas de fondo */}
      <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
        <motion.span style={{ opacity: rejectOpacity }} className="flex items-center gap-1 text-sm font-bold text-white">
          <Icon name="close" size="sm" color="currentColor" /> {rejectLabel}
        </motion.span>
        <motion.span style={{ opacity: approveOpacity }} className="flex items-center gap-1 text-sm font-bold text-black">
          {approveLabel} <Icon name="check" size="sm" color="currentColor" />
        </motion.span>
      </div>
      {/* Tarjeta arrastrable */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -THRESH - 20, right: THRESH + 20 }}
        dragElastic={0.15}
        style={{ x, background: bg }}
        onDragEnd={handleEnd}
        whileTap={{ scale: 0.99 }}
        className="relative z-[1] rounded-full border border-ds-gray-200 shadow-ds-01 h-14 flex items-center justify-center gap-2 cursor-grab active:cursor-grabbing"
      >
        {busy ? (
          <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="flex items-center gap-2 text-sm font-semibold text-ds-gray-500">
            <Icon name="back" size="sm" color="currentColor" />
            Deslizá para aprobar o rechazar
            <Icon name="arrow-right" size="sm" color="currentColor" />
          </span>
        )}
      </motion.div>
    </div>
  );
}
