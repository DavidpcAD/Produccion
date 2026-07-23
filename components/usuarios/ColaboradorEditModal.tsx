'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimeField } from '@/components/ui/TimeField';
import { Modal } from '@/components/ui/Modal';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { Icon } from '@/components/ds/Icon/Icon';
import { TiposSelector } from '@/components/roles/TiposSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { MarcajeEstadoZonas } from '@/components/usuarios/MarcajeEstadoZonas';

interface Rol { IDRol: number; NombreRol: string; Categoria: string; idApp: number; tipos?: { idTipoRol: number; nombre: string }[]; }
interface Puesto { idPuesto: number; puesto: string; departamento: string; }
interface Distrito { codigoDistrito: string; distrito: string; canton: string; provincia: string; }
interface Pais { idPais: number; pais: string; }

// ─── Selector de roles por app (popover portalizado) ─────────────────
function AppRolePicker({
  grupos, selectedRoles, onToggle, resetKey, onRevocarApp,
}: {
  grupos: { idApp: number; nombre: string; roles: Rol[] }[];
  selectedRoles: number[];
  onToggle: (idRol: number) => void;
  resetKey?: number | null;
  onRevocarApp?: (roleIds: number[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [openApp, setOpenApp] = useState<number | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; bottomAnchor: number; width: number; openUp: boolean } | null>(null);

  useEffect(() => { setQuery(''); setOpenApp(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [resetKey]);

  const updateCoords = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const width = Math.max(r.width, 300);
    const panelH = 300;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const openUp = spaceBelow < panelH && r.top - 8 > spaceBelow;
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
    if (left < 8) left = 8;
    setCoords({ left, top: r.bottom + gap, bottomAnchor: window.innerHeight - r.top + gap, width, openUp });
  }, []);

  useEffect(() => {
    if (openApp === null) return;
    updateCoords();
    const h = () => updateCoords();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => { window.removeEventListener('resize', h); window.removeEventListener('scroll', h, true); };
  }, [openApp, updateCoords]);

  useEffect(() => {
    if (openApp === null) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      setOpenApp(null);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openApp]);

  const q = query.trim().toLowerCase();
  const filtrados = q
    ? grupos.filter(g => g.nombre.toLowerCase().includes(q) || g.roles.some(r => r.NombreRol.toLowerCase().includes(q)))
    : grupos;
  const totalSeleccionados = selectedRoles.length;
  const abierta = openApp !== null ? grupos.find(g => g.idApp === openApp) ?? null : null;
  const selInApp = abierta ? abierta.roles.filter(r => selectedRoles.includes(r.IDRol)) : [];

  function openPopover(e: React.MouseEvent<HTMLButtonElement>, idApp: number) {
    if (openApp === idApp) { setOpenApp(null); return; }
    anchorRef.current = e.currentTarget;
    setOpenApp(idApp);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {grupos.length > 6 ? (
          <div className="flex-1">
            <Input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar app…"
              leftIcon={<Icon name="search" size="sm" color="currentColor" className="text-ds-gray-400" />} />
          </div>
        ) : <span />}
        <span className="text-xs text-ds-gray-400 shrink-0">
          {totalSeleccionados > 0
            ? <><span className="font-bold text-black">{totalSeleccionados}</span> {totalSeleccionados === 1 ? 'rol asignado' : 'roles asignados'}</>
            : 'Sin roles asignados'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[46vh] overflow-y-auto pr-1">
        {filtrados.map(g => {
          const seleccionados = g.roles.filter(r => selectedRoles.includes(r.IDRol));
          const total = seleccionados.length;
          const isOpen = openApp === g.idApp;
          return (
            <button key={g.idApp} type="button" onClick={e => openPopover(e, g.idApp)}
              className={`text-left rounded-ds-lg border p-3 transition-all hover:shadow-ds-02 ${total ? 'border-black bg-ds-gray-100/40' : 'border-ds-gray-200'} ${isOpen ? 'ring-2 ring-brand' : ''}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-8 h-8 rounded-ds flex items-center justify-center shrink-0 ${total ? 'bg-brand' : 'bg-ds-gray-100'}`}>
                  <Icon name="list" size="sm" color="currentColor" className={total ? 'text-black' : 'text-ds-gray-400'} />
                </div>
                <p className="text-sm font-bold text-black truncate flex-1">{g.nombre}</p>
                {total > 0 && <span className="text-[11px] font-bold text-black bg-brand rounded-full px-2 py-0.5 shrink-0">{total}</span>}
              </div>
              <p className="text-xs text-ds-gray-400 truncate">{total > 0 ? seleccionados.map(r => r.NombreRol).join(', ') : 'Ningún rol'}</p>
            </button>
          );
        })}
        {filtrados.length === 0 && (
          <p className="col-span-full text-sm text-ds-gray-400 text-center py-6">Sin resultados para “{query}”.</p>
        )}
      </div>

      {abierta && coords && createPortal(
        <div ref={panelRef}
          style={{ position: 'fixed', left: coords.left, width: coords.width, top: coords.openUp ? undefined : coords.top, bottom: coords.openUp ? coords.bottomAnchor : undefined }}
          className="z-[100] rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-03 p-3.5 animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
              <Icon name="list" size="sm" color="currentColor" className="text-brand" />
            </div>
            <p className="text-sm font-bold text-black flex-1 truncate">{abierta.nombre}</p>
            <button type="button" onClick={() => setOpenApp(null)} aria-label="Cerrar" className="text-ds-gray-400 hover:text-black">
              <Icon name="close" size="sm" color="currentColor" />
            </button>
          </div>
          {abierta.roles.length === 0 ? (
            <p className="text-xs text-ds-gray-300 py-1">Esta app no tiene roles configurados.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto">
              {abierta.roles.map(r => {
                const on = selectedRoles.includes(r.IDRol);
                return (
                  <button key={r.IDRol} type="button" onClick={() => onToggle(r.IDRol)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
                      on ? 'bg-brand border-brand text-black shadow-ds-01' : 'bg-white border-ds-gray-200 text-ds-gray-500 hover:border-black hover:text-black'
                    }`}>
                    {on && <Icon name="check" size="sm" color="currentColor" className="text-black" />}
                    {r.NombreRol}
                  </button>
                );
              })}
            </div>
          )}
          {onRevocarApp && selInApp.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-ds-gray-100 flex justify-end">
              <button type="button" onClick={() => onRevocarApp(selInApp.map(r => r.IDRol))}
                className="inline-flex items-center gap-1 text-xs font-semibold text-ds-red hover:underline">
                <Icon name="close" size="sm" color="currentColor" /> Quitar acceso a esta app
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

const EF_VACIO = {
  cedula: '', nombre: '', primerApellido: '', segundoApellido: '', correo: '', telefono: '',
  idPuesto: '', sexo: '', fechaIngreso: '', fechaSalida: '', fechaNacimiento: '',
  codigoDistrito: '', direccion: '', idPais: '',
  tallaCamisa: '', tallaPantalon: '', salarioMensual: '', horaEntrada: '', horaSalida: '',
  activo: true,
};

/**
 * Modal único de edición de colaborador. Se usa desde la lista (/usuarios) y
 * desde el detalle (/usuarios/[id]) para que haya UNA sola experiencia de edición
 * con todos los campos + acceso/roles + marcaje/foto.
 */
export function ColaboradorEditModal({
  idColaborador, onClose, onSaved,
}: {
  idColaborador: number | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const session = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const isAdmin = !!session && session.nivelAdmin >= 2;
  const isSuperAdmin = !!session && session.nivelAdmin >= 2; // Jefe de Área o superior gestiona accesos
  const puedeEliminar = !!session && session.nivelAdmin >= 4;

  const [roles, setRoles] = useState<Rol[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [distritos, setDistritos] = useState<Distrito[]>([]);
  const [paises, setPaises] = useState<Pais[]>([]);

  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasLogin, setHasLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameOriginal, setUsernameOriginal] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [tiposByRol, setTiposByRol] = useState<Record<number, string>>({});
  const [crearAcceso, setCrearAcceso] = useState(false);
  const [nuevoUsername, setNuevoUsername] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [cambioClave, setCambioClave] = useState('');
  const [revocando, setRevocando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [ef, setEf] = useState({ ...EF_VACIO });
  const [efFoto, setEfFoto] = useState<string | null>(null);
  const [idUsuario, setIdUsuario] = useState<number | null>(null);

  // Catálogos (una vez).
  useEffect(() => {
    fetch('/api/roles').then(r => r.json()).then(d => setRoles(d.data ?? [])).catch(() => {});
    fetch('/api/catalogos').then(r => r.json()).then(d => {
      setPuestos(d.puestos ?? []); setDistritos(d.distritos ?? []); setPaises(d.paises ?? []);
    }).catch(() => {});
  }, []);

  // Carga del colaborador al abrir.
  useEffect(() => {
    if (idColaborador == null) return;
    let cancelado = false;
    setLoadingEdit(true);
    setCrearAcceso(false); setNuevoUsername(''); setNuevaPassword(''); setCambioClave('');
    (async () => {
      try {
        const d = await fetch(`/api/usuarios/${idColaborador}`, { cache: 'no-store' }).then(r => r.json());
        if (cancelado) return;
        setEf({
          cedula: d.Cedula ?? d.cedula ?? '', nombre: d.Nombre ?? '', primerApellido: d.PrimerApellido ?? '',
          segundoApellido: d.SegundoApellido ?? '', correo: d.Correo ?? '', telefono: d.Telefono ?? '',
          idPuesto: d.idPuesto ? String(d.idPuesto) : '', sexo: d.Sexo ?? '',
          fechaIngreso: d.FechaIngreso ? String(d.FechaIngreso).split('T')[0] : '',
          fechaSalida: d.FechaSalida ? String(d.FechaSalida).split('T')[0] : '',
          fechaNacimiento: d.FechaNacimiento ? String(d.FechaNacimiento).split('T')[0] : '',
          codigoDistrito: d.codigoDistrito ?? '', direccion: d.Direccion ?? '',
          idPais: d.idPais ? String(d.idPais) : '',
          tallaCamisa: d.TallaCamisa ?? '', tallaPantalon: d.TallaPantalon ?? '',
          salarioMensual: d.SalarioMensual != null ? String(d.SalarioMensual) : '',
          horaEntrada: d.HoraEntrada ?? '', horaSalida: d.HoraSalida ?? '',
          activo: !!d.Activo,
        });
        setEfFoto(d.FotoBase64 ?? null);
        setIdUsuario(d.IDUsuario ?? null);
        setUsername(d.Username ?? '');
        setUsernameOriginal(d.Username ?? '');
        setHasLogin(!!d.Username);
        setSelectedRoles((d.roles ?? []).map((r: { IDRol: number }) => r.IDRol));
        const tb: Record<number, string> = {};
        for (const r of (d.roles ?? []) as { IDRol: number; esTipo?: string }[]) {
          if (r.esTipo && r.esTipo !== 'Indefinido') tb[r.IDRol] = r.esTipo;
        }
        setTiposByRol(tb);
      } catch {
        if (!cancelado) { toast('No se pudo cargar el colaborador', 'error'); onClose(); }
      } finally {
        if (!cancelado) setLoadingEdit(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idColaborador]);

  const setEfField = (k: string, v: string | boolean) => setEf(p => ({ ...p, [k]: v }));
  const departamentoSel = puestos.find(p => String(p.idPuesto) === ef.idPuesto)?.departamento ?? '';
  const gruposApp = useMemo(() => Object.values(
    roles.reduce((acc, r) => {
      (acc[r.idApp] ??= { idApp: r.idApp, nombre: r.Categoria || 'Sin app', roles: [] }).roles.push(r);
      return acc;
    }, {} as Record<number, { idApp: number; nombre: string; roles: Rol[] }>),
  ), [roles]);

  function toggleRol(idRol: number) {
    setSelectedRoles(prev => {
      if (prev.includes(idRol)) {
        setTiposByRol(t => { const n = { ...t }; delete n[idRol]; return n; });
        return prev.filter(id => id !== idRol);
      }
      return [...prev, idRol];
    });
  }
  const setTipoRol = (idRol: number, tipo: string) =>
    setTiposByRol(prev => { const n = { ...prev }; if (tipo) n[idRol] = tipo; else delete n[idRol]; return n; });

  async function handleSaveEdit() {
    if (idColaborador == null) return;
    if (!ef.nombre.trim() || !ef.primerApellido.trim() || !ef.telefono.trim() || !ef.idPuesto) {
      toast('Nombre, primer apellido, teléfono y puesto son requeridos', 'warning'); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/usuarios/${idColaborador}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: ef.nombre, primerApellido: ef.primerApellido, segundoApellido: ef.segundoApellido,
          correo: ef.correo, telefono: ef.telefono, activo: ef.activo,
          fechaIngreso: ef.fechaIngreso, fechaSalida: ef.fechaSalida, fechaNacimiento: ef.fechaNacimiento,
          sexo: ef.sexo, direccion: ef.direccion, idPuesto: ef.idPuesto ? Number(ef.idPuesto) : null,
          codigoDistrito: ef.codigoDistrito || null, idPais: ef.idPais ? Number(ef.idPais) : null,
          tallaCamisa: ef.tallaCamisa, tallaPantalon: ef.tallaPantalon,
          salarioMensual: ef.salarioMensual, horaEntrada: ef.horaEntrada, horaSalida: ef.horaSalida,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || 'Error guardando', 'error'); return; }
      if (hasLogin) {
        const nuevoUser = username.trim();
        if (!nuevoUser) { toast('El usuario (username) no puede quedar vacío', 'warning'); return; }
        const clave = cambioClave.trim();
        if (clave && clave.length < 8) { toast('La contraseña debe tener al menos 8 caracteres', 'warning'); return; }
        if ((nuevoUser !== usernameOriginal || clave) && isSuperAdmin) {
          const uRes = await fetch(`/api/usuarios/${idColaborador}/login`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: nuevoUser, password: clave || undefined }),
          });
          if (!uRes.ok) { const e = await uRes.json().catch(() => ({})); toast(e.error || 'Error actualizando el usuario', 'error'); return; }
          setUsernameOriginal(nuevoUser);
          setCambioClave('');
        }
        await fetch(`/api/usuarios/${idColaborador}/roles`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: selectedRoles, tipos: tiposByRol }),
        });
      } else if (crearAcceso && isSuperAdmin) {
        if (!nuevoUsername.trim()) { toast('El usuario (username) es requerido', 'warning'); return; }
        if (nuevaPassword.length < 8) { toast('La contraseña debe tener al menos 8 caracteres', 'warning'); return; }
        const accRes = await fetch(`/api/usuarios/${idColaborador}/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: nuevoUsername.trim(), password: nuevaPassword, telefono: ef.telefono, roles: selectedRoles, tipos: tiposByRol }),
        });
        if (!accRes.ok) { const e = await accRes.json().catch(() => ({})); toast(e.error || 'Error creando el acceso', 'error'); return; }
      }
      toast(crearAcceso && !hasLogin ? 'Acceso creado' : 'Colaborador actualizado', 'success');
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleRevocar() {
    if (idColaborador == null) return;
    if (!(await confirm({
      title: 'Revocar acceso',
      message: 'Se eliminará su usuario de login y sus roles. El colaborador se conserva. ¿Continuar?',
      confirmLabel: 'Revocar acceso', danger: true,
    }))) return;
    setRevocando(true);
    try {
      const res = await fetch(`/api/usuarios/${idColaborador}/login`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || 'Error revocando el acceso', 'error'); return; }
      toast('Acceso revocado', 'success');
      setHasLogin(false); setUsername(''); setSelectedRoles([]);
      onSaved?.();
    } finally {
      setRevocando(false);
    }
  }

  async function handleEliminar() {
    if (idColaborador == null) return;
    const nombreCompleto = `${ef.nombre} ${ef.primerApellido}`.trim() || 'este colaborador';
    if (!(await confirm({
      title: 'Eliminar colaborador',
      message: `¿Eliminar DEFINITIVAMENTE a ${nombreCompleto}? Esta acción no se puede deshacer.` +
        (hasLogin ? ' También se eliminará su usuario de login y sus roles.' : ''),
      confirmLabel: 'Eliminar', danger: true,
    }))) return;
    setEliminando(true);
    try {
      if (hasLogin) {
        const rev = await fetch(`/api/usuarios/${idColaborador}/login`, { method: 'DELETE' });
        if (!rev.ok) { const e = await rev.json().catch(() => ({})); toast(e.error || 'No se pudo revocar el acceso', 'error'); return; }
      }
      const res = await fetch(`/api/usuarios/${idColaborador}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d.error || 'No se pudo eliminar el colaborador', 'error'); return; }
      toast('Colaborador eliminado', 'success');
      onSaved?.();
      onClose();
    } finally {
      setEliminando(false);
    }
  }

  return (
    <Modal
      open={idColaborador !== null}
      onClose={onClose}
      size="xl"
      title={ef.nombre ? `Editar: ${ef.nombre} ${ef.primerApellido}` : 'Editar colaborador'}
      footer={
        <>
          {puedeEliminar && !loadingEdit && (
            <Button variant="danger" onClick={handleEliminar} loading={eliminando} disabled={saving}
              className="mr-auto" icon={<Icon name="delete" size="sm" color="currentColor" />}>
              Eliminar colaborador
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button loading={saving} onClick={handleSaveEdit} disabled={loadingEdit || eliminando}>Guardar cambios</Button>
        </>
      }
    >
      {loadingEdit ? (
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="space-y-6 max-h-[65vh] overflow-y-auto pr-1">
          {/* Datos del colaborador */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-ds-gray-100 pb-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className="font-bold text-black text-sm shrink-0">Datos del colaborador</h3>
                {idColaborador != null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ds-gray-100 px-2 h-6 text-[11px] font-semibold text-ds-gray-500 font-mono"
                    title="ID de colaborador (dbo.Colaborador.idColaborador)">
                    Colaborador #{idColaborador}
                  </span>
                )}
                {idUsuario != null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ds-gray-100 px-2 h-6 text-[11px] font-semibold text-ds-gray-500 font-mono"
                    title="ID de usuario/login (dbo.Usuario.idUsuario)">
                    Usuario #{idUsuario}
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-black cursor-pointer shrink-0">
                <input type="checkbox" checked={ef.activo} onChange={e => setEfField('activo', e.target.checked)} className="w-4 h-4 accent-brand" />
                Activo
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Cédula" value={ef.cedula} disabled />
              <Input label="Nombre" value={ef.nombre} onChange={e => setEfField('nombre', e.target.value)} required />
              <Input label="Primer apellido" value={ef.primerApellido} onChange={e => setEfField('primerApellido', e.target.value)} required />
              <Input label="Segundo apellido" value={ef.segundoApellido} onChange={e => setEfField('segundoApellido', e.target.value)} />
              <Combobox label="Sexo" value={ef.sexo} onChange={v => setEfField('sexo', v)}
                options={[{ value: 'Masculino', label: 'Masculino' }, { value: 'Femenino', label: 'Femenino' }, { value: 'Sin definir', label: 'Sin definir' }]} placeholder="Seleccionar" />
              {/* Foto (la capta el reloj de marcaje). Ocupa el espacio libre a la
                  derecha, a lo alto de dos filas. */}
              <div className="sm:row-span-2">
                <label className="block text-body-sm font-medium text-black mb-1.5">Foto</label>
                <div className="w-full aspect-[3/4] max-h-[168px] rounded-ds border border-ds-gray-200 bg-ds-gray-100/60 overflow-hidden flex items-center justify-center">
                  {efFoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={efFoto.startsWith('data:') ? efFoto : `data:image/jpeg;base64,${efFoto}`}
                      alt={`Foto de ${ef.nombre} ${ef.primerApellido}`.trim()} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-ds-gray-300 px-2 text-center">
                      <Icon name="user" size="lg" color="currentColor" />
                      <span className="text-xs">Sin foto · la capta el reloj</span>
                    </div>
                  )}
                </div>
              </div>
              <DatePicker label="Fecha de nacimiento" value={ef.fechaNacimiento} onChange={v => setEfField('fechaNacimiento', v)} />
              <DatePicker label="Fecha de ingreso" value={ef.fechaIngreso} onChange={v => setEfField('fechaIngreso', v)} />
              <Input label="Correo" type="email" value={ef.correo} onChange={e => setEfField('correo', e.target.value)} />
              <Input label="Teléfono" value={ef.telefono} onChange={e => setEfField('telefono', e.target.value)} required />
              <DatePicker label="Fecha de salida" value={ef.fechaSalida} onChange={v => setEfField('fechaSalida', v)} />
              <Combobox label="Puesto" value={ef.idPuesto} onChange={v => setEfField('idPuesto', v)} required
                options={puestos.map(p => ({ value: String(p.idPuesto), label: p.puesto, parts: [{ text: p.puesto, weight: 'bold' as const }, { text: p.departamento, weight: 'light' as const }], search: p.departamento }))}
                placeholder="Seleccionar puesto" />
              <Input label="Departamento" value={departamentoSel} disabled placeholder="Se deriva del puesto" />
              <Combobox label="País" value={ef.idPais} onChange={v => setEfField('idPais', v)}
                options={paises.map(p => ({ value: String(p.idPais), label: p.pais }))} placeholder="Seleccionar" />
              <div className="sm:col-span-1">
                <Combobox label="Distrito" value={ef.codigoDistrito} onChange={v => setEfField('codigoDistrito', v)}
                  options={distritos.map(d => ({ value: d.codigoDistrito, label: `${d.distrito} · ${d.canton} · ${d.provincia}`, parts: [{ text: d.distrito, weight: 'bold' as const }, { text: d.canton, weight: 'normal' as const }, { text: d.provincia, weight: 'light' as const }], search: `${d.canton} ${d.provincia}` }))}
                  placeholder="Buscar distrito…" />
              </div>
              <div className="sm:col-span-2">
                <Input label="Dirección" value={ef.direccion} onChange={e => setEfField('direccion', e.target.value)} />
              </div>
            </div>
          </section>

          {/* Jornada y salario */}
          <section className="space-y-4">
            <h3 className="font-bold text-black text-sm border-b border-ds-gray-100 pb-2">Jornada y salario</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Salario mensual (₡)" type="number" value={ef.salarioMensual} onChange={e => setEfField('salarioMensual', e.target.value)} placeholder="0" />
              <TimeField label="Hora de entrada" value={ef.horaEntrada} onChange={v => setEfField('horaEntrada', v)} />
              <TimeField label="Hora de salida" value={ef.horaSalida} onChange={v => setEfField('horaSalida', v)} />
              <Input label="Talla de camisa" value={ef.tallaCamisa} onChange={e => setEfField('tallaCamisa', e.target.value)} placeholder="Ej. M" />
              <Input label="Talla de pantalón" value={ef.tallaPantalon} onChange={e => setEfField('tallaPantalon', e.target.value)} placeholder="Ej. 32" />
            </div>
          </section>

          {/* Dispositivo de marcaje (enrolamiento en zona H4) */}
          {idColaborador !== null && (
            <MarcajeEstadoZonas key={idColaborador} idColaborador={idColaborador} canEdit={isAdmin} />
          )}

          {/* Acceso al sistema */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-ds-gray-100 pb-2">
              <div className="flex items-center gap-2">
                <Icon name="rol" size="sm" className="text-ds-gray-400" />
                <h3 className="font-bold text-black text-sm">Acceso al sistema</h3>
              </div>
              {hasLogin && isSuperAdmin && (
                <Button variant="danger" size="xs" loading={revocando} onClick={handleRevocar}
                  icon={<Icon name="delete" size="sm" color="currentColor" />}>
                  Quitar login completo
                </Button>
              )}
            </div>

            {hasLogin ? (
              <>
                {isSuperAdmin ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Usuario de login" value={username}
                      onChange={e => setUsername(e.target.value)}
                      leftIcon={<span className="text-ds-gray-400 text-sm font-semibold">@</span>}
                      placeholder="usuario" />
                    <Input label="Cambiar contraseña" type="password" value={cambioClave}
                      onChange={e => setCambioClave(e.target.value)}
                      placeholder="Dejar vacío para no cambiar"
                      hint="La actual no se puede ver (está cifrada); escribí una nueva para cambiarla · mín. 8" />
                  </div>
                ) : (
                  <p className="text-body-sm text-ds-gray-400">Usuario de login: <span className="font-semibold text-black">@{username}</span>.</p>
                )}
                <p className="text-body-sm text-ds-gray-400">Editá los roles por app. Podés quitar el acceso a una app con “Quitar acceso”.</p>
                <AppRolePicker grupos={gruposApp} selectedRoles={selectedRoles} onToggle={toggleRol} resetKey={idColaborador}
                  onRevocarApp={ids => { setSelectedRoles(prev => prev.filter(id => !ids.includes(id))); setTiposByRol(t => { const n = { ...t }; ids.forEach(i => delete n[i]); return n; }); }} />
                <TiposSelector roles={roles} selectedRoles={selectedRoles} tiposByRol={tiposByRol} onChange={setTipoRol} />
              </>
            ) : !isSuperAdmin ? (
              <p className="text-sm text-ds-gray-400 py-2">Este colaborador <span className="font-semibold text-black">no tiene usuario de login</span> (sin acceso a las aplicaciones). No tenés permiso para darle acceso.</p>
            ) : !crearAcceso ? (
              <div className="flex items-center justify-between gap-3 rounded-ds bg-ds-gray-100 p-3">
                <p className="text-sm text-ds-gray-500">Este colaborador <span className="font-semibold text-black">no tiene acceso</span> a las aplicaciones.</p>
                <Button variant="primary" size="xs" onClick={() => setCrearAcceso(true)}
                  icon={<Icon name="plus" size="sm" color="currentColor" />}>
                  Dar acceso
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-body-sm text-ds-gray-400">Creá el usuario de login y elegí sus roles por app.</p>
                  <button type="button" onClick={() => setCrearAcceso(false)}
                    className="text-xs font-semibold text-ds-gray-400 hover:text-black transition-colors">Cancelar acceso</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Usuario (username)" value={nuevoUsername}
                    onChange={e => setNuevoUsername(e.target.value)} placeholder="ej. pedro.rizo" required />
                  <Input label="Contraseña" type="password" value={nuevaPassword}
                    onChange={e => setNuevaPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required
                    hint="Mínimo 8 caracteres" />
                </div>
                <AppRolePicker grupos={gruposApp} selectedRoles={selectedRoles} onToggle={toggleRol} resetKey={idColaborador} />
                <TiposSelector roles={roles} selectedRoles={selectedRoles} tiposByRol={tiposByRol} onChange={setTipoRol} />
              </>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
