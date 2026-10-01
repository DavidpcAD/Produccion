'use client';
import { useState, useEffect, use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Combobox } from '@/components/ui/Combobox';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';

interface Miembro {
  IDCuadMiembro: number;
  IDCol: number;
  NombreCompleto: string;
  Cedula: string;
  Puesto: string;
  Activo: boolean;
  FechaIngreso: string;
}
interface OtraMembresia { IDCol: number; IDCuadrilla: number; Cuadrilla: string; }
interface Cuadrilla {
  IDCuadrilla: number;
  Nombre: string;
  Proyecto: string;
  CodigoBC: string;
  Encargado: string;
  Capacidad: number;
  IDProyecto: number;
  IDEncargado: number;
  TaskNoBC: string | null;
  idSubPartida: number | null;
  SubPartidaCodigo: string | null;
  SubPartidaNombre: string | null;
  PartidaCodigo: string | null;
  PartidaNombre: string | null;
  miembros: Miembro[];
  otrasMembresias: OtraMembresia[];
}
interface Colaborador { IDCol: number; NombreCompleto: string; Cedula: string; }

export default function CuadrillaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const session = useSession();
  const { toast } = useToast();
  const isAdmin = !!session && session.nivelAdmin >= 2;

  const [cuadrilla, setCuadrilla] = useState<Cuadrilla | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedCol, setSelectedCol] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await fetch(`/api/cuadrillas/${id}`).then(r => r.json());
    setCuadrilla(data);
  }

  useEffect(() => {
    // Ya no se piden /api/proyectos ni /api/partidas: solo alimentaban los
    // selectores del editor que vivía acá, que nunca pudo guardar. Son dos viajes
    // menos en cada entrada (el catálogo de partidas son 22 KB).
    Promise.all([
      fetch(`/api/cuadrillas/${id}`).then(r => r.json()),
      fetch('/api/usuarios?activo=1&porPagina=5000&campos=basico').then(r => r.json()),
    ]).then(([c, u]) => {
      setCuadrilla(c);
      setColaboradores(u.data ?? []);
    }).finally(() => setLoading(false));
  }, [id]);

  // Mapa idCol -> nombre de la otra cuadrilla (para pintar en gris / bloquear).
  const otraCuadrillaPorCol = useMemo(() => {
    const m = new Map<number, string>();
    (cuadrilla?.otrasMembresias ?? []).forEach(o => m.set(o.IDCol, o.Cuadrilla));
    return m;
  }, [cuadrilla]);

  const yaEnEsta = useMemo(
    () => new Set((cuadrilla?.miembros ?? []).filter(m => m.Activo).map(m => m.IDCol)),
    [cuadrilla],
  );

  async function handleAgregar() {
    if (!selectedCol) { toast('Selecciona un colaborador', 'warning'); return; }
    const otra = otraCuadrillaPorCol.get(parseInt(selectedCol));
    if (otra) { toast(`Ese colaborador pertenece a la cuadrilla "${otra}". Quítalo de ahí primero.`, 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/cuadrillas/${id}/miembros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCol: parseInt(selectedCol) }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || 'Error agregando miembro', 'error'); return; }
      toast('Miembro agregado', 'success');
      setModalOpen(false);
      setSelectedCol('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleQuitar(idCuadMiembro: number) {
    // Se revisa la respuesta antes de cantar victoria: si la sesión venció o el
    // servidor falló, el miembro sigue ahí y decirle "removido" al usuario lo
    // manda a cerrar la pantalla creyendo que quedó hecho. Mismo trato que
    // `handleAgregar` acá arriba.
    const res = await fetch(`/api/cuadrillas/${id}/miembros`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idCuadMiembro }) });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast(e.error || 'No se pudo quitar el miembro', 'error');
      return;
    }
    toast('Miembro removido', 'warning');
    await load();
  }

  if (loading || !cuadrilla) return (
    <PageShell width="narrow">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 shrink-0" rounded="rounded-ds" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-1/2" rounded="rounded-full" />
          <Skeleton className="h-4 w-2/3" rounded="rounded-full" />
        </div>
      </div>
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-3">
        <Skeleton className="h-4 w-1/3" rounded="rounded-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </PageShell>
  );

  const activos = cuadrilla.miembros.filter(m => m.Activo);
  const pct = Math.round((activos.length / cuadrilla.Capacidad) * 100);
  const barColor = pct > 80 ? 'bg-ds-red' : pct > 60 ? 'bg-ds-yellow' : 'bg-brand';

  return (
    <PageShell width="narrow">
      <PageHeader
        back={
          <button onClick={() => router.back()} className="p-2 rounded-ds hover:bg-ds-gray-100 transition-colors text-ds-gray-400 hover:text-ds-ink mt-1 shrink-0">
            <Icon name="chevron-left" size="md" color="currentColor" />
          </button>
        }
        title={
          <div className="min-w-0">
            <h1 className="text-heading font-bold text-ds-ink">{cuadrilla.Nombre}</h1>
            <p className="text-ds-gray-400 text-body-sm">{cuadrilla.Proyecto} · Encargado: {cuadrilla.Encargado}</p>
            {(cuadrilla.SubPartidaCodigo || cuadrilla.TaskNoBC) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {cuadrilla.PartidaCodigo && (
                  <Badge variant="gray">Partida: {cuadrilla.PartidaCodigo} · {cuadrilla.PartidaNombre}</Badge>
                )}
                <Badge variant="black">
                  Tarea BC: {cuadrilla.SubPartidaCodigo ?? cuadrilla.TaskNoBC}
                  {cuadrilla.SubPartidaNombre ? ` · ${cuadrilla.SubPartidaNombre}` : ''}
                </Badge>
              </div>
            )}
          </div>
        }
        actions={isAdmin && (
          <>
            {/* A la LISTA, que es donde vive el editor de verdad. El que había acá
                no se podía guardar: quedó del modelo de UN proyecto por cuadrilla y
                nunca se actualizó al de varios (`bloques`). Mandaba `idProyecto` e
                `idSubPartida` sueltos —el API espera bloques con sus obras— y
                encima abría con el proyecto y la subpartida VACÍOS, porque leía
                `IDProyecto` cuando la API devuelve `idProyecto` y porque esa
                consulta nunca trajo `idSubPartida`. Resultado: "La subpartida
                (tarea BC) es obligatoria" y de ahí no pasaba. */}
            <Button variant="outline" onClick={() => router.push('/cuadrillas')} icon={<Icon name="edit" size="sm" color="currentColor" />}>
              Editar en la lista
            </Button>
            <Button onClick={() => setModalOpen(true)} icon={<Icon name="user" size="sm" color="currentColor" />}>
              Agregar
            </Button>
          </>
        )}
      />

      {/* Capacity */}
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-semibold text-ds-ink">Capacidad</span>
          <span className="text-sm font-bold text-ds-ink">{activos.length} / {cuadrilla.Capacidad}</span>
        </div>
        <div className="h-2 rounded-full bg-ds-gray-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <p className="text-xs text-ds-gray-400 mt-1">{pct}% de capacidad utilizada</p>
      </div>

      {/* Miembros */}
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
        <div className="px-5 py-3 border-b border-ds-gray-200 bg-ds-gray-100">
          <h2 className="font-bold text-ds-ink text-label">Miembros activos</h2>
        </div>
        {activos.length === 0 ? (
          <div className="p-12 text-center text-ds-gray-300">
            <Icon name="boleta" size="lg" color="currentColor" className="mx-auto mb-2" />
            <p className="text-sm font-medium text-ds-ink">Sin miembros en esta cuadrilla</p>
          </div>
        ) : (
          <div className="divide-y divide-ds-gray-100">
            {activos.map(m => {
              const iniciales = m.NombreCompleto.split(' ').slice(0, 2).map((n: string) => n[0]).join('');
              return (
                <div key={m.IDCuadMiembro} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-9 h-9 rounded-ds bg-brand flex items-center justify-center text-black text-xs font-bold shrink-0 shadow-ds-02">
                    {iniciales}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ds-ink">{m.NombreCompleto}</p>
                    <p className="text-xs text-ds-gray-400">{m.Cedula} · {m.Puesto || 'Sin puesto'}</p>
                  </div>
                  <span className="text-xs text-ds-gray-300 hidden sm:block shrink-0">
                    Desde {new Date(m.FechaIngreso).toLocaleDateString('es-CR')}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => handleQuitar(m.IDCuadMiembro)}
                      className="p-1.5 text-ds-gray-300 hover:text-ds-red hover:bg-ds-gray-100 rounded-ds transition-colors"
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

      {/* Agregar miembro */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Agregar miembro a cuadrilla"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button loading={saving} onClick={handleAgregar}>Agregar</Button>
          </>
        }
      >
        <div className="space-y-2">
          <Combobox
            label="Colaborador"
            value={String(selectedCol)}
            onChange={setSelectedCol}
            placeholder="Seleccionar colaborador"
            options={colaboradores
              .filter(c => !yaEnEsta.has(c.IDCol))
              .map(c => {
                const otra = otraCuadrillaPorCol.get(c.IDCol);
                return {
                  value: String(c.IDCol),
                  label: `${c.NombreCompleto} ${c.Cedula}${otra ? ` (en ${otra})` : ''}`,
                  parts: otra
                    ? [
                        { text: c.NombreCompleto, weight: 'light' as const },
                        { text: `en ${otra}`, weight: 'light' as const },
                      ]
                    : [
                        { text: c.NombreCompleto, weight: 'bold' as const },
                        { text: c.Cedula, weight: 'light' as const },
                      ],
                  search: c.Cedula,
                };
              })}
          />
          {selectedCol && otraCuadrillaPorCol.get(parseInt(selectedCol)) && (
            <p className="text-xs text-ds-red">
              Este colaborador ya pertenece a la cuadrilla “{otraCuadrillaPorCol.get(parseInt(selectedCol))}”. Quítalo de ahí antes de agregarlo aquí.
            </p>
          )}
          <p className="text-xs text-ds-gray-400">Los colaboradores en gris ya pertenecen a otra cuadrilla.</p>
        </div>
      </Modal>

    </PageShell>
  );
}
