'use client';
import { useState, useEffect, useCallback } from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { Modal } from '@/components/ui/Modal';
import { Combobox } from '@/components/ui/Combobox';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useSession } from '@/hooks/useSession';
import { Button } from '@/components/ds/Button/Button';
import { Icon } from '@/components/ds/Icon/Icon';
import { FormField } from '@/components/ds/Form/Form';

interface AppRoles {
  idApp: number | null;
  app: string;
  appCodigo: string | null;
  roles: string;
}
interface Cuenta {
  idUsuario: number;
  idColaborador: number;
  username: string;
  telefono: string | null;
  colaborador: string;
  cedula: string;
  roles: string | null;
  apps: AppRoles[];
  fechaCreacion: string;
}
interface Colab { IDCol: number; NombreCompleto: string; Cedula: string; }

const initials = (s: string) => (s || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');
const appsToText = (c: Cuenta) =>
  (c.apps ?? []).map(a => `${a.app}: ${a.roles}`).join(' | ');

const col = createColumnHelper<Cuenta>();

export default function CuentasPage() {
  const session = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [colaboradores, setColaboradores] = useState<Colab[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editCuenta, setEditCuenta] = useState<Cuenta | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ idColaborador: '', username: '', password: '', telefono: '' });

  const isAdmin = !!session && session.nivelAdmin >= 4;

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetch(`/api/cuentas`).then(r => r.json()).catch(() => ({ data: [] }));
    setCuentas(data.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/usuarios?porPagina=500').then(r => r.json())
      .then(d => setColaboradores(d.data ?? [])).catch(() => {});
  }, []);

  function openCreate() { setEditId(null); setEditCuenta(null); setShowPassword(false); setForm({ idColaborador: '', username: '', password: '', telefono: '' }); setModalOpen(true); }
  function openEdit(c: Cuenta) {
    setEditId(c.idUsuario);
    setEditCuenta(c);
    setShowPassword(false);
    setForm({ idColaborador: String(c.idColaborador), username: c.username, password: '', telefono: c.telefono ?? '' });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.username) { toast('El usuario es requerido', 'warning'); return; }
    if (!editId && (!form.idColaborador || !form.password)) { toast('Colaborador y contraseña requeridos', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch(editId ? `/api/cuentas/${editId}` : '/api/cuentas', {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idColaborador: Number(form.idColaborador) || undefined,
          username: form.username,
          password: form.password || undefined,
          telefono: form.telefono,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'Error guardando', 'error'); return; }
      toast(editId ? 'Cuenta actualizada' : 'Cuenta creada', 'success');
      setModalOpen(false);
      await load();
    } finally { setSaving(false); }
  }

  async function handleDelete(c: Cuenta) {
    if (!(await confirm({ message: `¿Eliminar la cuenta "${c.username}" (${c.colaborador})?`, confirmLabel: 'Eliminar', danger: true }))) return;
    const res = await fetch(`/api/cuentas/${c.idUsuario}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'No se pudo eliminar', 'error'); return; }
    toast('Cuenta eliminada', 'success');
    await load();
  }

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<Cuenta, any>[] = [
    col.accessor('username', {
      header: 'Usuario',
      meta: { label: 'Usuario', exportValue: c => `@${c.username}` },
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2 font-semibold text-black">
          <Icon name="rol" size="sm" color="var(--ds-color-gray-400)" />@{row.original.username}
        </span>
      ),
    }),
    col.accessor('colaborador', {
      header: 'Colaborador',
      meta: { label: 'Colaborador', exportValue: c => `${c.colaborador} ${c.cedula}` },
      cell: ({ row }) => <span>{row.original.colaborador}<span className="text-ds-gray-300 ml-1.5 text-xs">{row.original.cedula}</span></span>,
    }),
    col.accessor('telefono', {
      header: 'Teléfono',
      meta: { label: 'Teléfono' },
      cell: ({ row }) => row.original.telefono || <span className="text-ds-gray-300">—</span>,
    }),
    col.accessor(appsToText, {
      id: 'apps',
      header: 'Apps y roles',
      meta: { label: 'Apps y roles', noFilter: true, exportValue: appsToText },
      cell: ({ row }) => {
        const c = row.original;
        return c.apps && c.apps.length > 0
          ? <div className="flex flex-col gap-1.5">
              {c.apps.map(a => (
                <div key={`${c.idUsuario}-${a.idApp ?? a.app}`} className="flex items-start gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ds-gray-500 whitespace-nowrap pt-1">
                    <Icon name="folder" size="sm" color="var(--ds-color-gray-400)" />
                    {a.app}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {a.roles.split(', ').map((r, i) => <span key={`${r}-${i}`} className="ds-rol-pill">{r}</span>)}
                  </div>
                </div>
              ))}
            </div>
          : <span className="text-ds-gray-300">sin acceso a apps</span>;
      },
    }),
    ...(isAdmin ? [col.display({
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={e => { e.stopPropagation(); openEdit(row.original); }} className="p-2 rounded-full text-ds-gray-400 hover:text-black hover:bg-ds-gray-100 transition-colors" title="Editar" aria-label="Editar">
            <Icon name="edit" size="sm" color="currentColor" />
          </button>
          <button onClick={e => { e.stopPropagation(); handleDelete(row.original); }} className="p-2 rounded-full text-ds-gray-400 hover:text-ds-red-200 hover:bg-ds-gray-100 transition-colors" title="Eliminar" aria-label="Eliminar">
            <Icon name="delete" size="sm" color="currentColor" />
          </button>
        </div>
      ),
    })] : []),
  ];

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-heading font-bold text-black">Usuarios</h1>
          <p className="text-ds-gray-400 text-body-sm">{cuentas.length} cuentas de login</p>
        </div>
        {isAdmin && (
          <Button color="green" layout="icon-left" icon="plus" label="Nueva cuenta" onClick={openCreate} />
        )}
      </div>

      <DataTable
        columns={columns}
        data={cuentas}
        loading={loading}
        searchPlaceholder="Buscar por usuario, colaborador o cédula…"
        exportFilename="cuentas"
        emptyMessage="Sin cuentas"
        onRowClick={isAdmin ? openEdit : undefined}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title={editId ? 'Editar cuenta' : 'Nueva cuenta'}
        footer={
          <>
            <Button color="white" label="Cancelar" onClick={() => setModalOpen(false)} />
            <Button
              color="green"
              label={saving ? 'Guardando…' : (editId ? 'Guardar cambios' : 'Crear cuenta')}
              state={saving ? 'disabled' : 'standard'}
              onClick={handleSave}
            />
          </>
        }
      >
        <div className="space-y-6">
          {/* Identidad de la cuenta (solo edición) */}
          {editId && editCuenta && (
            <div className="rounded-ds-lg bg-ds-gray-100 p-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-full bg-brand flex items-center justify-center text-black text-sm font-bold shrink-0 shadow-ds-01">
                  {initials(editCuenta.colaborador)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-black text-sm truncate">
                    @{editCuenta.username}
                    <span className="text-ds-gray-400 font-normal"> · {editCuenta.colaborador}</span>
                  </p>
                  <p className="text-xs text-ds-gray-400 font-mono">{editCuenta.cedula}</p>
                </div>
              </div>
              {editCuenta.apps && editCuenta.apps.length > 0 ? (
                <div className="flex flex-col gap-2 border-t border-ds-gray-200 pt-3">
                  {editCuenta.apps.map(a => (
                    <div key={`edit-${a.idApp ?? a.app}`} className="flex items-start gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ds-gray-500 whitespace-nowrap pt-1 min-w-[110px]">
                        <Icon name="folder" size="sm" color="var(--ds-color-gray-400)" />
                        {a.app}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {a.roles.split(', ').map((r, i) => <span key={`${r}-${i}`} className="ds-rol-pill">{r}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ds-gray-400 border-t border-ds-gray-200 pt-3">Sin acceso a apps.</p>
              )}
            </div>
          )}

          {/* Datos de la cuenta */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-ds-gray-100 pb-2">
              <Icon name="user" size="sm" color="var(--ds-color-gray-400)" />
              <h3 className="font-bold text-black text-sm">Datos de la cuenta</h3>
            </div>
            <Combobox
              label="Colaborador"
              value={form.idColaborador}
              onChange={v => set('idColaborador', v)}
              placeholder="Seleccionar colaborador"
              required
              options={colaboradores.map(c => ({
                value: String(c.IDCol),
                label: `${c.NombreCompleto} ${c.Cedula}`,
                parts: [{ text: c.NombreCompleto, weight: 'bold' as const }, { text: c.Cedula, weight: 'light' as const }],
              }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Usuario (username)" placeholder="ej: dnj" value={form.username}
                onChange={e => set('username', e.target.value)} helperText="Con este nombre inicia sesión en las apps." state="ayuda" />
              <FormField label="Teléfono" type="tel" placeholder="8888-8888" value={form.telefono}
                onChange={e => set('telefono', e.target.value)} />
            </div>
          </section>

          {/* Credenciales */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-ds-gray-100 pb-2">
              <Icon name="rol" size="sm" color="var(--ds-color-gray-400)" />
              <h3 className="font-bold text-black text-sm">{editId ? 'Cambiar contraseña' : 'Contraseña'}</h3>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <FormField
                  label={editId ? 'Nueva contraseña' : 'Contraseña'}
                  type={showPassword ? 'text' : 'password'}
                  placeholder={editId ? '••••••••' : 'Contraseña inicial'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  helperText={editId ? 'Dejala vacía para mantener la contraseña actual.' : 'Mínimo 8 caracteres.'}
                  state="ayuda"
                />
              </div>
              <Button
                color="white"
                size="sm"
                layout="icon"
                icon={showPassword ? 'sin-autorizar' : 'good'}
                ariaLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword(s => !s)}
                style={{ marginBottom: 22 }}
              />
            </div>
          </section>

          {editId && (
            <p className="text-xs text-ds-gray-400">
              Los roles de este usuario se editan desde <span className="font-semibold text-black">Colaboradores</span>, en la sección “Acceso al sistema”.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
