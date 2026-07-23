'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { springs } from '@/lib/springs';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ObraEditModal } from '@/components/obras/ObraEditModal';

interface Obra {
  idObra: number;
  numeroObra: string;
  nombreMostrado: string | null;
  descripcion: string | null;
  centroCosto: string | null;
  areaCosteo: string | null;
  proyectoPadre: string | null;
  idProyecto: number | null;
  proyectoNombre: string | null;
  gerenteProyecto: string | null;
  idEncargado: string | null;
  ubicacion: string | null;
  estado: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  areaProrrateadaM2: number | null;
  precioNormalMaquinaria: number | null;
  precioConcretoMaquinaria: number | null;
  origenPrincipal: string | null;
  esBC: boolean | null;
  esProcore: boolean | null;
  fechaCreacion: string | null;
  creadoPor: string | null;
  fechaModificacion: string | null;
  modificadoPor: string | null;
}

const fmtFecha = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CR');
};
const fmtMonto = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Chip de estado de la obra: relleno suave y en español (Abierta / Bloqueada).
function EstadoObra({ estado }: { estado: string | null }) {
  if (!estado) return null;
  const e = estado.toLowerCase();
  const cfg = e === 'open'
    ? { label: 'Abierta', cls: 'bg-brand/15 text-[#4a6f00]', dot: 'bg-brand' }
    : e === 'blocked'
      ? { label: 'Bloqueada', cls: 'bg-ds-red/10 text-ds-red', dot: 'bg-ds-red' }
      : { label: estado, cls: 'bg-ds-gray-100 text-ds-gray-500', dot: 'bg-ds-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-[13px] font-semibold ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />{cfg.label}
    </span>
  );
}

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <dt className="text-ds-gray-400 font-medium shrink-0">{label}</dt>
      <dd className="text-black font-semibold text-right min-w-0 break-words">{value || '—'}</dd>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
      <div className="px-4 py-3 bg-ds-gray-100 border-b border-ds-gray-200">
        <h2 className="font-bold text-black text-sm">{titulo}</h2>
      </div>
      <dl className="divide-y divide-ds-gray-100 text-sm">{children}</dl>
    </div>
  );
}

export default function ObraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const session = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const isAdmin = !!session && session.nivelAdmin >= 2;
  const [obra, setObra] = useState<Obra | null>(null);
  const [loading, setLoading] = useState(true);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [proyectos, setProyectos] = useState<{ IDProyecto: number; Nombre: string; CodigoBC: string }[]>([]);
  // Bloqueo: el usuario elige a qué Postventa (obra PV-…) va la obra.
  const [bloqueoOpen, setBloqueoOpen] = useState(false);
  const [postventas, setPostventas] = useState<{ idObra: number; numeroObra: string; nombreMostrado: string | null }[]>([]);
  const [postventaSel, setPostventaSel] = useState('');

  // Edición (modal compartido con la lista)
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    const data = await fetch(`/api/obras/${id}`).then(r => (r.ok ? r.json() : null));
    setObra(data);
  }

  useEffect(() => {
    fetch(`/api/obras/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setObra)
      .catch(() => setObra(null))
      .finally(() => setLoading(false));
    fetch('/api/proyectos').then(r => r.json()).then(d => setProyectos(d.data ?? [])).catch(() => {});
    fetch('/api/obras/postventas').then(r => r.json()).then(d => setPostventas(d.data ?? [])).catch(() => {});
  }, [id]);

  const estaBloqueada = (obra?.estado ?? '').toLowerCase() === 'blocked';

  async function postBloqueo(blocked: boolean, postventaNo?: string) {
    setCambiandoEstado(true);
    try {
      const res = await fetch(`/api/obras/${id}/bloqueo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked, postventaNo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo cambiar el estado', 'error'); return false; }
      toast(
        blocked
          ? (data.bcSync ? 'Obra bloqueada (incluye BC + postventa)' : 'Obra bloqueada')
          : (data.bcSync ? 'Obra desbloqueada (incluye BC)' : 'Obra desbloqueada'),
        'success',
      );
      await load();
      return true;
    } finally {
      setCambiandoEstado(false);
    }
  }

  // Bloquear: se abre un modal para elegir a qué Postventa (obra PV-…) va.
  function abrirBloqueo() {
    setPostventaSel('');
    setBloqueoOpen(true);
  }
  async function confirmarBloqueo() {
    if (!obra) return;
    if (obra.esBC && !postventaSel) { toast('Elegí la Postventa a la que va esta obra', 'warning'); return; }
    const ok = await postBloqueo(true, postventaSel || undefined);
    if (ok) setBloqueoOpen(false);
  }

  // Desbloquear: no requiere Postventa (BC revierte la actividad).
  async function desbloquear() {
    if (!obra) return;
    const ok = await confirm({
      title: 'Desbloquear obra',
      message: `¿Desbloquear la obra "${obra.numeroObra}"? Volverá al estado "Open" y su actividad de postventa quedará marcada como revertida.`,
      confirmLabel: 'Desbloquear',
    });
    if (!ok) return;
    await postBloqueo(false);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-1/3" rounded="rounded-full" />
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 p-6 space-y-3">
          <Skeleton className="h-4 w-1/2" rounded="rounded-full" />
          <Skeleton className="h-4 w-2/3" rounded="rounded-full" />
        </div>
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="p-6 max-w-4xl mx-auto animate-fade-in">
        <button onClick={() => router.push('/obras')} className="flex items-center gap-2 text-ds-gray-400 hover:text-black transition-colors mb-4">
          <Icon name="chevron-left" size="sm" color="currentColor" /> Volver a obras
        </button>
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-400">
          No se encontró la obra.
        </div>
      </div>
    );
  }

  const secciones = [
    <Seccion key="general" titulo="General">
      <Campo label="Nombre mostrado" value={obra.nombreMostrado} />
      <Campo label="Descripción" value={obra.descripcion} />
      <Campo label="Estado" value={obra.estado} />
    </Seccion>,
    <Seccion key="dim" titulo="Dimensiones">
      <Campo label="Área de costo (AC)" value={obra.areaCosteo} />
      <Campo label="Centro de costo (CC)" value={obra.centroCosto} />
    </Seccion>,
    <Seccion key="det" titulo="Detalles">
      <Campo label="Proyecto" value={obra.proyectoNombre} />
      <Campo label="Origen principal" value={obra.origenPrincipal} />
      <Campo label="Gerente de proyecto" value={obra.gerenteProyecto} />
      <Campo label="Encargado" value={obra.idEncargado} />
      <Campo label="Ubicación" value={obra.ubicacion} />
    </Seccion>,
    <Seccion key="fechas" titulo="Fechas y montos">
      <Campo label="Fecha inicio" value={fmtFecha(obra.fechaInicio)} />
      <Campo label="Fecha fin" value={fmtFecha(obra.fechaFin)} />
      <Campo label="Área prorrateada (m²)" value={fmtMonto(obra.areaProrrateadaM2)} />
    </Seccion>,
    <Seccion key="audit" titulo="Auditoría">
      <Campo label="Creado por" value={obra.creadoPor} />
      <Campo label="Fecha creación" value={fmtFecha(obra.fechaCreacion)} />
      <Campo label="Modificado por" value={obra.modificadoPor} />
      <Campo label="Fecha modificación" value={fmtFecha(obra.fechaModificacion)} />
    </Seccion>,
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* Header card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springs.expanding}
        className="rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-01 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <button onClick={() => router.push('/obras')} aria-label="Volver a obras"
            className="p-2 rounded-ds hover:bg-ds-gray-100 transition-colors text-ds-gray-400 hover:text-black shrink-0">
            <Icon name="chevron-left" size="sm" color="currentColor" />
          </button>
          <div className={`w-14 h-14 rounded-ds-lg flex items-center justify-center shrink-0 shadow-ds-02 ${estaBloqueada ? 'bg-ds-red' : 'bg-black'}`}>
            <Icon name="place" size="md" color="currentColor" className={estaBloqueada ? 'text-white' : 'text-brand'} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-heading font-bold text-black leading-none">{obra.numeroObra}</h1>
              <EstadoObra estado={obra.estado} />
              {obra.esBC && <Badge variant="gray">BC</Badge>}
              {obra.esProcore && <Badge variant="gray">Procore</Badge>}
            </div>
            <p className="text-ds-gray-400 text-body-sm mt-1 truncate">
              {obra.nombreMostrado || 'Sin nombre'}
              {obra.proyectoNombre ? <span className="text-ds-gray-300"> · {obra.proyectoNombre}</span> : null}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant={estaBloqueada ? 'primary' : 'danger'} loading={cambiandoEstado}
                onClick={estaBloqueada ? desbloquear : abrirBloqueo}
                icon={<Icon name={estaBloqueada ? 'check' : 'remove'} size="sm" color="currentColor" />}>
                {estaBloqueada ? 'Desbloquear' : 'Bloquear'}
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(true)} icon={<Icon name="edit" size="sm" color="currentColor" />}>
                Editar
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}>
        {secciones.map((sec, i) => (
          <motion.div key={i}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: springs.expanding } }}>
            {sec}
          </motion.div>
        ))}
      </motion.div>

      {/* Modal: editar obra (editor único compartido con la lista) */}
      <ObraEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        obra={obra}
        proyectos={proyectos}
        onSaved={load}
      />

      {/* Modal: bloquear obra (elegir Postventa) */}
      <Modal
        open={bloqueoOpen}
        onClose={() => setBloqueoOpen(false)}
        title={`Bloquear obra ${obra.numeroObra}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setBloqueoOpen(false)}>Cancelar</Button>
            <Button variant="danger" loading={cambiandoEstado} onClick={confirmarBloqueo}
              icon={<Icon name="remove" size="sm" color="currentColor" />}>
              Bloquear
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-body-sm text-ds-gray-500">
            Bloquear se usa cuando la obra ya está <span className="font-semibold text-black">terminada y por entregar</span>.
            {obra.esBC && ' Se registrará como actividad de postventa dentro de la obra Postventa que elijas.'}
          </p>
          {obra.esBC && (
            <Combobox
              label="Postventa (¿a qué PV va?)"
              value={postventaSel}
              onChange={setPostventaSel}
              placeholder="Elegí la obra Postventa (PV-…)"
              required
              options={postventas.map(p => ({
                value: p.numeroObra,
                label: `${p.numeroObra} ${p.nombreMostrado ?? ''}`,
                parts: [
                  { text: p.numeroObra, weight: 'bold' as const },
                  ...(p.nombreMostrado ? [{ text: p.nombreMostrado, weight: 'light' as const }] : []),
                ],
              }))}
              emptyText="No hay obras Postventa (PV-…) cargadas"
            />
          )}
          {obra.esBC && postventas.length === 0 && (
            <p className="text-xs text-ds-red">No se encontraron obras Postventa (con N° PV-…). Creá primero la obra Postventa del desarrollo.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
