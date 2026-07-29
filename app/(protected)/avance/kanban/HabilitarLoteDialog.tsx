'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import type { IniciarLoteBody } from '@/lib/avance/campo';

interface Props {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirmar: (body: IniciarLoteBody) => void;
}

const TIPO_OPCIONES = [
  { value: 'auto', label: 'Automático (según catálogo)' },
  { value: '1N-Techo', label: '1N-Techo' },
  { value: '1N-Azotea', label: '1N-Azotea' },
  { value: '2N-Techo', label: '2N-Techo' },
  { value: '2N-Azotea', label: '2N-Azotea' },
];

/**
 * Diálogo para habilitar (poner en ejecución) varias obras de una. El usuario
 * pega los códigos (uno por línea o separados por coma/espacio), elige el tipo
 * de casa ('auto' toma el de cada obra en el catálogo) y el sprint inicial.
 * Llama POST /api/avance/obras/iniciar-lote.
 */
export function HabilitarLoteDialog({ open, pending, onClose, onConfirmar }: Props) {
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<string>('auto');
  const [sprint, setSprint] = useState('1');

  useEffect(() => {
    if (open) {
      setTexto('');
      setTipo('auto');
      setSprint('1');
    }
  }, [open]);

  const codigos = texto
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  function confirmar() {
    if (codigos.length === 0) return;
    onConfirmar({
      codigos,
      tipo_casa: tipo as IniciarLoteBody['tipo_casa'],
      sprint_inicial: Number(sprint) || 1,
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title="Habilitar obras en lote"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={confirmar} loading={pending} disabled={codigos.length === 0}>
            Habilitar {codigos.length > 0 ? `(${codigos.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black">Códigos de obra</label>
          <textarea
            rows={5}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'Uno por línea o separados por coma.\nEj: VN-C.08, VN-C.09, VN-D.01'}
            className="w-full rounded-ds border border-ds-gray-200 px-3 py-2 font-mono text-sm text-black focus:border-black focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-ds-gray-400">
            {codigos.length} código{codigos.length === 1 ? '' : 's'} detectado
            {codigos.length === 1 ? '' : 's'}. Solo se habilitan los que existan en el catálogo.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Tipo de casa"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            options={TIPO_OPCIONES}
          />
          <Input
            label="Sprint inicial"
            type="number"
            min={1}
            max={50}
            value={sprint}
            onChange={(e) => setSprint(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
