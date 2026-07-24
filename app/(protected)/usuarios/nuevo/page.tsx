'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { TiposSelector } from '@/components/roles/TiposSelector';

interface Rol { IDRol: number; NombreRol: string; Categoria: string; idApp: number; tipos?: { idTipoRol: number; nombre: string }[]; }
interface Puesto { idPuesto: number; puesto: string; departamento: string; }
interface Distrito { codigoDistrito: string; distrito: string; canton: string; provincia: string; }
interface Zona { idZona: number; nombre: string; ubicacion: string | null; }

// username → minúsculas, sin tildes ni símbolos (convención de la base: primer nombre).
const normUser = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export default function NuevoColaboradorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [distritos, setDistritos] = useState<Distrito[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [tiposByRol, setTiposByRol] = useState<Record<number, string>>({});
  const [tieneAcceso, setTieneAcceso] = useState(false);
  const [form, setForm] = useState({
    cedula: '', nombre: '', primerApellido: '', segundoApellido: '',
    correo: '', telefono: '', idPuesto: '', sexo: '', fechaIngreso: '',
    codigoDistrito: '', direccion: '', username: '', password: '', confirmPassword: '',
    salarioMensual: '', horaEntrada: '06:00', horaSalida: '17:00', idZonaMarcaje: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/roles').then(r => r.json()).then(d => setRoles(d.data ?? [])).catch(() => {});
    fetch('/api/catalogos').then(r => r.json()).then(d => {
      setPuestos(d.puestos ?? []);
      setDistritos(d.distritos ?? []);
      setZonas(d.zonas ?? []);
    }).catch(() => {});
  }, []);

  const crearUsuario = tieneAcceso && selectedRoles.length > 0;

  // Apps que tienen roles configurados (para elegir acceso).
  const gruposApp = Object.values(
    roles.reduce((acc, r) => {
      (acc[r.idApp] ??= { idApp: r.idApp, nombre: r.Categoria || 'Sin app', roles: [] }).roles.push(r);
      return acc;
    }, {} as Record<number, { idApp: number; nombre: string; roles: Rol[] }>),
  );

  function handleChange(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  }

  function setAcceso(v: boolean) {
    setTieneAcceso(v);
    if (!v) {
      setSelectedRoles([]);
    } else if (!form.username && form.nombre) {
      // sugerir username desde el nombre (editable)
      setForm(f => ({ ...f, username: normUser(form.nombre) }));
    }
  }

  // Reemplaza los roles seleccionados de una app por los nuevos elegidos.
  function setRolesDeApp(appRoles: Rol[], vals: string[]) {
    const idsApp = appRoles.map(r => r.IDRol);
    const nuevos = vals.map(Number);
    setSelectedRoles(prev => [...prev.filter(id => !idsApp.includes(id)), ...nuevos]);
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.cedula.trim()) errs.cedula = 'Requerido';
    if (!form.nombre.trim()) errs.nombre = 'Requerido';
    if (!form.primerApellido.trim()) errs.primerApellido = 'Requerido';
    if (!form.telefono.trim()) errs.telefono = 'Requerido';
    if (!form.idPuesto) errs.idPuesto = 'Requerido';
    if (tieneAcceso) {
      if (selectedRoles.length === 0) errs.acceso = 'Elegí al menos un rol en alguna app';
      if (!form.username.trim()) errs.username = 'Requerido para dar acceso';
      if (form.password.length < 8) errs.password = 'Mínimo 8 caracteres';
      if (form.password !== form.confirmPassword) errs.confirmPassword = 'No coinciden';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) { toast('Revisá los campos requeridos', 'warning'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, idPuesto: Number(form.idPuesto), roles: selectedRoles, tipos: tiposByRol }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Error creando colaborador', 'error'); return; }
      toast(data.usuarioCreado ? 'Colaborador y usuario creados' : 'Colaborador creado', 'success');
      // El colaborador ya quedó creado; el enrolamiento en zona puede fallar aparte.
      if (data.enrolamientoError) {
        toast(`Colaborador creado, pero el enrolamiento en la zona falló: ${data.enrolamientoError}`, 'warning');
      } else if (data.enrolamiento) {
        toast(`Enrolado en ${data.enrolamiento.equipos} reloj(es). Debe pasar la cara por uno de la zona.`, 'success');
      }
      router.push(`/usuarios/${data.idCol}`);
    } finally {
      setLoading(false);
    }
  }

  const departamentoSel = puestos.find(p => String(p.idPuesto) === form.idPuesto)?.departamento ?? '';

  const section = (title: string, sub?: string) => (
    <div className="border-b border-ds-gray-100 pb-3 mb-4">
      <h2 className="font-bold text-black">{title}</h2>
      {sub && <p className="text-xs text-ds-gray-400 mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="p-2 rounded-ds hover:bg-ds-gray-100 transition-colors text-ds-gray-400 hover:text-black">
          <Icon name="chevron-left" size="md" color="currentColor" />
        </button>
        <div>
          <h1 className="text-heading font-bold text-black">Nuevo colaborador</h1>
          <p className="text-ds-gray-400 text-body-sm">Completa la información del colaborador</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Datos personales */}
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6">
          {section('Datos personales')}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Cédula" placeholder="012345678" value={form.cedula} onChange={e => handleChange('cedula', e.target.value)} error={errors.cedula} required />
            <Input label="Nombre" placeholder="Juan" value={form.nombre} onChange={e => handleChange('nombre', e.target.value)} error={errors.nombre} required />
            <Input label="Primer apellido" placeholder="Pérez" value={form.primerApellido} onChange={e => handleChange('primerApellido', e.target.value)} error={errors.primerApellido} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <Input label="Segundo apellido" placeholder="García" value={form.segundoApellido} onChange={e => handleChange('segundoApellido', e.target.value)} />
            <Combobox label="Sexo" value={form.sexo} onChange={v => handleChange('sexo', v)}
              options={[{ value: 'Masculino', label: 'Masculino' }, { value: 'Femenino', label: 'Femenino' }, { value: 'Sin definir', label: 'Sin definir' }]}
              placeholder="Seleccionar" />
            <DatePicker label="Fecha de ingreso" value={form.fechaIngreso} onChange={v => handleChange('fechaIngreso', v)} />
          </div>
        </div>

        {/* Contacto */}
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6">
          {section('Información de contacto')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Correo electrónico" type="email" placeholder="juan@adelante.cr" value={form.correo} onChange={e => handleChange('correo', e.target.value)} />
            <Input label="Teléfono" placeholder="8888-8888" value={form.telefono} onChange={e => handleChange('telefono', e.target.value)} error={errors.telefono} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Combobox label="Distrito" value={form.codigoDistrito} onChange={v => handleChange('codigoDistrito', v)}
              options={distritos.map(d => ({
                value: d.codigoDistrito,
                label: `${d.distrito} · ${d.canton} · ${d.provincia}`,
                parts: [{ text: d.distrito, weight: 'bold' as const }, { text: d.canton, weight: 'normal' as const }, { text: d.provincia, weight: 'light' as const }],
                search: `${d.canton} ${d.provincia}`,
              }))}
              placeholder="Buscar distrito…" emptyText="Sin resultados" />
            <Input label="Dirección" placeholder="100m norte del parque…" value={form.direccion} onChange={e => handleChange('direccion', e.target.value)} />
          </div>
        </div>

        {/* Laboral */}
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6">
          {section('Información laboral')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Combobox label="Puesto" value={form.idPuesto} onChange={v => handleChange('idPuesto', v)}
              options={puestos.map(p => ({
                value: String(p.idPuesto),
                label: `${p.puesto}`,
                parts: [{ text: p.puesto, weight: 'bold' as const }, { text: p.departamento, weight: 'light' as const }],
                search: p.departamento,
              }))}
              placeholder="Seleccionar puesto" required />
            <Input label="Departamento" value={departamentoSel} disabled placeholder="Se deriva del puesto" />
          </div>
          {errors.idPuesto && <p className="text-xs text-ds-red mt-1">{errors.idPuesto}</p>}
        </div>

        {/* Jornada, salario y marcaje */}
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6">
          {section('Jornada, salario y marcaje', 'Horario de trabajo, salario y enrolamiento en el dispositivo de marcaje (el reloj captura la biometría; aquí queda el registro).')}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Salario mensual (₡)" type="number" placeholder="0" value={form.salarioMensual}
              onChange={e => handleChange('salarioMensual', e.target.value)} />
            <Input label="Hora de entrada" type="time" value={form.horaEntrada}
              onChange={e => handleChange('horaEntrada', e.target.value)} />
            <Input label="Hora de salida" type="time" value={form.horaSalida}
              onChange={e => handleChange('horaSalida', e.target.value)} />
          </div>
          <div className="mt-4 rounded-ds border border-ds-gray-200 p-4 bg-ds-gray-100/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
                <Icon name="user" size="sm" color="currentColor" className="text-brand" />
              </div>
              <span className="text-sm font-semibold text-black">Dispositivo de marcaje</span>
              <span className={`ml-auto px-2.5 py-1 rounded-ds text-xs font-semibold ${form.idZonaMarcaje ? 'bg-ds-green-soft text-ds-green-ink' : 'bg-ds-gray-100 text-ds-gray-500'}`}>
                {form.idZonaMarcaje ? 'Se enrolará' : 'No marcará'}
              </span>
            </div>
            <Combobox label="Zona de marca" value={form.idZonaMarcaje} onChange={v => handleChange('idZonaMarcaje', v)}
              options={zonas.map(z => ({
                value: String(z.idZona),
                label: z.nombre,
                parts: [{ text: z.nombre, weight: 'bold' as const }, ...(z.ubicacion ? [{ text: z.ubicacion, weight: 'light' as const }] : [])],
                search: z.ubicacion ?? '',
              }))}
              placeholder={zonas.length ? 'Seleccionar zona (opcional)' : 'No hay zonas configuradas'}
              emptyText="Sin zonas" />
            <p className="text-xs text-ds-gray-400 mt-2">
              Elegí la zona donde el colaborador marcará: queda dado de alta en todos los relojes de esa zona (el PIN es su cédula). Luego debe pasar la cara/huella por <span className="font-semibold">cualquiera</span> de ellos y el sistema la replica al resto. Si la dejás vacía, no marca por ahora (se puede enrolar después).
            </p>
          </div>
        </div>

        {/* Acceso al sistema */}
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6">
          {section('Acceso al sistema', 'Definí si el colaborador usará las aplicaciones. Sin acceso, queda solo como colaborador.')}

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-black">¿Tendrá acceso a las aplicaciones?</span>
            <div className="flex rounded-ds border border-ds-gray-200 overflow-hidden">
              {[{ v: false, t: 'No' }, { v: true, t: 'Sí' }].map(o => (
                <button key={o.t} type="button" onClick={() => setAcceso(o.v)}
                  className={`px-4 py-1.5 text-sm font-semibold transition-colors ${tieneAcceso === o.v ? 'bg-black text-white' : 'bg-white text-ds-gray-500 hover:bg-ds-gray-100'}`}>
                  {o.t}
                </button>
              ))}
            </div>
          </div>

          {tieneAcceso && (
            <div className="mt-5 space-y-3">
              <p className="text-xs text-ds-gray-400">Elegí las apps y el/los rol(es) que tendrá en cada una. Solo aparecen las apps con roles configurados.</p>
              {errors.acceso && <p className="text-xs text-ds-red">{errors.acceso}</p>}
              {gruposApp.length === 0 ? (
                <p className="text-sm text-ds-gray-400 py-4">No hay apps con roles configurados. Creá roles primero en la sección Roles.</p>
              ) : gruposApp.map(g => {
                const sel = selectedRoles.filter(id => g.roles.some(r => r.IDRol === id)).map(String);
                return (
                  <div key={g.idApp} className={`rounded-ds border p-4 transition-colors ${sel.length ? 'border-black' : 'border-ds-gray-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
                        <Icon name="list" size="sm" color="currentColor" className="text-brand" />
                      </div>
                      <span className="text-sm font-semibold text-black">{g.nombre}</span>
                      {sel.length > 0 && <span className="text-xs text-ds-gray-400">· {sel.length} {sel.length === 1 ? 'rol' : 'roles'}</span>}
                    </div>
                    <Combobox multiple values={sel} onValuesChange={vals => setRolesDeApp(g.roles, vals)}
                      options={g.roles.map(r => ({ value: String(r.IDRol), label: r.NombreRol }))}
                      placeholder="Elegir rol(es) de esta app…" emptyText="Sin roles" />
                  </div>
                );
              })}
              <TiposSelector roles={roles} selectedRoles={selectedRoles} tiposByRol={tiposByRol}
                onChange={(idRol, tipo) => setTiposByRol(prev => { const n = { ...prev }; if (tipo) n[idRol] = tipo; else delete n[idRol]; return n; })} />
            </div>
          )}
        </div>

        {/* Credenciales — solo si tendrá acceso */}
        {tieneAcceso && (
          <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6">
            {section('Credenciales de acceso', 'Con estas credenciales el colaborador inicia sesión (se crea el usuario).')}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Usuario" placeholder="jperez" value={form.username} onChange={e => handleChange('username', e.target.value)} error={errors.username} required />
              <Input label="Contraseña" type="password" placeholder="Mínimo 8 caracteres" value={form.password} onChange={e => handleChange('password', e.target.value)} error={errors.password} required />
              <Input label="Confirmar contraseña" type="password" placeholder="Repetir" value={form.confirmPassword} onChange={e => handleChange('confirmPassword', e.target.value)} error={errors.confirmPassword} required />
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end pb-6">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" loading={loading} icon={<Icon name="user" size="sm" color="currentColor" />}>
            Crear colaborador
          </Button>
        </div>
      </form>
    </div>
  );
}
