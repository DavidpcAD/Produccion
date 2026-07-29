'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { AvanceSubPartida, Causa } from '@/lib/avance/types';

interface Props {
  sub: AvanceSubPartida | null;
  causas: Causa[];
  pending: boolean;
  onClose: () => void;
  onConfirmar: (causaCodigo: string, nota: string | null) => void;
}

/**
 * Diálogo para marcar una sub-partida como "No cumplió" (NC) desde el Kanban.
 * Portado de RegistrarNCDialog de obrascontrol, usando el Modal del DS. La causa
 * (del catálogo, aplica_nc) es obligatoria; NO cambia el % de avance. Se guarda
 * vía el endpoint existente PUT /api/avance/obras/{codigo}/avance.
 */
export function RegistrarNCDialog({ sub, causas, pending, onClose, onConfirmar }: Props) {
  const opciones = causas.filter((c) => c.aplica_nc && c.activo);
  const [causaSel, setCausaSel] = useState<string | null>(null);
  const [nota, setNota] = useState('');

  useEffect(() => {
    if (sub) {
      setCausaSel(sub.nc_causa);
      setNota(sub.nc_nota ?? '');
    }
  }, [sub]);

  return (
    <Modal
      open={sub !== null}
      onClose={() => !pending && onClose()}
      title={sub ? `No cumplió — ${sub.codigo}` : 'No cumplió'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={!causaSel}
            loading={pending}
            onClick={() => causaSel && onConfirmar(causaSel, nota.trim() || null)}
          >
            Marcar NC
          </Button>
        </>
      }
    >
      {sub && (
        <div className="space-y-4">
          <p className="text-body-sm text-ds-gray-400">
            <span className="font-mono text-xs">{sub.codigo}</span> · {sub.nombre}. Registrá por qué
            no se cumplió el objetivo. El % de avance no cambia.
          </p>

          <div>
            <label className="mb-2 block text-xs font-medium text-black">
              Causa del no cumplimiento
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
                        ? 'border-ds-red/60 bg-ds-red/10 text-ds-red-200'
                        : 'border-ds-gray-200 bg-white hover:bg-ds-gray-100/50'
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
                No hay causas de NC configuradas.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-black">Nota (opcional)</label>
            <textarea
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Detalle de lo que pasó…"
              className="w-full rounded-ds border border-ds-gray-200 px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
