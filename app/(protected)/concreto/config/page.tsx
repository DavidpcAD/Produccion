'use client';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { PageShell, PageHeader } from '@/components/layout/Page';
import type { ActividadLab } from '@/lib/concreto/tipos';
import {
  COMPARADORES_UMBRAL,
  type ComparadorUmbral,
  type DensidadMaterial,
  type UmbralAlerta,
} from '@/lib/concreto/tipos-config';

// Configuración del módulo Concreto — 3 tabs:
//   Actividades  (pro_lab.actividades)        crear/editar/activar
//   Umbrales     (pro_hor.umbrales_alerta)    editar valor/comparador/unidad
//   Densidades   (pro_hor.densidades_materiales) crear/editar densidades
// Los botones de edición se ocultan si nivelAdmin < 4 (los datos igual se ven).

type Tab = 'actividades' | 'umbrales' | 'densidades';

const TABS: { id: Tab; label: string }[] = [
  { id: 'actividades', label: 'Actividades' },
  { id: 'umbrales', label: 'Umbrales' },
  { id: 'densidades', label: 'Densidades' },
];

// Etiquetas legibles de cada comparador de umbral.
const COMPARADOR_LABEL: Record<ComparadorUmbral, string> = {
  gte_abs: '|valor| ≥ umbral',
  gt_abs: '|valor| > umbral',
  gte: 'valor ≥ umbral',
  gt: 'valor > umbral',
  lte: 'valor ≤ umbral',
  lt: 'valor < umbral',
};

export default function ConfigConcretoPage() {
  const session = useSession();
  const puede = !!session && session.nivelAdmin >= 4;
  const [tab, setTab] = useState<Tab>('actividades');

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Configuración"
        subtitle="Actividades de laboratorio, umbrales de alerta y densidades de materiales."
      />

      {/* Tabs simples con estado */}
      <div role="tablist" aria-label="Secciones de configuración" className="flex items-center gap-1 border-b border-ds-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              'px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ' +
              (tab === t.id
                ? 'border-brand text-ds-ink'
                : 'border-transparent text-ds-gray-400 hover:text-ds-ink')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'actividades' && <TabActividades puede={puede} />}
      {tab === 'umbrales' && <TabUmbrales puede={puede} />}
      {tab === 'densidades' && <TabDensidades puede={puede} />}
    </PageShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Actividades
// ═══════════════════════════════════════════════════════════════════════════

const EMPTY_ACT = { nombre: '', orden: '0' };

function TabActividades({ puede }: { puede: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<ActividadLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_ACT });
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch('/api/concreto/lab/actividades?incluye_inactivas=true').then((r) =>
        r.json(),
      );
      if (d.error) throw new Error(d.error);
      setItems(d.data ?? []);
    } catch {
      toast('Error cargando actividades', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  function abrirNueva() {
    setEditId(null);
    setForm({ ...EMPTY_ACT });
    setOpen(true);
  }
  function abrirEditar(a: ActividadLab) {
    setEditId(a.id);
    setForm({ nombre: a.nombre, orden: String(a.orden) });
    setOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) {
      toast('El nombre es requerido', 'warning');
      return;
    }
    setSaving(true);
    try {
      const editing = editId != null;
      const res = await fetch(
        editing ? `/api/concreto/lab/actividades/${editId}` : '/api/concreto/lab/actividades',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: form.nombre.trim(), orden: Number(form.orden) || 0 }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(d.error || 'No se pudo guardar', 'error');
        return;
      }
      toast(editing ? 'Actividad actualizada' : 'Actividad creada', 'success');
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActivo(a: ActividadLab) {
    const res = await fetch(`/api/concreto/lab/actividades/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !a.activo }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(d.error || 'No se pudo actualizar', 'error');
      return;
    }
    toast(a.activo ? 'Actividad desactivada' : 'Actividad activada', 'success');
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-ds-gray-400 text-body-sm">{items.length} actividades</p>
        {puede && (
          <Button
            variant="outline"
            size="sm"
            onClick={abrirNueva}
            icon={<Icon name="plus" size="sm" color="currentColor" />}
          >
            Nueva actividad
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-10 text-center text-ds-gray-400">
          No hay actividades todavía.
        </div>
      ) : (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
          <ul className="divide-y divide-ds-gray-100">
            {items.map((a) => (
              <li key={a.id} className="px-5 py-3 flex items-center gap-3 group">
                <span className="font-mono text-xs font-semibold text-ds-gray-400 shrink-0 w-8">
                  {a.orden}
                </span>
                <span className="text-sm text-ds-ink flex-1 truncate">{a.nombre}</span>
                <Badge variant={a.activo ? 'green' : 'gray'}>{a.activo ? 'Activa' : 'Inactiva'}</Badge>
                {puede && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="xs" variant="ghost" onClick={() => toggleActivo(a)}>
                      {a.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                    <button
                      onClick={() => abrirEditar(a)}
                      className="text-ds-gray-300 hover:text-ds-ink p-1"
                      title="Editar actividad"
                    >
                      <Icon name="edit" size="sm" color="currentColor" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId != null ? 'Editar actividad' : 'Nueva actividad'}
        footer={
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} disabled={!form.nombre.trim()} onClick={guardar}>
              {editId != null ? 'Guardar' : 'Crear actividad'}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
          <Input
            label="Nombre"
            value={form.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            required
            maxLength={100}
          />
          <Input
            label="Orden"
            type="number"
            value={form.orden}
            onChange={(e) => set('orden', e.target.value)}
            hint="Para ordenar la lista"
          />
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Umbrales
// ═══════════════════════════════════════════════════════════════════════════

function TabUmbrales({ puede }: { puede: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<UmbralAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editClave, setEditClave] = useState<string | null>(null);
  const [form, setForm] = useState({
    umbral: '',
    comparador: 'gte' as ComparadorUmbral,
    unidad: '',
    descripcion: '',
    activo: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch('/api/concreto/umbrales').then((r) => r.json());
      if (d.error) throw new Error(d.error);
      setItems(d.data ?? []);
    } catch {
      toast('Error cargando umbrales', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  function abrirEditar(u: UmbralAlerta) {
    setEditClave(u.clave);
    setForm({
      umbral: String(u.umbral),
      comparador: u.comparador,
      unidad: u.unidad ?? '',
      descripcion: u.descripcion ?? '',
      activo: u.activo,
    });
    setOpen(true);
  }

  async function guardar() {
    if (editClave == null) return;
    const n = Number(form.umbral);
    if (!Number.isFinite(n)) {
      toast('Umbral inválido', 'warning');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/concreto/umbrales/${encodeURIComponent(editClave)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          umbral: n,
          comparador: form.comparador,
          unidad: form.unidad.trim() || null,
          descripcion: form.descripcion.trim() || null,
          activo: form.activo,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(d.error || 'No se pudo guardar', 'error');
        return;
      }
      toast('Umbral actualizado', 'success');
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-ds-gray-400 text-body-sm">{items.length} umbrales</p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-10 text-center text-ds-gray-400">
          No hay umbrales configurados.
        </div>
      ) : (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
          <ul className="divide-y divide-ds-gray-100">
            {items.map((u) => (
              <li key={u.clave} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold text-ds-gray-500 truncate">
                    {u.clave}
                  </p>
                  {u.descripcion && (
                    <p className="text-xs text-ds-gray-400 truncate">{u.descripcion}</p>
                  )}
                </div>
                <span className="text-sm text-ds-gray-500 shrink-0 hidden sm:block">
                  {COMPARADOR_LABEL[u.comparador]}
                </span>
                <span className="text-sm font-semibold text-ds-ink tabular-nums shrink-0 w-24 text-right">
                  {u.umbral}
                  {u.unidad ? ` ${u.unidad}` : ''}
                </span>
                <Badge variant={u.activo ? 'green' : 'gray'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
                {puede && (
                  <button
                    onClick={() => abrirEditar(u)}
                    className="text-ds-gray-300 hover:text-ds-ink p-1 shrink-0"
                    title="Editar umbral"
                  >
                    <Icon name="edit" size="sm" color="currentColor" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar umbral"
        footer={
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={guardar}>
              Guardar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {editClave && (
            <div className="rounded-ds bg-ds-gray-100 px-4 py-2 text-sm">
              <span className="text-ds-gray-500">Clave: </span>
              <span className="font-mono font-semibold text-ds-ink">{editClave}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Umbral"
              type="number"
              value={form.umbral}
              onChange={(e) => setForm((p) => ({ ...p, umbral: e.target.value }))}
              required
            />
            <Input
              label="Unidad"
              value={form.unidad}
              onChange={(e) => setForm((p) => ({ ...p, unidad: e.target.value }))}
              hint='Ej. "%", "L" (opcional)'
              maxLength={20}
            />
          </div>
          <Combobox
            label="Comparador"
            value={form.comparador}
            onChange={(v) => setForm((p) => ({ ...p, comparador: v as ComparadorUmbral }))}
            options={COMPARADORES_UMBRAL.map((c) => ({ value: c, label: COMPARADOR_LABEL[c] }))}
          />
          <Input
            label="Descripción (opcional)"
            value={form.descripcion}
            onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
            maxLength={200}
          />
          <label className="flex items-center gap-2 text-sm text-ds-ink cursor-pointer">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))}
              className="w-4 h-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
            />
            Activo
          </label>
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Tab: Densidades
// ═══════════════════════════════════════════════════════════════════════════

const EMPTY_DENS = {
  clave: '',
  nombre: '',
  codigo_bc: '',
  densidad: '',
  unidad: 'kg/m³',
  notas: '',
  activo: true,
};

function TabDensidades({ puede }: { puede: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<DensidadMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editClave, setEditClave] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_DENS });
  const set = (k: keyof typeof form, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch('/api/concreto/densidades').then((r) => r.json());
      if (d.error) throw new Error(d.error);
      setItems(d.data ?? []);
    } catch {
      toast('Error cargando densidades', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  function abrirNueva() {
    setEditClave(null);
    setForm({ ...EMPTY_DENS });
    setOpen(true);
  }
  function abrirEditar(d: DensidadMaterial) {
    setEditClave(d.clave);
    setForm({
      clave: d.clave,
      nombre: d.nombre,
      codigo_bc: d.codigo_bc ?? '',
      densidad: String(d.densidad),
      unidad: d.unidad,
      notas: d.notas ?? '',
      activo: d.activo,
    });
    setOpen(true);
  }

  async function guardar() {
    const editing = editClave != null;
    if (!editing && (!form.clave.trim() || !/^[a-z0-9_]+$/.test(form.clave.trim()))) {
      toast('Clave inválida (solo minúsculas, dígitos y guion bajo)', 'warning');
      return;
    }
    if (!form.nombre.trim()) {
      toast('El nombre es requerido', 'warning');
      return;
    }
    const dens = Number(form.densidad);
    if (!Number.isFinite(dens) || dens <= 0) {
      toast('Densidad inválida (debe ser > 0)', 'warning');
      return;
    }
    setSaving(true);
    try {
      const body = editing
        ? {
            nombre: form.nombre.trim(),
            codigo_bc: form.codigo_bc.trim() || null,
            densidad: dens,
            unidad: form.unidad.trim(),
            notas: form.notas.trim() || null,
            activo: form.activo,
          }
        : {
            clave: form.clave.trim(),
            nombre: form.nombre.trim(),
            codigo_bc: form.codigo_bc.trim() || null,
            densidad: dens,
            unidad: form.unidad.trim(),
            notas: form.notas.trim() || null,
          };
      const res = await fetch(
        editing ? `/api/concreto/densidades/${encodeURIComponent(editClave!)}` : '/api/concreto/densidades',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(d.error || 'No se pudo guardar', 'error');
        return;
      }
      toast(editing ? 'Densidad actualizada' : 'Densidad creada', 'success');
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-ds-gray-400 text-body-sm">{items.length} materiales</p>
        {puede && (
          <Button
            variant="outline"
            size="sm"
            onClick={abrirNueva}
            icon={<Icon name="plus" size="sm" color="currentColor" />}
          >
            Nueva densidad
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-10 text-center text-ds-gray-400">
          No hay densidades configuradas.
        </div>
      ) : (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
          <ul className="divide-y divide-ds-gray-100">
            {items.map((d) => (
              <li key={d.clave} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ds-ink truncate">{d.nombre}</p>
                  <p className="font-mono text-xs text-ds-gray-400 truncate">
                    {d.clave}
                    {d.codigo_bc ? ` · BC ${d.codigo_bc}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-ds-ink tabular-nums shrink-0 text-right">
                  {d.densidad} <span className="text-ds-gray-400 font-normal">{d.unidad}</span>
                </span>
                <Badge variant={d.activo ? 'green' : 'gray'}>{d.activo ? 'Activo' : 'Inactivo'}</Badge>
                {puede && (
                  <button
                    onClick={() => abrirEditar(d)}
                    className="text-ds-gray-300 hover:text-ds-ink p-1 shrink-0"
                    title="Editar densidad"
                  >
                    <Icon name="edit" size="sm" color="currentColor" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editClave != null ? 'Editar densidad' : 'Nueva densidad'}
        footer={
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={guardar}>
              {editClave != null ? 'Guardar' : 'Crear densidad'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Clave"
              value={form.clave}
              onChange={(e) => set('clave', e.target.value)}
              disabled={editClave != null}
              hint={editClave != null ? 'No editable' : 'snake_case (ej. cemento_gris)'}
              maxLength={60}
              required
            />
            <Input
              label="Código BC (opcional)"
              value={form.codigo_bc}
              onChange={(e) => set('codigo_bc', e.target.value)}
              hint="N° producto Business Central"
              maxLength={20}
            />
          </div>
          <Input
            label="Nombre"
            value={form.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            required
            maxLength={100}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Densidad"
              type="number"
              value={form.densidad}
              onChange={(e) => set('densidad', e.target.value)}
              required
            />
            <Input
              label="Unidad"
              value={form.unidad}
              onChange={(e) => set('unidad', e.target.value)}
              maxLength={20}
            />
          </div>
          <Input
            label="Notas (opcional)"
            value={form.notas}
            onChange={(e) => set('notas', e.target.value)}
            maxLength={500}
          />
          {editClave != null && (
            <label className="flex items-center gap-2 text-sm text-ds-ink cursor-pointer">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => set('activo', e.target.checked)}
                className="w-4 h-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              />
              Activo
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
