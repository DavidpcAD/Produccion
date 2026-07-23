'use client';
import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge, NivelAdminBadge } from '@/components/ui/Badge';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { MarcajeEstadoZonas } from '@/components/usuarios/MarcajeEstadoZonas';
import { ColaboradorEditModal } from '@/components/usuarios/ColaboradorEditModal';

interface Usuario {
  IDCol: number;
  Cedula: string;
  Nombre: string;
  PrimerApellido: string;
  SegundoApellido: string;
  NombreCompleto: string;
  Correo: string;
  Telefono: string;
  Departamento: string;
  Puesto: string;
  Activo: boolean;
  FechaIngreso: string;
  Sexo: string;
  Provincia: string;
  Canton: string;
  Distrito: string;
  Direccion: string;
  Pais: string;
  idPuesto: number | null;
  codigoDistrito: string | null;
  idPais: number | null;
  Username: string;
  SalarioMensual: number | null;
  HoraEntrada: string | null;
  HoraSalida: string | null;
  roles: { IDRol: number; NombreRol: string; Categoria: string; NivelAdmin: number; esTipo?: string }[];
  proyectos: { IDProyecto: number; Nombre: string; CodigoBC: string; NombreRol: string; Activo: boolean }[];
}

export default function UsuarioDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const session = useSession();
  const { toast } = useToast();

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDesactivar, setConfirmDesactivar] = useState(false);
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const u = await fetch(`/api/usuarios/${id}`, { cache: 'no-store' }).then(r => r.json());
      setUsuario(u);
    } catch {
      toast('Error cargando usuario', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Desactivar = editar conservando los datos actuales y esActivo = 0.
  async function handleDesactivar() {
    if (!usuario) return;
    setSaving(true);
    try {
      await fetch(`/api/usuarios/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: usuario.Nombre, primerApellido: usuario.PrimerApellido, segundoApellido: usuario.SegundoApellido,
          correo: usuario.Correo, telefono: usuario.Telefono, activo: false,
          fechaIngreso: usuario.FechaIngreso ? usuario.FechaIngreso.split('T')[0] : '',
          sexo: usuario.Sexo, direccion: usuario.Direccion,
          idPuesto: usuario.idPuesto, codigoDistrito: usuario.codigoDistrito, idPais: usuario.idPais,
        }),
      });
      toast('Colaborador desactivado', 'warning');
      setConfirmDesactivar(false);
      router.push('/usuarios');
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(d.error || 'No se pudo eliminar', 'error');
        setConfirmEliminar(false);
        return;
      }
      toast('Colaborador eliminado', 'success');
      setConfirmEliminar(false);
      router.push('/usuarios');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-ds-lg border border-ds-gray-200 p-6">
          <Skeleton className="h-4 w-1/4 mb-4" rounded="rounded-full" />
          <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map(j => <Skeleton key={j} className="h-10 w-full" />)}</div>
        </div>
      ))}
    </div>
  );

  if (!usuario) return (
    <div className="p-6 text-center text-ds-gray-400">Colaborador no encontrado</div>
  );

  const canEdit = session && session.nivelAdmin >= 2;
  const canDeactivate = session && session.nivelAdmin >= 3;
  const canDelete = session && session.nivelAdmin >= 4;
  const maxNivel = usuario.roles.reduce((m, r) => Math.max(m, r.NivelAdmin), 0);
  const iniciales = (usuario.NombreCompleto ?? '').split(' ').filter(Boolean).slice(0, 2).map((n: string) => n[0]).join('');

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-5">
      {/* Header card */}
      <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-ds hover:bg-ds-gray-100 transition-colors text-ds-gray-400 hover:text-black shrink-0">
            <Icon name="chevron-left" size="sm" color="currentColor" />
          </button>
          <div className="w-14 h-14 rounded-ds-lg bg-brand flex items-center justify-center text-black text-lg font-bold shadow-ds-02 shrink-0">
            {iniciales}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-heading font-bold text-black">{usuario.NombreCompleto}</h1>
              <Badge variant={usuario.Activo ? 'green' : 'red'} dot>{usuario.Activo ? 'Activo' : 'Inactivo'}</Badge>
            </div>
            <p className="text-ds-gray-400 text-body-sm mt-0.5">
              {usuario.Puesto || 'Sin puesto'} · {usuario.Departamento || 'Sin departamento'}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <NivelAdminBadge nivel={maxNivel} />
              {usuario.roles.map(r => (
                <Badge key={r.IDRol} variant="gray">
                  {r.NombreRol}{r.esTipo && r.esTipo !== 'Indefinido' ? ` · ${r.esTipo}` : ''}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {canDeactivate && usuario.Activo && (
              <Button variant="outline" size="sm" onClick={() => setConfirmDesactivar(true)}>Desactivar</Button>
            )}
            {canDelete && (
              <Button variant="outline" size="sm" onClick={() => setConfirmEliminar(true)}
                className="!text-ds-red !border-ds-red/40 hover:!bg-ds-red/10"
                icon={<Icon name="delete" size="sm" color="currentColor" />}>
                Eliminar
              </Button>
            )}
            {canEdit && (
              <Button size="sm" onClick={() => setEditOpen(true)} icon={<Icon name="edit" size="sm" color="currentColor" />}>
                Editar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Datos (solo lectura). La edición es el modal único. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: 'Usuario', value: usuario.Username || '—' },
          { label: 'Cédula', value: usuario.Cedula },
          { label: 'Correo', value: usuario.Correo || '—' },
          { label: 'Teléfono', value: usuario.Telefono || '—' },
          { label: 'Departamento', value: usuario.Departamento || '—' },
          { label: 'Puesto', value: usuario.Puesto || '—' },
          { label: 'Fecha ingreso', value: usuario.FechaIngreso ? new Date(usuario.FechaIngreso).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' }) : '—' },
          { label: 'País', value: usuario.Pais || '—' },
          { label: 'Provincia', value: usuario.Provincia || '—' },
          { label: 'Cantón', value: usuario.Canton || '—' },
          { label: 'Distrito', value: usuario.Distrito || '—' },
          { label: 'Dirección', value: usuario.Direccion || '—' },
          { label: 'Salario mensual', value: usuario.SalarioMensual != null ? `₡${Number(usuario.SalarioMensual).toLocaleString('es-CR', { minimumFractionDigits: 2 })}` : '—' },
          { label: 'Jornada', value: usuario.HoraEntrada && usuario.HoraSalida ? `${usuario.HoraEntrada} – ${usuario.HoraSalida}` : '—' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-ds border border-ds-gray-200 px-4 py-3 shadow-ds-01">
            <p className="text-xs text-ds-gray-400 font-medium mb-0.5">{item.label}</p>
            <p className="text-sm font-semibold text-black">{item.value}</p>
          </div>
        ))}
      </div>

      <MarcajeEstadoZonas idColaborador={usuario.IDCol} canEdit={!!canEdit} />

      {usuario.proyectos.length > 0 && (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-6">
          <h2 className="font-bold text-black mb-4">Proyectos asignados</h2>
          <div className="space-y-2">
            {usuario.proyectos.map(p => (
              <div key={p.IDProyecto} className="flex items-center gap-3 px-3 py-2.5 rounded-ds hover:bg-ds-gray-100 transition-colors">
                <div className="w-8 h-8 rounded-ds bg-ds-gray-100 flex items-center justify-center shrink-0">
                  <Icon name="folder" size="sm" color="var(--ds-color-gray-400)" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-black truncate">{p.Nombre}</p>
                  <p className="text-xs text-ds-gray-400">{p.CodigoBC} · {p.NombreRol}</p>
                </div>
                <Badge variant={p.Activo ? 'green' : 'gray'} dot>{p.Activo ? 'Activo' : 'Retirado'}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Editor único (mismo modal que la lista) */}
      <ColaboradorEditModal
        idColaborador={editOpen ? usuario.IDCol : null}
        onClose={() => setEditOpen(false)}
        onSaved={cargar}
      />

      <ConfirmModal
        open={confirmDesactivar}
        onClose={() => setConfirmDesactivar(false)}
        onConfirm={handleDesactivar}
        title="Desactivar colaborador"
        message={`¿Confirmas que deseas desactivar a ${usuario.NombreCompleto}? Esta acción quedará registrada en auditoría.`}
        confirmLabel="Desactivar"
        danger
        loading={saving}
      />

      <ConfirmModal
        open={confirmEliminar}
        onClose={() => setConfirmEliminar(false)}
        onConfirm={handleEliminar}
        title="Eliminar colaborador"
        message={`¿Eliminar DEFINITIVAMENTE a ${usuario.NombreCompleto}? Solo se puede si no tiene usuario/login ni cuadrillas asociadas; de lo contrario deberás desactivarlo. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        loading={deleting}
      />
    </div>
  );
}
