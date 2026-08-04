'use client';

import { useEffect, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type {
  SprintCatalogo,
  TipoCasaSprints,
  TiposCasaResponse,
} from '@/lib/avance/tipos-casa';

/** Peso de referencia por sprint = 100% / total (string). */
function pesoRef(total: number): string {
  return total > 0 ? `${(100 / total).toFixed(1)}% por sprint` : '—';
}

/**
 * Admin · Tipos de Casa — qué sprints (de la secuencia global) participan en
 * cada tipo de casa, su total y el peso de referencia por sprint. Editable.
 * Portado de obrascontrol `TiposCasaPantalla`.
 */
export default function TiposCasaPage() {
  const { toast } = useToast();
  const [tipos, setTipos] = useState<TipoCasaSprints[]>([]);
  const [catalogo, setCatalogo] = useState<SprintCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<TipoCasaSprints | null>(null);

  function recargar() {
    setCargando(true);
    fetch('/api/avance/tipos-casa')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No autorizado'))))
      .then((d: TiposCasaResponse) => {
        setTipos(d.tipos ?? []);
        setCatalogo(d.catalogo ?? []);
      })
      .catch(() => toast('No se pudieron cargar los tipos de casa.', 'error'))
      .finally(() => setCargando(false));
  }
  useEffect(recargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageShell>
      <PageHeader
        title="Tipos de casa"
        subtitle="Qué sprints (de la secuencia global) participan en cada tipo de casa. El peso de referencia por sprint = 100% / total de sprints."
      />

      <div className="overflow-x-auto rounded-ds border border-ds-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-ds-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Tipo de casa</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2 text-center">Total sprints</th>
              <th className="px-3 py-2">Peso de referencia</th>
              <th className="px-3 py-2">Sprints permitidos</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ds-gray-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && tipos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ds-gray-400">
                  Sin tipos de casa.
                </td>
              </tr>
            )}
            {!cargando &&
              tipos.map((t) => (
                <tr key={t.tipo_casa} className="border-t border-ds-gray-100">
                  <td className="px-3 py-2">
                    <span className="rounded-ds bg-ds-gray-100 px-2 py-0.5 font-mono text-xs">
                      {t.tipo_casa}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ds-gray-500">
                    {t.descripcion ?? '—'} · {t.sprints.length} semanas
                  </td>
                  <td className="px-3 py-2 text-center text-sub-sm font-semibold tabular-nums">
                    {t.sprints.length}
                  </td>
                  <td className="px-3 py-2">{pesoRef(t.sprints.length)}</td>
                  <td className="max-w-md px-3 py-2 text-xs text-ds-gray-500">
                    {t.sprints.join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditando(t)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <EditarModal
          tipo={editando}
          catalogo={catalogo}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}
    </PageShell>
  );
}

function EditarModal({
  tipo,
  catalogo,
  onClose,
  onGuardado,
}: {
  tipo: TipoCasaSprints;
  catalogo: SprintCatalogo[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const [sel, setSel] = useState<Set<number>>(new Set(tipo.sprints));
  const [guardando, setGuardando] = useState(false);

  function toggle(n: number) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  async function guardar() {
    setGuardando(true);
    try {
      const r = await fetch(`/api/avance/tipos-casa/${encodeURIComponent(tipo.tipo_casa)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sprints: [...sel] }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast(`${tipo.tipo_casa}: ${sel.size} sprints guardados.`, 'success');
      onGuardado();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  const total = sel.size;
  const ordenado = [...catalogo].sort((a, b) => a.numero_global - b.numero_global);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-ds bg-ds-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sub-sm font-bold">Sprints de {tipo.tipo_casa}</h2>
        <p className="mt-1 text-sm text-ds-gray-500">
          Marcá los sprints (de la secuencia global) que participan en este tipo de casa. Total:{' '}
          <strong>{total}</strong> · peso de referencia <strong>{pesoRef(total)}</strong>.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {ordenado.map((c) => {
            const checked = sel.has(c.numero_global);
            return (
              <button
                key={c.numero_global}
                type="button"
                onClick={() => toggle(c.numero_global)}
                className={`flex items-center gap-2 rounded-ds border px-2 py-1.5 text-left text-xs transition-colors ${
                  checked
                    ? 'border-black bg-ds-gray-100'
                    : 'border-ds-gray-200 bg-ds-surface hover:bg-ds-gray-100'
                }`}
              >
                <input type="checkbox" checked={checked} readOnly className="pointer-events-none" />
                <span className="min-w-0">
                  <span className="font-mono font-semibold">{c.numero_global}</span>{' '}
                  <span className="text-ds-gray-500">{c.nombre}</span>
                  {c.es_espera && <span className="ml-1 text-ds-gray-400">(espera)</span>}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={guardando}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
