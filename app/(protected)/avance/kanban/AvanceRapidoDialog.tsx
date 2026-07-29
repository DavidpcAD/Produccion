'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

const PRESETS = [0, 25, 50, 75, 100] as const;

export interface SubRapido {
  sub_partida_id: number;
  codigo: string;
  nombre: string;
  pct_completado: number;
  piso_pct: number;
}

interface Props {
  sub: SubRapido | null;
  pending: boolean;
  onClose: () => void;
  onConfirmar: (pct: number) => void;
}

/**
 * Diálogo rápido para capturar el % de una sub-partida desde el Kanban sin
 * navegar a la captura completa. Portado de AvanceRapidoDialog de obrascontrol,
 * usando el Modal del Adelante DS. Respeta el piso (mínimo del último cierre).
 */
export function AvanceRapidoDialog({ sub, pending, onClose, onConfirmar }: Props) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (sub) setPct(Math.round(sub.pct_completado));
  }, [sub]);

  const piso = sub?.piso_pct ?? 0;
  const bajoPiso = pct < piso;

  return (
    <Modal
      open={sub !== null}
      onClose={() => !pending && onClose()}
      title="Avance de la sub-partida"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirmar(pct)} loading={pending} disabled={bajoPiso}>
            Guardar
          </Button>
        </>
      }
    >
      {sub && (
        <div className="space-y-4">
          <p className="text-body-sm text-ds-gray-400">
            <span className="font-mono text-xs">{sub.codigo}</span> · {sub.nombre}
          </p>

          <div className="text-center">
            <span className="text-4xl font-bold tabular-nums text-ds-green-ink">{pct}</span>
            <span className="text-2xl font-semibold text-ds-green-ink">%</span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {PRESETS.map((v) => {
              const bloqueado = v < piso;
              return (
                <button
                  key={v}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => setPct(v)}
                  className={`h-9 rounded-ds border text-xs font-semibold tabular-nums transition-colors ${
                    pct === v
                      ? 'border-black bg-black text-white'
                      : bloqueado
                        ? 'cursor-not-allowed border-ds-gray-100 bg-ds-gray-100 text-ds-gray-300'
                        : 'border-ds-gray-200 bg-white text-ds-gray-500 hover:border-black'
                  }`}
                >
                  {v}%
                </button>
              );
            })}
          </div>

          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="w-full accent-brand"
            aria-label="Porcentaje de avance"
          />

          <div>
            <label className="mb-1.5 block text-xs font-medium text-black">Valor exacto</label>
            <input
              type="number"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) setPct(Math.max(0, Math.min(100, n)));
              }}
              className="h-10 w-full rounded-ds border border-ds-gray-200 px-3 text-sm text-black focus:border-black focus:outline-none"
            />
          </div>

          {piso > 0 && (
            <p className="text-[11px] text-ds-gray-400">
              El último cierre dejó esta sub-partida en {piso}%. No se puede bajar de ahí.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
