'use client';
import { useState, useEffect } from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/Button';
import { Badge, NivelAdminBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';

interface App {
  idApp: number;
  codigo: string;
  nombre: string;
  versionNo: string | null;
  link: string | null;      // URL de Azure (por defecto)
  dominio: string | null;   // dominio asignado (opcional)
  fechaCreacion: string;
  creadoPor: string;
  totalRoles: number;
}

interface RolItem {
  IDRol: number; NombreRol: string; Descripcion: string; idApp: number;
  NivelAdmin: number; TotalUsuarios: number;
}
interface UsuarioRolItem { idUsuario: number; username: string; nombre: string; cedula: string; puesto: string; }

const EMPTY = { codigo: '', nombre: '', versionNo: '', link: '', dominio: '' };
// Normaliza a URL absoluta (agrega https:// si falta); '' si vacío.
const toHref = (v: string | null) => {
  const raw = (v ?? '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};
const linkText = (v: string) => v.replace(/^https?:\/\//i, '').replace(/\/$/, '');
const col = createColumnHelper<App>();
const iniciales = (s: string) => (s || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');

// Modal para ver y editar los roles de una app sin salir de /apps.
function RolesModal({ app, isAdmin, autoCreate, onClose, onChanged }: {
  app: App; isAdmin: boolean; autoCreate?: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<RolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ nombreRol: '', descripcion: '' });
  const [openUsers, setOpenUsers] = useState<number | null>(null);
  const [usersByRole, setUsersByRole] = useState<Record<number, UsuarioRolItem[]>>({});
  const [loadingUsers, setLoadingUsers] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await fetch('/api/roles').then(r => r.json());
      setRoles((d.data ?? []).filter((r: RolItem) => r.idApp === app.idApp));
    } finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    if (autoCreate) { setCreating(true); setForm({ nombreRol: '', descripcion: '' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.idApp]);

  function startCreate() { setCreating(true); setEditId(null); setForm({ nombreRol: '', descripcion: '' }); }
  function startEdit(r: RolItem) { setEditId(r.IDRol); setCreating(false); setForm({ nombreRol: r.NombreRol, descripcion: r.Descripcion ?? '' }); }
  function cancelForm() { setCreating(false); setEditId(null); setForm({ nombreRol: '', descripcion: '' }); }

  async function save() {
    if (!form.nombreRol.trim()) { toast('El nombre del rol es requerido', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch(editId ? `/api/roles/${editId}` : '/api/roles', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreRol: form.nombreRol, descripcion: form.descripcion, idApp: app.idApp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'Error guardando rol', 'error'); return; }
      toast(editId ? 'Rol actualizado' : 'Rol creado', 'success');
      cancelForm();
      await load();
      onChanged();
    } finally { setSaving(false); }
  }

  async function remove(r: RolItem) {
    if (!(await confirm({ message: `¿Eliminar el rol "${r.NombreRol}"?`, confirmLabel: 'Eliminar', danger: true }))) return;
    const res = await fetch(`/api/roles/${r.IDRol}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'No se pudo eliminar', 'error'); return; }
    toast('Rol eliminado', 'success');
    await load();
    onChanged();
  }

  async function toggleUsers(r: RolItem) {
    if (openUsers === r.IDRol) { setOpenUsers(null); return; }
    setOpenUsers(r.IDRol);
    if (!usersByRole[r.IDRol]) {
      setLoadingUsers(true);
      try {
        const d = await fetch(`/api/roles/${r.IDRol}`).then(x => x.json());
        setUsersByRole(prev => ({ ...prev, [r.IDRol]: d.usuarios ?? [] }));
      } catch { /* ignorar */ } finally { setLoadingUsers(false); }
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" title={`Roles · ${app.nombre}`}
      footer={<Button variant="outline" onClick={onClose}>Cerrar</Button>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-body-sm text-ds-gray-400">
            <Badge variant="gray">{app.codigo}</Badge>
            <span className="ml-2">{roles.length} {roles.length === 1 ? 'rol' : 'roles'}</span>
          </p>
          {isAdmin && !creating && editId === null && (
            <Button size="xs" onClick={startCreate} icon={<Icon name="plus" size="sm" color="currentColor" />}>Nuevo rol</Button>
          )}
        </div>

        {/* Formulario crear / editar */}
        {(creating || editId !== null) && (
          <div className="rounded-ds-lg border border-black p-4 space-y-3 bg-ds-gray-100/40">
            <p className="text-sm font-bold text-black">{editId !== null ? 'Editar rol' : 'Nuevo rol'}</p>
            <Input label="Nombre del rol" placeholder="Ej: Supervisor de Campo" value={form.nombreRol}
              onChange={e => setForm(p => ({ ...p, nombreRol: e.target.value }))} required maxLength={80} />
            <Input label="Descripción (opcional)" placeholder="Descripción del rol…" value={form.descripcion}
              onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} maxLength={255}
              hint={`${form.descripcion.length}/255`} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="xs" onClick={cancelForm}>Cancelar</Button>
              <Button size="xs" loading={saving} onClick={save}>{editId !== null ? 'Guardar' : 'Crear rol'}</Button>
            </div>
          </div>
        )}

        {/* Lista de roles */}
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" rounded="rounded-ds-lg" />)}</div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-ds-gray-300">
            <Icon name="rol" size="lg" color="currentColor" className="mb-2" />
            <p className="text-sm font-semibold text-black">Sin roles todavía</p>
            <p className="text-xs text-ds-gray-400 mt-1">Agregá el primero con “Nuevo rol”.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {roles.map(r => (
              <div key={r.IDRol} className="rounded-ds-lg border border-ds-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-ds bg-black flex items-center justify-center shrink-0">
                    <Icon name="rol" size="sm" color="currentColor" className="text-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-black text-sm truncate">{r.NombreRol}</p>
                      <NivelAdminBadge nivel={r.NivelAdmin} />
                    </div>
                    {r.Descripcion && <p className="text-xs text-ds-gray-400 truncate">{r.Descripcion}</p>}
                  </div>
                  <button onClick={() => toggleUsers(r)} title="Ver usuarios asignados"
                    className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 rounded-full border px-2.5 py-1 transition-colors ${openUsers === r.IDRol ? 'border-black text-black' : 'border-ds-gray-200 text-ds-gray-500 hover:border-black hover:text-black'}`}>
                    <Icon name="user" size="sm" color="currentColor" /> {r.TotalUsuarios}
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => startEdit(r)} title="Editar rol"
                        className="p-2 rounded-full text-ds-gray-400 hover:text-black hover:bg-ds-gray-100 transition-colors shrink-0">
                        <Icon name="edit" size="sm" color="currentColor" />
                      </button>
                      <button onClick={() => remove(r)} title="Eliminar rol"
                        className="p-2 rounded-full text-ds-gray-400 hover:text-ds-red-200 hover:bg-ds-gray-100 transition-colors shrink-0">
                        <Icon name="delete" size="sm" color="currentColor" />
                      </button>
                    </>
                  )}
                </div>
                {openUsers === r.IDRol && (
                  <div className="border-t border-ds-gray-100 px-4 py-3 bg-ds-gray-100/30">
                    {loadingUsers && !usersByRole[r.IDRol] ? (
                      <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
                    ) : (usersByRole[r.IDRol]?.length ?? 0) === 0 ? (
                      <p className="text-xs text-ds-gray-400 py-1">Ningún usuario tiene este rol todavía.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {usersByRole[r.IDRol].map(u => (
                          <div key={u.idUsuario} className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-ds bg-brand flex items-center justify-center text-black text-[11px] font-bold shrink-0">{iniciales(u.nombre || u.username)}</div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-black truncate">{u.nombre}</p>
                              <p className="text-xs text-ds-gray-400 truncate">@{u.username} · {u.puesto || '—'}</p>
                            </div>
                            <span className="text-xs text-ds-gray-300 shrink-0 font-mono">{u.cedula}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function AppsPage() {
  const session = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [rolesApp, setRolesApp] = useState<App | null>(null);
  const [rolesAutoCreate, setRolesAutoCreate] = useState(false);

  const isAdmin = !!session && session.nivelAdmin >= 4;

  function openRoles(a: App, create = false) { setRolesAutoCreate(create); setRolesApp(a); }

  async function loadApps() {
    const data = await fetch('/api/apps').then(r => r.json());
    setApps(data.data ?? []);
  }

  useEffect(() => {
    loadApps().finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(a: App) {
    setEditId(a.idApp);
    setForm({ codigo: a.codigo, nombre: a.nombre, versionNo: a.versionNo ?? '', link: a.link ?? '', dominio: a.dominio ?? '' });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.codigo || !form.nombre) { toast('Código y nombre requeridos', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch(editId ? `/api/apps/${editId}` : '/api/apps', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'Error guardando', 'error'); return; }
      setModalOpen(false);
      // Al crear una app nueva, abrir su modal de roles para agregarlos aquí mismo.
      if (!editId && data.idApp) {
        const nueva: App = {
          idApp: data.idApp, codigo: form.codigo, nombre: form.nombre,
          versionNo: form.versionNo || null, link: form.link || null, dominio: form.dominio || null,
          fechaCreacion: '', creadoPor: '', totalRoles: 0,
        };
        toast('App creada — ahora agregá sus roles', 'success');
        await loadApps();
        openRoles(nueva, true);
        return;
      }
      toast('App actualizada', 'success');
      await loadApps();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(a: App) {
    if (!(await confirm({ message: `¿Eliminar la app "${a.nombre}"?`, confirmLabel: 'Eliminar', danger: true }))) return;
    const res = await fetch(`/api/apps/${a.idApp}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'No se pudo eliminar', 'error'); return; }
    toast('App eliminada', 'success');
    await loadApps();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<App, any>[] = [
    col.accessor('nombre', {
      header: 'Aplicación',
      meta: { label: 'Aplicación' },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-ds bg-black flex items-center justify-center shrink-0 shadow-ds-01">
            <Icon name="list" size="sm" color="currentColor" className="text-brand" />
          </div>
          <div>
            <p className="font-bold text-black leading-tight">{row.original.nombre}</p>
            {row.original.versionNo && <p className="text-xs text-ds-gray-400">v{row.original.versionNo}</p>}
          </div>
        </div>
      ),
    }),
    col.accessor('codigo', {
      header: 'Código',
      meta: { label: 'Código' },
      cell: ({ row }) => <Badge variant="gray">{row.original.codigo}</Badge>,
    }),
    col.accessor('totalRoles', {
      header: 'Roles',
      meta: { label: 'Roles', align: 'center' },
      cell: ({ row }) => (
        <button
          onClick={e => { e.stopPropagation(); openRoles(row.original); }}
          title="Ver y editar los roles de esta app"
          className="inline-flex items-center gap-1.5 rounded-full border border-ds-gray-200 bg-white px-2.5 py-1 text-sm font-semibold text-ds-gray-500 hover:border-black hover:text-black transition-colors">
          <Icon name="rol" size="sm" color="currentColor" />
          {row.original.totalRoles}
          <Icon name="arrow-right" size="sm" color="currentColor" className="opacity-60" />
        </button>
      ),
    }),
    col.accessor('dominio', {
      header: 'Enlaces',
      meta: { label: 'Enlaces', noFilter: true, exportValue: a => [a.dominio, a.link].filter(Boolean).join(' | ') },
      cell: ({ row }) => {
        const azure = toHref(row.original.link);
        const dom = toHref(row.original.dominio);
        if (!azure && !dom) return <span className="text-ds-gray-300">—</span>;
        return (
          <div className="flex flex-col gap-1">
            {dom && (
              <a href={dom} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                 className="inline-flex items-center gap-1.5 text-sm font-semibold text-black hover:underline">
                <Icon name="open" size="sm" color="currentColor" /> {linkText(dom)}
              </a>
            )}
            {azure && (
              <a href={azure} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                 className="inline-flex items-center gap-1.5 text-xs text-ds-gray-400 hover:text-black hover:underline">
                <Icon name="open" size="sm" color="currentColor" /> {linkText(azure)}
                <span className="text-ds-gray-300">· Azure</span>
              </a>
            )}
          </div>
        );
      },
    }),
    ...(isAdmin ? [col.display({
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-0.5 justify-end">
          <button onClick={e => { e.stopPropagation(); openRoles(row.original, true); }}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-ds text-xs font-semibold leading-none text-ds-gray-500 hover:text-black hover:bg-ds-gray-100 transition-colors" title="Agregar un rol a esta app" aria-label="Agregar rol">
            <Icon name="plus" size="sm" color="currentColor" /> <span className="leading-none">Rol</span>
          </button>
          <button onClick={e => { e.stopPropagation(); openEdit(row.original); }}
                  className="p-2 rounded-ds text-ds-gray-400 hover:text-black hover:bg-ds-gray-100 transition-colors" title="Editar la app" aria-label="Editar app">
            <Icon name="edit" size="sm" color="currentColor" />
          </button>
          <button onClick={e => { e.stopPropagation(); handleDelete(row.original); }}
                  className="p-2 rounded-ds text-ds-red hover:text-white hover:bg-ds-red transition-colors" title="Eliminar la app" aria-label="Eliminar app">
            <Icon name="delete" size="sm" color="currentColor" />
          </button>
        </div>
      ),
    })] : []),
  ];

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading font-bold text-black">Aplicaciones</h1>
          <p className="text-ds-gray-400 text-body-sm">
            {apps.length} {apps.length === 1 ? 'app registrada' : 'apps registradas'}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} icon={<Icon name="plus" size="sm" color="currentColor" />}>
            Nueva app
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={apps}
        loading={loading}
        searchPlaceholder="Buscar app…"
        exportFilename="apps"
        emptyMessage="Sin aplicaciones"
        onRowClick={isAdmin ? openEdit : undefined}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar app' : 'Nueva app'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button loading={saving} onClick={handleSave}>{editId ? 'Guardar' : 'Crear app'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Código" placeholder="Ej: ADMIN" value={form.codigo}
            onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))} required />
          <Input label="Nombre" placeholder="Ej: Administración" value={form.nombre}
            onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} required />
          <Input label="Versión (opcional)" placeholder="Ej: 1.0.0" value={form.versionNo}
            onChange={e => setForm(p => ({ ...p, versionNo: e.target.value }))} />
          <Input label="URL de Azure (opcional)" placeholder="https://mi-app.azurewebsites.net" value={form.link}
            onChange={e => setForm(p => ({ ...p, link: e.target.value }))}
            hint="La URL por defecto donde está publicada la app." />
          <Input label="Dominio asignado (opcional)" placeholder="oc.adelante.cr" value={form.dominio}
            onChange={e => setForm(p => ({ ...p, dominio: e.target.value }))}
            hint="Dominio propio, si tiene uno. Podés escribirlo sin https://." />
        </div>
      </Modal>

      {rolesApp && (
        <RolesModal
          app={rolesApp}
          isAdmin={isAdmin}
          autoCreate={rolesAutoCreate}
          onClose={() => setRolesApp(null)}
          onChanged={loadApps}
        />
      )}
    </div>
  );
}
