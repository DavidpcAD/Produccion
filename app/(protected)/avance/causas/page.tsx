'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import type { Causa } from '@/lib/avance/causas';

/**
 * Causas — administración del catálogo (portado de obrascontrol
 * CausasPantalla.tsx). Motivos de no-cumplimiento (NC) e inactividad que el
 * personal selecciona al registrar avances. CRUD contra /api/avance/causas.
 */
export default function CausasPage() {
  const { toast } = useToast();
  const [causas, setCausas] = useState<Causa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editar, setEditar] = useState<Causa | 'nueva' | null>(null);
  const [eliminar, setEliminar] = useState<Causa | null>(null);
  const [borrando, setBorrando] = useState(false);

  function recargar() {
    setCargando(true);
    fetch('/api/avance/causas')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setCausas((d.data as Causa[]) ?? []))
      .catch(() => toast('No se pudieron cargar las causas.', 'error'))
      .finally(() => setCargando(false));
  }
  useEffect(recargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmarEliminar() {
    if (!eliminar) return;
    setBorrando(true);
    try {
      const r = await fetch(`/api/avance/causas/${eliminar.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Causa eliminada.', 'success');
      setEliminar(null);
      recargar();
    } catch (e) {
      toast(`No se pudo eliminar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBorrando(false);
    }
  }

  return (
    <main className="page mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Causas</h1>
          <p className="text-ds-gray-500">
            Motivos de no-cumplimiento (NC) e inactividad que el personal selecciona al registrar
            avances.
          </p>
        </div>
        <Button onClick={() => setEditar('nueva')}>+ Nueva causa</Button>
      </div>

      <Table<Causa>
        columns={[
          {
            key: 'orden',
            header: 'Orden',
            render: (c) => <span className="tabular-nums text-ds-gray-500">{c.orden}</span>,
          },
          {
            key: 'codigo',
            header: 'Código',
            render: (c) => <span className="font-mono text-sm">{c.codigo}</span>,
          },
          { key: 'descripcion', header: 'Descripción' },
          { key: 'aplica_nc', header: 'NC', render: (c) => (c.aplica_nc ? '✓' : '—') },
          {
            key: 'aplica_inactividad',
            header: 'Inactividad',
            render: (c) => (c.aplica_inactividad ? '✓' : '—'),
          },
          {
            key: 'activo',
            header: 'Estado',
            render: (c) =>
              c.activo ? (
                <Badge variant="green" dot>
                  Activa
                </Badge>
              ) : (
                <Badge variant="gray" dot>
                  Inactiva
                </Badge>
              ),
          },
          {
            key: 'id',
            header: '',
            render: (c) => (
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="text-sm font-medium text-black hover:underline"
                  onClick={() => setEditar(c)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="text-sm font-medium text-ds-red hover:underline"
                  onClick={() => setEliminar(c)}
                >
                  Eliminar
                </button>
              </div>
            ),
          },
        ]}
        data={causas}
        keyField="id"
        loading={cargando}
        emptyMessage="No hay causas en el catálogo. Creá la primera."
      />

      {editar && (
        <ModalCausa
          causa={editar === 'nueva' ? null : editar}
          onClose={() => setEditar(null)}
          onGuardado={() => {
            setEditar(null);
            recargar();
          }}
        />
      )}

      <ConfirmModal
        open={eliminar !== null}
        onClose={() => setEliminar(null)}
        onConfirm={confirmarEliminar}
        title="Eliminar causa"
        message={
          eliminar
            ? `¿Eliminar la causa "${eliminar.codigo} · ${eliminar.descripcion}"? Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar"
        danger
        loading={borrando}
      />
    </main>
  );
}

// ---------------------------------------------------------------- Modal
function ModalCausa({
  causa,
  onClose,
  onGuardado,
}: {
  causa: Causa | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const esEdicion = causa !== null;
  const [codigo, setCodigo] = useState(causa?.codigo ?? '');
  const [descripcion, setDescripcion] = useState(causa?.descripcion ?? '');
  const [aplicaNc, setAplicaNc] = useState(causa?.aplica_nc ?? true);
  const [aplicaInact, setAplicaInact] = useState(causa?.aplica_inactividad ?? false);
  const [orden, setOrden] = useState(String(causa?.orden ?? 0));
  const [activo, setActivo] = useState(causa?.activo ?? true);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (codigo.trim().length < 1 || descripcion.trim().length < 2) {
      toast('Código y descripción son obligatorios.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const body = {
        codigo: codigo.trim(),
        descripcion: descripcion.trim(),
        aplica_nc: aplicaNc,
        aplica_inactividad: aplicaInact,
        orden: Number(orden) || 0,
        ...(esEdicion ? { activo } : {}),
      };
      const r = await fetch(
        esEdicion ? `/api/avance/causas/${causa!.id}` : '/api/avance/causas',
        {
          method: esEdicion ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast(esEdicion ? 'Causa actualizada.' : 'Causa creada.', 'success');
      onGuardado();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !guardando && onClose()}
      title={esEdicion ? 'Editar causa' : 'Nueva causa'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={guardando}>
            {esEdicion ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Código"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="font-mono"
          />
          <div className="col-span-2">
            <Input
              label="Descripción"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
        </div>
        <div className="w-28">
          <Input
            label="Orden"
            type="number"
            min={0}
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2 border-t border-ds-gray-100 pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aplicaNc}
              onChange={(e) => setAplicaNc(e.target.checked)}
            />
            Aplica a no-cumplimiento (NC)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aplicaInact}
              onChange={(e) => setAplicaInact(e.target.checked)}
            />
            Aplica a inactividad de obra
          </label>
          {esEdicion && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
              />
              Activa
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}
