'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
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
interface Proyecto { IDProyecto: number; CodigoBC: string; Nombre: string; Estado: string; asignaciones: Asignacion[]; }
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

  if (loading || !proyecto) return (
    <div className="p-6 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-1/3 mb-4" rounded="rounded-full" />
      <div className="bg-white rounded-ds-lg border border-ds-gray-200 p-6">
        <Skeleton className="h-4 w-1/2" rounded="rounded-full" />
      </div>
    </div>
  );

  const activos = proyecto.asignaciones.filter(a => a.Activo);
  const byTask = activos.reduce((acc, a) => {
    const key = a.TaskNoBC || 'Sin tarea';
    if (!acc[key]) acc[key] = { desc: a.DescripcionTask || 'Sin tarea asignada', members: [] };
    acc[key].members.push(a);
    return acc;
  }, {} as Record<string, { desc: string; members: Asignacion[] }>);

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-ds hover:bg-ds-gray-100 transition-colors text-ds-gray-400 hover:text-black mt-1 shrink-0">
          <Icon name="chevron-left" size="sm" color="currentColor" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-heading font-bold text-black">{proyecto.Nombre}</h1>
            <Badge variant="gray">{proyecto.CodigoBC}</Badge>
            <Badge variant="green">{proyecto.Estado}</Badge>
          </div>
          <p className="text-ds-gray-400 text-body-sm mt-0.5 flex items-center gap-1">
            <Icon name="user" size="sm" color="currentColor" />
            {activos.length} personas asignadas
          </p>
        </div>
        {session && session.nivelAdmin >= 2 && (
          <Button onClick={() => setModalOpen(true)} icon={<Icon name="user" size="sm" color="currentColor" />}>
            Asignar persona
          </Button>
        )}
      </div>

      {Object.keys(byTask).length === 0 ? (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-300">
          <Icon name="boleta" size="lg" color="currentColor" className="mx-auto mb-3" />
          <p className="font-semibold text-black">Sin personas asignadas</p>
          <p className="text-sm mt-1 text-ds-gray-400">Agrega colaboradores a este proyecto</p>
        </div>
      ) : (
        Object.entries(byTask).map(([taskNo, { desc, members }]) => (
          <div key={taskNo} className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
            <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
              <span className="font-bold text-black text-sm">{taskNo !== 'Sin tarea' ? `Tarea ${taskNo}` : 'Sin tarea'}</span>
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
                      <p className="text-sm font-semibold text-black">{m.NombreCompleto}</p>
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
    </div>
  );
}
