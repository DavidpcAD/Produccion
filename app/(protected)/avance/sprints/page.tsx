'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { CatalogoTabs } from '@/components/layout/CatalogoTabs';
import { useToast } from '@/components/ui/Toast';
import type { SprintCatalogoDetalle } from '@/lib/avance/sprints';

/**
 * Admin · Catálogo de sprints — portado de obrascontrol (SprintsPantalla).
 * Secuencia global de sprints; marca/desmarca cada sprint como "de espera".
 *
 * La gestión de SEMANAS operativas (abrir semana / re-fijar línea base) se movió
 * al Kanban de Avance (Programación): /avance?vista=kanban.
 */
export default function SprintsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Sprints"
        subtitle="Catálogo global de sprints. La gestión de semanas operativas está en el Kanban de Avance."
      />

      <CatalogoTabs />

      <SeccionSprints />
    </PageShell>
  );
}

// ============================================================ Sprints
function SeccionSprints() {
  const { toast } = useToast();
  const [sprints, setSprints] = useState<SprintCatalogoDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<number | null>(null);

  const recargar = useCallback(() => {
    setCargando(true);
    fetch('/api/avance/sprints')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No autorizado'))))
      .then((d) => setSprints((d.sprints as SprintCatalogoDetalle[]) ?? []))
      .catch(() => toast('No se pudieron cargar los sprints.', 'error'))
      .finally(() => setCargando(false));
  }, [toast]);
  useEffect(() => recargar(), [recargar]);

  // Crear sprint nuevo (se agrega al final de la secuencia global).
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ nombre: '', categoria: 'CASA', descripcion: '', esEspera: false });
  const proximoNumero = useMemo(() => (sprints.length ? Math.max(...sprints.map((s) => s.numero_global)) + 1 : 1), [sprints]);

  async function crear() {
    if (!form.nombre.trim()) { toast('Poné un nombre al sprint.', 'warning'); return; }
    setCreando(true);
    try {
      const r = await fetch('/api/avance/sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          categoria: form.categoria.trim() || 'CASA',
          descripcion: form.descripcion.trim() || null,
          es_espera: form.esEspera,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast(d.error || 'No se pudo crear el sprint', 'error'); return; }
      toast(`Sprint ${d.codigo ?? ''} creado. Asignalo a los tipos de casa y ponele pesos.`, 'success');
      setNuevoOpen(false);
      setForm({ nombre: '', categoria: 'CASA', descripcion: '', esEspera: false });
      recargar();
    } finally { setCreando(false); }
  }

  async function toggleEspera(s: SprintCatalogoDetalle, esEspera: boolean) {
    if (esEspera && s.criticas > 0) {
      return toast(
        `El sprint ${s.numero_global} tiene ${s.criticas} sub-partida(s) crítica(s). Un sprint de espera no puede tenerlas.`,
        'error',
      );
    }
    setGuardando(s.numero_global);
    try {
      const r = await fetch(`/api/avance/sprints/${s.numero_global}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ es_espera: esEspera }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      setSprints((xs) =>
        xs.map((x) => (x.numero_global === s.numero_global ? { ...x, es_espera: esEspera } : x)),
      );
      toast(
        `Sprint ${s.numero_global}: ${esEspera ? 'marcado' : 'desmarcado'} como espera.`,
        'success',
      );
    } catch (e) {
      toast(`No se pudo actualizar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(null);
    }
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sub-sm font-bold">Catálogo de sprints</h2>
        <Button size="sm" onClick={() => setNuevoOpen(true)}>+ Nuevo sprint</Button>
      </div>
      <p className="mb-4 text-sm text-ds-gray-500">
        Secuencia global de sprints. Marcá un sprint como <strong>de espera</strong> (colado/curado)
        — no debe tener sub-partidas. La asignación de sub-partidas a cada sprint se hace en
        Sub-partidas.
      </p>

      <div className="overflow-x-auto rounded-ds border border-ds-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-ds-gray-100 text-left">
            <tr>
              <th className="px-3 py-2 text-center">#</th>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2 text-center">Críticas</th>
              <th className="px-3 py-2 text-center">De espera</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center">
                  <Skeleton className="h-4 w-48 mx-auto" rounded="rounded-full" />
                </td>
              </tr>
            )}
            {!cargando && sprints.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ds-gray-400">
                  Sin sprints en el catálogo.
                </td>
              </tr>
            )}
            {!cargando &&
              sprints.map((s) => (
                <tr
                  key={s.numero_global}
                  className={`border-t border-ds-gray-100 ${s.es_espera ? 'bg-ds-yellow/10' : ''}`}
                >
                  <td className="px-3 py-2 text-center font-mono font-semibold tabular-nums">
                    {s.numero_global}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ds-gray-500">{s.codigo}</td>
                  <td className="px-3 py-2">{s.nombre}</td>
                  <td className="px-3 py-2 text-xs text-ds-gray-500">{s.categoria}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {s.criticas > 0 ? s.criticas : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={s.es_espera}
                      disabled={guardando === s.numero_global}
                      onChange={(e) => toggleEspera(s, e.target.checked)}
                      className="h-4 w-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        title="Nuevo sprint"
        footer={
          <>
            <Button variant="outline" onClick={() => setNuevoOpen(false)}>Cancelar</Button>
            <Button loading={creando} disabled={!form.nombre.trim()} onClick={crear}>Crear sprint</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Nombre" value={form.nombre} required placeholder="Ej. Acabados finos"
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Categoría" value={form.categoria} placeholder="CASA"
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} />
            <div className="flex items-end pb-3">
              <label className="flex items-center gap-2 text-sm text-ds-ink cursor-pointer">
                <input type="checkbox" checked={form.esEspera}
                  onChange={(e) => setForm((f) => ({ ...f, esEspera: e.target.checked }))}
                  className="h-4 w-4 accent-brand" />
                De espera (colado/curado — sin sub-partidas)
              </label>
            </div>
          </div>
          <Input label="Descripción (opcional)" value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
          <p className="text-xs text-ds-gray-400">
            Se agrega al final de la secuencia como <strong>sprint #{proximoNumero}</strong>. Después
            asignalo a los tipos de casa (pestaña <strong>Tipos de casa</strong>) y ponele sus pesos
            (pestaña <strong>Pesos</strong>).
          </p>
        </div>
      </Modal>
    </section>
  );
}
