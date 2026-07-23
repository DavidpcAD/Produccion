'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { NivelAdminBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Stagger, StaggerItem } from '@/components/ui/Motion';

interface Rol {
  IDRol: number;
  NombreRol: string;
  Descripcion: string;
  Categoria: string;     // = nombre de la App
  idApp: number;
  appNombre: string | null;
  appCodigo: string | null;
  NivelAdmin: number;    // calculado (solo lectura)
  TotalUsuarios: number;
  Activo: boolean;
  tipos?: { idTipoRol: number; nombre: string }[];
}

interface App { idApp: number; nombre: string; codigo: string; }

const EMPTY = { nombreRol: '', descripcion: '', idApp: '' };

export default function RolesPage() {
  const session = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [roles, setRoles] = useState<Rol[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set()); // apps expandidas (acordeón)

  const toggleGrupo = (key: string) =>
    setAbiertos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // Ver usuarios asignados a un rol
  const [verRol, setVerRol] = useState<Rol | null>(null);
  const [usuariosRol, setUsuariosRol] = useState<{ idUsuario: number; username: string; nombre: string; cedula: string; puesto: string; tipo: string }[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [candidatos, setCandidatos] = useState<{ idUsuario: number; username: string; nombre: string; puesto: string }[]>([]);
  const [addSel, setAddSel] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  // Tipos del rol (catálogo dbo.TipoRol): ramifica un rol en subtipos.
  // Toda la gestión (crear/borrar tipos) y la asignación de usuarios viven en el
  // MISMO modal ("Ver rol"), para que no estén divorciadas.
  interface TipoRol { idTipoRol: number; nombre: string; }
  const [tiposRol, setTiposRol] = useState<TipoRol[]>([]);   // tipos del rol que se está viendo
  const [addTipo, setAddTipo] = useState('');                 // tipo elegido al asignar usuario
  const [nuevoTipo, setNuevoTipo] = useState('');             // input "nuevo tipo"
  const [savingTipo, setSavingTipo] = useState(false);

  async function loadRolData(idRol: number) {
    const [detail, cand] = await Promise.all([
      fetch(`/api/roles/${idRol}`).then(x => x.json()),
      fetch(`/api/roles/${idRol}/usuarios`).then(x => x.json()).catch(() => ({ candidatos: [] })),
    ]);
    setUsuariosRol(detail.usuarios ?? []);
    setTiposRol(detail.tipos ?? []);
    setCandidatos(cand.candidatos ?? []);
  }

  async function openVerUsuarios(r: Rol) {
    setVerRol(r);
    setUsuariosRol([]);
    setTiposRol([]);
    setCandidatos([]);
    setAddSel('');
    setAddTipo('');
    setNuevoTipo('');
    setLoadingUsuarios(true);
    try {
      await loadRolData(r.IDRol);
    } catch { /* ignorar */ } finally {
      setLoadingUsuarios(false);
    }
  }

  async function handleAddUser() {
    if (!verRol || !addSel) return;
    setAddingUser(true);
    try {
      const res = await fetch(`/api/roles/${verRol.IDRol}/usuarios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: Number(addSel), esTipo: addTipo || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d.error || 'No se pudo agregar el usuario', 'error'); return; }
      toast('Usuario agregado al rol', 'success');
      setAddSel('');
      setAddTipo('');
      await loadRolData(verRol.IDRol);
      await loadRoles();
    } finally {
      setAddingUser(false);
    }
  }

  async function handleRemoveUser(idUsuario: number) {
    if (!verRol) return;
    if (!(await confirm({ message: '¿Quitar este usuario del rol?', confirmLabel: 'Quitar', danger: true }))) return;
    setRemovingId(idUsuario);
    try {
      const res = await fetch(`/api/roles/${verRol.IDRol}/usuarios?idUsuario=${idUsuario}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d.error || 'No se pudo quitar el usuario', 'error'); return; }
      toast('Usuario quitado del rol', 'success');
      await loadRolData(verRol.IDRol);
      await loadRoles();
    } finally {
      setRemovingId(null);
    }
  }

  const isAdmin = !!session && session.nivelAdmin >= 4;

  async function loadRoles() {
    const data = await fetch('/api/roles').then(r => r.json());
    setRoles(data.data ?? []);
  }
  async function loadApps() {
    const data = await fetch('/api/apps').then(r => r.json()).catch(() => ({ data: [] }));
    setApps(data.data ?? []);
  }

  useEffect(() => {
    Promise.all([loadRoles(), loadApps()]).finally(() => setLoading(false));
  }, []);

  // Si venimos desde Apps con ?nuevoRolApp=<id>, abrir "Nuevo rol" con esa app.
  // Si venimos con ?app=<id>, solo expandir esa app y hacer scroll (ver/editar).
  useEffect(() => {
    if (!apps.length) return;
    const sp = new URLSearchParams(window.location.search);
    const nuevoRolApp = sp.get('nuevoRolApp');
    const verApp = sp.get('app');
    if (nuevoRolApp && apps.some(a => String(a.idApp) === nuevoRolApp)) {
      setEditId(null);
      setForm({ ...EMPTY, idApp: nuevoRolApp });
      setModalOpen(true);
      setAbiertos(prev => new Set(prev).add(`app-${nuevoRolApp}`)); // expandir esa app
      window.history.replaceState(null, '', '/roles'); // limpiar para no reabrir
    } else if (verApp && apps.some(a => String(a.idApp) === verApp)) {
      setAbiertos(prev => new Set(prev).add(`app-${verApp}`)); // expandir esa app
      window.history.replaceState(null, '', '/roles');
      setTimeout(() => {
        document.getElementById(`app-${verApp}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }, [apps]);

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY, idApp: apps[0] ? String(apps[0].idApp) : '' });
    setModalOpen(true);
  }
  function openCreateForApp(idApp: number) {
    setEditId(null);
    setForm({ ...EMPTY, idApp: String(idApp) });
    setModalOpen(true);
  }
  function openEdit(r: Rol) {
    setEditId(r.IDRol);
    setForm({ nombreRol: r.NombreRol, descripcion: r.Descripcion ?? '', idApp: String(r.idApp) });
    setModalOpen(true);
  }

  // Tipos: se crean/borran desde el modal "Ver rol" (verRol).
  async function handleAddTipo() {
    if (!verRol || !nuevoTipo.trim()) return;
    setSavingTipo(true);
    try {
      const res = await fetch(`/api/roles/${verRol.IDRol}/tipos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nuevoTipo.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d.error || 'No se pudo agregar el tipo', 'error'); return; }
      setNuevoTipo('');
      await loadRolData(verRol.IDRol);
      await loadRoles();
    } finally {
      setSavingTipo(false);
    }
  }

  async function handleDeleteTipo(idTipoRol: number) {
    if (!verRol) return;
    const res = await fetch(`/api/roles/${verRol.IDRol}/tipos?idTipoRol=${idTipoRol}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast(d.error || 'No se pudo eliminar el tipo', 'error'); return; }
    toast('Tipo eliminado', 'success');
    await loadRolData(verRol.IDRol);
    await loadRoles();
  }

  async function handleSave() {
    if (!form.nombreRol || !form.idApp) { toast('Nombre y app requeridos', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch(editId ? `/api/roles/${editId}` : '/api/roles', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, idApp: Number(form.idApp) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'Error guardando rol', 'error'); return; }
      await loadRoles();
      toast(editId ? 'Rol actualizado' : 'Rol creado — abrilo con “Ver” para agregar tipos y usuarios', 'success');
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: Rol) {
    if (!(await confirm({ message: `¿Eliminar el rol "${r.NombreRol}"?`, confirmLabel: 'Eliminar', danger: true }))) return;
    const res = await fetch(`/api/roles/${r.IDRol}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'No se pudo eliminar', 'error'); return; }
    toast('Rol eliminado', 'success');
    await loadRoles();
  }

  // Un grupo por CADA app (aunque tenga 0 roles) + roles huérfanos ("Sin app").
  const idsConApp = new Set(apps.map(a => a.idApp));
  const grupos: { key: string; titulo: string; idApp: number | null; items: Rol[] }[] = apps.map(a => ({
    key: `app-${a.idApp}`,
    titulo: a.nombre,
    idApp: a.idApp,
    items: roles.filter(r => r.idApp === a.idApp),
  }));
  const sinApp = roles.filter(r => !idsConApp.has(r.idApp));
  if (sinApp.length) grupos.push({ key: 'sin-app', titulo: 'Sin app', idApp: null, items: sinApp });

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading font-bold text-black">Roles del sistema</h1>
          <p className="text-ds-gray-400 text-body-sm">{roles.length} roles · agrupados por app</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} icon={<Icon name="plus" size="sm" color="currentColor" />}>
            Nuevo rol
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 w-full" rounded="rounded-ds-lg" />
          ))}
        </div>
      ) : grupos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ds-gray-300">
          <Icon name="boleta" size="lg" color="currentColor" className="mb-4" />
          <p className="text-base font-semibold text-black">Sin apps configuradas</p>
          <p className="text-sm mt-1 text-ds-gray-400">Creá una app primero para poder agregarle roles.</p>
        </div>
      ) : (
        <Stagger className="space-y-3">
          {grupos.map(({ key, titulo, idApp, items }) => {
            const abierto = abiertos.has(key);
            return (
            <StaggerItem key={key}>
            <div id={key} className="scroll-mt-6 bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
              {/* Header del acordeón — clic para expandir/colapsar */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleGrupo(key)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGrupo(key); } }}
                className={`flex items-center gap-3 px-5 py-4 cursor-pointer select-none transition-colors hover:bg-ds-gray-100 ${abierto ? 'bg-ds-gray-100' : ''}`}
              >
                <Icon name="arrow-right" size="sm" color="currentColor" className={`text-ds-gray-400 shrink-0 transition-transform ${abierto ? 'rotate-90' : ''}`} />
                <div className="w-8 h-8 rounded-ds bg-black flex items-center justify-center shrink-0">
                  <Icon name="list" size="sm" color="currentColor" className="text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-black text-sm truncate">{titulo}</h2>
                  <p className="text-xs text-ds-gray-400">{items.length} {items.length === 1 ? 'rol' : 'roles'}</p>
                </div>
                {isAdmin && idApp !== null && (
                  <button
                    onClick={e => { e.stopPropagation(); openCreateForApp(idApp); }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-black hover:text-ds-gray-500 transition-colors shrink-0 rounded-ds border border-ds-gray-200 px-2.5 py-1.5 bg-white"
                  >
                    <Icon name="plus" size="sm" color="currentColor" /> Rol
                  </button>
                )}
              </div>
              {abierto && (items.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ds-gray-400 border-t border-ds-gray-100">Sin roles todavía. Agregá el primero con “+ Rol”.</p>
              ) : (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 border-t border-ds-gray-100">
                {items.map(r => (
                  <div key={r.IDRol}
                       role="button"
                       tabIndex={0}
                       onClick={() => openVerUsuarios(r)}
                       onKeyDown={e => { if (e.key === 'Enter') openVerUsuarios(r); }}
                       className="group relative bg-white rounded-ds border border-ds-gray-200 p-4 pl-5 flex flex-col cursor-pointer hover:border-black hover:shadow-ds-02 transition-all overflow-hidden">
                    <span className={`absolute left-0 top-0 bottom-0 w-1 ${r.TotalUsuarios > 0 ? 'bg-brand' : 'bg-ds-gray-200'} group-hover:bg-black transition-colors`} />
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-ds flex items-center justify-center shrink-0 ${r.TotalUsuarios > 0 ? 'bg-brand' : 'bg-ds-gray-100'}`}>
                          <Icon name="rol" size="sm" color="currentColor" className={r.TotalUsuarios > 0 ? 'text-black' : 'text-ds-gray-400'} />
                        </div>
                        <p className="font-bold text-black text-sm truncate">{r.NombreRol}</p>
                      </div>
                      {r.NivelAdmin > 0 && <NivelAdminBadge nivel={r.NivelAdmin} />}
                    </div>
                    {r.Descripcion && (
                      <p className="text-xs text-ds-gray-400 line-clamp-2 mb-2">{r.Descripcion}</p>
                    )}
                    <div className="flex items-center gap-2 mt-auto pt-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2 py-0.5 ${r.TotalUsuarios > 0 ? 'bg-ds-gray-100 text-black' : 'text-ds-gray-400'}`}>
                        <Icon name="user" size="sm" color="currentColor" /> {r.TotalUsuarios} {r.TotalUsuarios === 1 ? 'usuario' : 'usuarios'}
                      </span>
                      {(r.tipos?.length ?? 0) > 0 && (
                        <span title={r.tipos!.map(t => t.nombre).join(', ')}
                          className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 bg-brand/20 text-black">
                          <Icon name="list" size="sm" color="currentColor" /> {r.tipos!.length} {r.tipos!.length === 1 ? 'tipo' : 'tipos'}
                        </span>
                      )}
                      <span className="ml-auto text-xs font-semibold text-ds-gray-300 group-hover:text-black transition-colors">Ver →</span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-3 mt-3 pt-2 border-t border-ds-gray-100">
                        <button onClick={e => { e.stopPropagation(); openEdit(r); }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-ds-gray-500 hover:text-black">
                          <Icon name="edit" size="sm" color="currentColor" /> Editar
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(r); }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-ds-red hover:text-ds-red ml-auto">
                          <Icon name="delete" size="sm" color="currentColor" /> Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              ))}
            </div>
            </StaggerItem>
            );
          })}
        </Stagger>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar rol' : 'Nuevo rol'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button loading={saving} onClick={handleSave}>{editId ? 'Guardar' : 'Crear rol'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Nombre del rol" placeholder="Ej: Supervisor de Campo" value={form.nombreRol}
            onChange={e => setForm(p => ({ ...p, nombreRol: e.target.value }))} required maxLength={80} />
          <Combobox label="App" value={form.idApp}
            onChange={v => setForm(p => ({ ...p, idApp: v }))}
            placeholder="Seleccionar app" required
            options={apps.map(a => ({
              value: String(a.idApp),
              label: `${a.nombre} ${a.codigo}`,
              parts: [{ text: a.nombre, weight: 'bold' as const }, { text: a.codigo, weight: 'light' as const }],
            }))} />
          <Input label="Descripción (opcional)" placeholder="Descripción del rol..." value={form.descripcion}
            onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} maxLength={255}
            hint={`${form.descripcion.length}/255`} />
          <p className="text-xs text-ds-gray-400">
            El nivel de permiso se deriva del rol (configurado en <code>lib/permissions.ts</code>).
          </p>
          <p className="text-xs text-ds-gray-400">
            Los <b>tipos</b> del rol (subtipos, ej. Encargado → Casas / Infra) y los usuarios se gestionan desde <b>“Ver”</b> en la tarjeta del rol.
          </p>
        </div>
      </Modal>

      {/* Usuarios asignados a un rol */}
      <Modal
        open={!!verRol}
        onClose={() => setVerRol(null)}
        title={verRol ? `Rol: ${verRol.NombreRol}` : ''}
        footer={<Button variant="outline" onClick={() => setVerRol(null)}>Cerrar</Button>}
      >
        <div className="space-y-3">
          <p className="text-body-sm text-ds-gray-400">
            {verRol?.Categoria} · usuarios con acceso mediante este rol
          </p>

          {/* Tipos del rol (subtipos). Gestión en el mismo modal que la asignación. */}
          {isAdmin && (
            <div className="rounded-ds-lg border border-ds-gray-200 p-3 space-y-2.5">
              <div>
                <label className="text-sm font-bold text-black">Tipos del rol</label>
                <p className="text-xs text-ds-gray-400">Subtipos de este rol (ej. Encargado → Casas, Infra). Si hay tipos, los usuarios se asignan a un tipo.</p>
              </div>
              {tiposRol.length > 0 && (
                <div className="rounded-ds border border-ds-gray-200 divide-y divide-ds-gray-100 overflow-hidden">
                  {tiposRol.map(t => (
                    <div key={t.idTipoRol} className="flex items-center gap-2.5 px-3 py-2">
                      <span className="w-6 h-6 rounded-ds bg-black flex items-center justify-center shrink-0">
                        <Icon name="rol" size="sm" color="currentColor" className="text-brand" />
                      </span>
                      <span className="text-sm font-semibold text-black flex-1 min-w-0 truncate">{t.nombre}</span>
                      <button type="button" onClick={() => handleDeleteTipo(t.idTipoRol)} aria-label="Eliminar tipo" title="Eliminar tipo"
                        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-ds text-ds-gray-400 hover:text-ds-red hover:bg-ds-gray-100 transition-colors">
                        <Icon name="delete" size="sm" color="currentColor" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <Input value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value)}
                    placeholder="Nuevo tipo (ej. Casas)" maxLength={80}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTipo(); } }} />
                </div>
                <Button variant="outline" loading={savingTipo} disabled={!nuevoTipo.trim()} onClick={handleAddTipo}
                  icon={<Icon name="plus" size="sm" color="currentColor" />}>Agregar tipo</Button>
              </div>
              {tiposRol.length === 0 && <p className="text-xs text-ds-gray-300">Sin tipos: este rol no se ramifica; los usuarios se asignan sin tipo.</p>}
            </div>
          )}

          {isAdmin && (
            <div className="rounded-ds-lg border border-ds-gray-200 p-3 space-y-2.5">
              <Combobox label="Agregar usuario" value={addSel} onChange={setAddSel}
                placeholder={candidatos.length ? 'Buscar usuario…' : 'Sin usuarios disponibles'}
                options={candidatos.map(c => ({
                  value: String(c.idUsuario),
                  label: `${c.nombre} @${c.username}`,
                  parts: [{ text: c.nombre, weight: 'bold' as const }, { text: `@${c.username}`, weight: 'light' as const }],
                  search: c.puesto,
                }))} />
              <div className="flex items-end gap-2">
                {tiposRol.length > 0 && (
                  <div className="flex-1 min-w-0">
                    <Combobox label="Tipo" value={addTipo} onChange={setAddTipo}
                      placeholder="Elegí el tipo" required
                      options={tiposRol.map(t => ({ value: t.nombre, label: t.nombre }))} />
                  </div>
                )}
                <Button onClick={handleAddUser} loading={addingUser}
                  disabled={!addSel || (tiposRol.length > 0 && !addTipo)}
                  icon={<Icon name="plus" size="sm" color="currentColor" />}
                  className={tiposRol.length > 0 ? 'shrink-0' : 'ml-auto'}>
                  Agregar
                </Button>
              </div>
              {tiposRol.length > 0 && (
                <p className="text-xs text-ds-gray-400">Este rol tiene tipos: elegí el tipo para poder agregar al usuario.</p>
              )}
            </div>
          )}

          {loadingUsuarios ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : usuariosRol.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-ds-gray-300">
              <Icon name="user" size="lg" color="currentColor" className="mb-2" />
              <p className="text-sm font-semibold text-black">Sin usuarios asignados</p>
              <p className="text-xs text-ds-gray-400 mt-1">Este rol todavía no lo tiene ningún usuario.</p>
            </div>
          ) : (
            <div className="rounded-ds border border-ds-gray-200 divide-y divide-ds-gray-100 max-h-[55vh] overflow-y-auto">
              {usuariosRol.map(u => {
                const ini = (u.nombre || u.username || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');
                return (
                  <div key={u.idUsuario} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-9 h-9 rounded-ds bg-brand flex items-center justify-center text-black text-xs font-bold shrink-0 shadow-ds-02">{ini}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-black truncate">{u.nombre}</p>
                      <p className="text-xs text-ds-gray-400 truncate">@{u.username} · {u.puesto || '—'}</p>
                    </div>
                    {u.tipo && u.tipo !== 'Indefinido' && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-brand text-black text-[11px] font-bold px-2 py-0.5">{u.tipo}</span>
                    )}
                    <span className="text-xs text-ds-gray-300 shrink-0 font-mono">{u.cedula}</span>
                    {isAdmin && (
                      <button
                        onClick={() => handleRemoveUser(u.idUsuario)}
                        disabled={removingId === u.idUsuario}
                        title="Quitar del rol"
                        aria-label="Quitar del rol"
                        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-ds text-ds-gray-400 hover:text-ds-red hover:bg-ds-gray-100 transition-colors disabled:opacity-50"
                      >
                        <Icon name="remove" size="sm" color="currentColor" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
