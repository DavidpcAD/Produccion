'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { Causa } from '@/lib/avance/types';

interface Props {
  codigo: string | null;
  causas: Causa[];
  pending: boolean;
  onClose: () => void;
  onConfirmar: (causaCodigo: string, nota: string | null) => void;
}

/**
 * Diálogo para congelar una obra (pasarla a 'en_espera'). Portado de
 * CongelarObraDialog de obrascontrol, usando el Modal del DS. Pide una causa
 * (catálogo, aplica_inactividad); el motivo queda en obra_estado.motivo_inactiva
 * vía POST /api/avance/obras/{codigo}/estado.
 */
export function CongelarObraDialog({ codigo, causas, pending, onClose, onConfirmar }: Props) {
  const opciones = causas.filter((c) => c.aplica_inactividad && c.activo);
  const [causaSel, setCausaSel] = useState<string | null>(null);
  const [nota, setNota] = useState('');

  useEffect(() => {
    if (codigo) {
      setCausaSel(null);
      setNota('');
    }
  }, [codigo]);

  return (
    <Modal
      open={codigo !== null}
      onClose={() => !pending && onClose()}
      title={codigo ? `Congelar obra — ${codigo}` : 'Congelar obra'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            disabled={!causaSel}
            loading={pending}
            onClick={() => causaSel && onConfirmar(causaSel, nota.trim() || null)}
          >
            Congelar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-body-sm text-ds-gray-400">
          La obra queda «en espera» y deja de contar como activa en el tablero hasta que se
          reactive.
        </p>

        <div>
          <label className="mb-2 block text-xs font-medium text-ds-ink">
            Motivo del congelamiento
          </label>
          <div className="grid grid-cols-1 gap-2">
            {opciones.map((c) => {
              const activa = causaSel === c.codigo;
              return (
                <button
                  key={c.codigo}
                  type="button"
                  onClick={() => setCausaSel(c.codigo)}
                  className={`flex items-center gap-2 rounded-ds border px-3 py-2.5 text-left text-sm transition-colors ${
                    activa
                      ? 'border-ds-yellow/50 bg-ds-yellow/10 text-ds-yellow-ink'
                      : 'border-ds-gray-200 bg-ds-surface hover:bg-ds-gray-100/50'
                  }`}
                >
                  <span className="font-mono text-xs text-ds-gray-400">{c.codigo}</span>
                  <span>{c.descripcion}</span>
                </button>
              );
            })}
          </div>
          {opciones.length === 0 && (
            <p className="rounded-ds border border-dashed border-ds-gray-200 p-3 text-center text-xs text-ds-gray-400">
              No hay causas marcadas como <code>aplica_inactividad</code> en el catálogo. Pedile al
              admin que marque alguna.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ds-ink">Nota (opcional)</label>
          <textarea
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Detalle del motivo…"
            className="w-full rounded-ds border border-ds-gray-200 px-3 py-2 text-sm text-ds-ink focus:border-black focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}
