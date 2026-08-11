'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';

interface Asignacion {
  IDColProy: number;
  IDCol: number;
  NombreCompleto: string;
  Cedula: string;
  Puesto: string;
  NombreRol: string;
  TaskNoBC: string;
  DescripcionTask: string;
  Activo: boolean;
  FechaAsignacion: string;
}
interface ObraProy { IDObra: number; NumeroObra: string; Nombre: string | null; Estado: string | null; Activo: boolean; AreaCosteo: string | null; }
interface Proyecto { IDProyecto: number; CodigoBC: string; Nombre: string; Estado: string; Ubicacion: string; Activo: boolean; EsProductivo: boolean; asignaciones: Asignacion[]; obras: ObraProy[]; }
interface Colaborador { IDCol: number; NombreCompleto: string; Cedula: string; }

export default function ProyectoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const session = useSession();
  const { toast } = useToast();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [form, setForm] = useState({ idCol: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await fetch(`/api/proyectos/${id}`).then(r => r.json());
    setProyecto(data);
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/proyectos/${id}`).then(r => r.json()),
      fetch('/api/usuarios?activo=1&porPagina=5000').then(r => r.json()),
    ]).then(([p, u]) => {
      setProyecto(p);
      setColaboradores(u.data ?? []);
    }).finally(() => setLoading(false));
  }, [id]);

  async function handleAsignar() {
    if (!form.idCol) { toast('Selecciona un colaborador', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/proyectos/${id}/asignaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCol: parseInt(form.idCol) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'Error asignando', 'error'); return; }
      toast('Persona asignada al proyecto', 'success');
      setModalOpen(false);
      setForm({ idCol: '' });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleRetirar(idColProy: number) {
    await fetch(`/api/proyectos/${id}/asignaciones`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idColProy }) });
    toast('Persona retirada del proyecto', 'warning');
    await load();
  }

  const [patching, setPatching] = useState(false);
  // Marca/inactiva el proyecto (esProductivo / activo) y refresca.
  async function patchProyecto(campos: { esProductivo?: boolean; activo?: boolean }, okMsg: string) {
    setPatching(true);
    try {
      const res = await fetch(`/api/proyectos/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campos),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo actualizar el proyecto', 'error'); return; }
      toast(okMsg, 'success');
      await load();
    } finally { setPatching(false); }
  }

  // Editar la ficha del proyecto (nombre, categoría, ubicación).
  const [editOpen, setEditOpen] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: '', categoria: '', linkUbicacion: '' });

  function openEdit() {
    if (!proyecto) return;
    setEditForm({
      nombre: proyecto.Nombre ?? '',
      categoria: proyecto.Estado ?? '',
      linkUbicacion: proyecto.Ubicacion ?? '',
    });
    setEditOpen(true);
  }

  async function handleGuardarInfo() {
    if (!editForm.nombre.trim()) { toast('El nombre es obligatorio', 'warning'); return; }
    setSavingInfo(true);
    try {
      const res = await fetch(`/api/proyectos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: editForm.nombre,
          categoria: editForm.categoria,
          linkUbicacion: editForm.linkUbicacion,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo guardar la información', 'error'); return; }
      toast('Información actualizada', 'success');
      setEditOpen(false);
      await load();
    } finally { setSavingInfo(false); }
  }

  if (loading || !proyecto) return (
    <PageShell width="narrow">
      <Skeleton className="h-8 w-1/3" rounded="rounded-full" />
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 p-6">
        <Skeleton className="h-4 w-1/2" rounded="rounded-full" />
      </div>
    </PageShell>
  );

  const activos = proyecto.asignaciones.filter(a => a.Activo);
  const obrasProy = proyecto.obras ?? [];
  const byTask = activos.reduce((acc, a) => {
    const key = a.TaskNoBC || 'Sin tarea';
    if (!acc[key]) acc[key] = { desc: a.DescripcionTask || 'Sin tarea asignada', members: [] };
    acc[key].members.push(a);
    return acc;
  }, {} as Record<string, { desc: string; members: Asignacion[] }>);

  return (
    <PageShell width="narrow">
      <PageHeader
        back={
          <button onClick={() => router.back()} className="p-2 rounded-ds hover:bg-ds-gray-100 transition-colors text-ds-gray-400 hover:text-ds-ink mt-1 shrink-0">
            <Icon name="chevron-left" size="sm" color="currentColor" />
          </button>
        }
        title={
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-heading font-bold text-ds-ink">{proyecto.Nombre}</h1>
            <Badge variant="gray">{proyecto.CodigoBC}</Badge>
            {proyecto.EsProductivo && <Badge variant="green">Producción</Badge>}
            {!proyecto.Activo && <Badge variant="red">Inactivo</Badge>}
          </div>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1"><Icon name="user" size="sm" color="currentColor" />{activos.length} personas</span>
            <span className="flex items-center gap-1"><Icon name="place" size="sm" color="currentColor" />{obrasProy.length} obras</span>
            {proyecto.Estado && <span className="text-ds-gray-400">Categoría: {proyecto.Estado}</span>}
            {proyecto.Ubicacion && (
              <a href={proyecto.Ubicacion} target="_blank" rel="noreferrer" className="text-ds-green-ink hover:underline">Ver ubicación</a>
            )}
          </span>
        }
        actions={session && session.nivelAdmin >= 2 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={openEdit}
              icon={<Icon name="edit" size="sm" color="currentColor" />}>
              Editar información
            </Button>
            <Button variant="outline" loading={patching}
              onClick={() => patchProyecto({ esProductivo: !proyecto.EsProductivo }, proyecto.EsProductivo ? 'Proyecto ya no es de Producción' : 'Proyecto marcado como de Producción')}
              icon={<Icon name={proyecto.EsProductivo ? 'remove' : 'check'} size="sm" color="currentColor" />}>
              {proyecto.EsProductivo ? 'Quitar de Producción' : 'Marcar Producción'}
            </Button>
            <Button variant={proyecto.Activo ? 'danger' : 'primary'} loading={patching}
              onClick={() => patchProyecto({ activo: !proyecto.Activo }, proyecto.Activo ? 'Proyecto inactivado' : 'Proyecto activado')}
              icon={<Icon name={proyecto.Activo ? 'remove' : 'check'} size="sm" color="currentColor" />}>
              {proyecto.Activo ? 'Inactivar' : 'Activar'}
            </Button>
            <Button onClick={() => setModalOpen(true)} icon={<Icon name="user" size="sm" color="currentColor" />}>
              Asignar persona
            </Button>
          </div>
        )}
      />

      {obrasProy.length > 0 && (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
          <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-3">
            <Icon name="place" size="sm" color="currentColor" className="text-ds-gray-400" />
            <span className="font-bold text-ds-ink text-sm">Obras del proyecto</span>
            <Badge variant="gray" className="ml-auto shrink-0">{obrasProy.length}</Badge>
          </div>
          <div className="divide-y divide-ds-gray-100 max-h-[50vh] overflow-y-auto">
            {obrasProy.map(o => (
              <button key={o.IDObra} onClick={() => router.push(`/obras/${o.IDObra}`)}
                className={'w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-ds-gray-100/60 transition-colors ' + (o.Activo ? '' : 'opacity-60')}>
                <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0">{o.NumeroObra}</span>
                <span className="text-sm text-ds-ink flex-1 min-w-0 truncate">{o.Nombre || '—'}</span>
                {o.AreaCosteo && <span className="hidden sm:inline text-xs text-ds-gray-400 shrink-0">{o.AreaCosteo}</span>}
                {o.Estado && <Badge variant={o.Estado === 'Open' || o.Estado === 'Activo' ? 'green' : 'gray'}>{o.Estado}</Badge>}
                {!o.Activo && <Badge variant="red">Inactiva</Badge>}
                <Icon name="arrow-right" size="sm" color="currentColor" className="text-ds-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {Object.keys(byTask).length === 0 ? (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-300">
          <Icon name="boleta" size="lg" color="currentColor" className="mx-auto mb-3" />
          <p className="font-semibold text-ds-ink">Sin personas asignadas</p>
          <p className="text-sm mt-1 text-ds-gray-400">Agrega colaboradores a este proyecto</p>
        </div>
      ) : (
        Object.entries(byTask).map(([taskNo, { desc, members }]) => (
          <div key={taskNo} className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
            <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
              <span className="font-bold text-ds-ink text-sm">{taskNo !== 'Sin tarea' ? `Tarea ${taskNo}` : 'Sin tarea'}</span>
              <span className="text-ds-gray-400 text-sm flex-1 min-w-0 truncate">{desc}</span>
              <Badge variant="gray" className="ml-auto shrink-0">{members.length} personas</Badge>
            </div>
            <div className="divide-y divide-ds-gray-100">
              {members.map(m => {
                const iniciales = (m.NombreCompleto ?? m.Cedula ?? '?').split(' ').filter(Boolean).slice(0, 2).map((n: string) => n[0]).join('');
                return (
                  <div key={m.IDColProy} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-ds bg-brand flex items-center justify-center text-black text-xs font-bold shrink-0 shadow-ds-02">
                      {iniciales}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ds-ink">{m.NombreCompleto}</p>
                      <p className="text-xs text-ds-gray-400">{m.NombreRol}</p>
                    </div>
                    {m.FechaAsignacion && (
                      <span className="text-xs text-ds-gray-300 shrink-0">
                        {new Date(m.FechaAsignacion).toLocaleDateString('es-CR')}
                      </span>
                    )}
                    {session && session.nivelAdmin >= 2 && (
                      <button
                        onClick={() => handleRetirar(m.IDColProy)}
                        className="p-1.5 text-ds-gray-300 hover:text-ds-red hover:bg-ds-gray-100 rounded-ds transition-colors"
                      >
                        <Icon name="close" size="sm" color="currentColor" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar información del proyecto"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button loading={savingInfo} onClick={handleGuardarInfo}>Guardar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Nombre" value={editForm.nombre} required
            onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
          <Input label="Categoría" value={editForm.categoria} placeholder="Ej: Producción, Ciudad del Valle…"
            onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))} />
          <Input label="Ubicación (link)" value={editForm.linkUbicacion} placeholder="https://maps…"
            onChange={e => setEditForm(f => ({ ...f, linkUbicacion: e.target.value }))} />
          <p className="text-xs text-ds-gray-400">El código ({proyecto.CodigoBC}) es la llave del sistema y no se edita aquí.</p>
        </div>
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Asignar persona al proyecto"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button loading={saving} onClick={handleAsignar}>Asignar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Combobox label="Colaborador" value={String(form.idCol)} onChange={v => setForm(p => ({ ...p, idCol: v }))}
            placeholder="Seleccionar colaborador" required
            options={colaboradores.map(c => ({
              value: String(c.IDCol),
              label: `${c.NombreCompleto ?? c.Cedula} ${c.Cedula}`,
              parts: [{ text: c.NombreCompleto ?? c.Cedula, weight: 'bold' as const }, { text: c.Cedula, weight: 'light' as const }],
            }))} />
          <p className="text-xs text-ds-gray-400">Solo se pueden asignar colaboradores que tengan usuario de login.</p>
        </div>
      </Modal>
    </PageShell>
  );
}
