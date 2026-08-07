'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell, PageHeader } from '@/components/layout/Page';
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
// 2 decimales EXACTOS como BC (no redondear a colones enteros).
const fmtCRC = (v: number) =>
  v.toLocaleString('es-CR', { style: 'currency', currency: 'CRC', minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Resumen de presupuesto de la obra en Business Central (lo que devuelve
// /api/obras/[id]/presupuesto). cargado=false → aún no se ha presupuestado.
interface PresupBC {
  cargado: boolean;
  version: string | null;
  venta: number;
  coste: number;
  indirecto: number;
  resultado: number;
}

// Detalle del presupuesto por partida/grupo (pro_bi.fact_presupuesto).
interface PresupDetalle {
  cargado: boolean;
  version: string | null;
  total: number;
  grupos: { nombre: string; monto: number; peso: number }[];
  partidas: { codigo: string; nombre: string; grupo: string; monto: number; peso: number }[];
}

// Chip de estado de la obra: relleno suave y en español (Abierta / Bloqueada).
function EstadoObra({ estado }: { estado: string | null }) {
  if (!estado) return null;
  const e = estado.toLowerCase();
  const cfg = e === 'open'
    ? { label: 'Abierta', cls: 'bg-brand/15 text-ds-green-ink', dot: 'bg-brand' }
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
      <dd className="text-ds-ink font-semibold text-right min-w-0 break-words">{value || '—'}</dd>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
      <div className="px-4 py-3 bg-ds-gray-100 border-b border-ds-gray-200">
        <h2 className="font-bold text-ds-ink text-sm">{titulo}</h2>
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
  const [presup, setPresup] = useState<PresupBC | null>(null);
  const [presupLoading, setPresupLoading] = useState(true);
  // Detalle del presupuesto por partida (modal, carga bajo demanda).
  const [detalle, setDetalle] = useState<PresupDetalle | null>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleLoading, setDetalleLoading] = useState(false);
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
    // Presupuesto de la obra desde BC (venta/coste/indirecto/resultado). Aparte del
    // fetch de la obra para no atrasar el detalle si BC tarda. (presupLoading arranca
    // en true; el .finally lo baja — mismo patrón que el fetch de la obra.)
    fetch(`/api/obras/${id}/presupuesto`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: PresupBC | null) => setPresup(d))
      .catch(() => setPresup(null))
      .finally(() => setPresupLoading(false));
  }, [id]);

  async function verDetallePresup() {
    setDetalleOpen(true);
    if (detalle) return;
    setDetalleLoading(true);
    try {
      const d = await fetch(`/api/obras/${id}/presupuesto-detalle`).then(r => (r.ok ? r.json() : null));
      setDetalle(d);
    } catch {
      setDetalle(null);
    } finally {
      setDetalleLoading(false);
    }
  }

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
      <div className="p-6 max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-8 w-1/3" rounded="rounded-full" />
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 p-6 space-y-3">
          <Skeleton className="h-4 w-1/2" rounded="rounded-full" />
          <Skeleton className="h-4 w-2/3" rounded="rounded-full" />
        </div>
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
        <Button variant="outline" size="sm" className="mb-4" onClick={() => router.push('/obras')} icon={<Icon name="chevron-left" size="sm" color="currentColor" />}>
          Volver a obras
        </Button>
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-400">
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
    <Seccion key="presup" titulo="Presupuesto (BC)">
      {presupLoading ? (
        <div className="px-4 py-3.5 text-ds-gray-400">Consultando Business Central…</div>
      ) : presup?.cargado ? (
        <>
          <Campo label="Cód. versión" value={presup.version} />
          <Campo label="Importe venta" value={fmtCRC(presup.venta)} />
          <Campo label="Importe coste directo" value={fmtCRC(presup.coste)} />
          <Campo label="Importe coste indirecto" value={fmtCRC(presup.indirecto)} />
          <Campo label="Resultado" value={<span className={presup.resultado >= 0 ? 'text-ds-green-ink' : 'text-ds-red'}>{fmtCRC(presup.resultado)}</span>} />
          <div className="px-4 py-3">
            <Button size="sm" variant="outline" onClick={verDetallePresup} icon={<Icon name="boleta" size="sm" color="currentColor" />}>
              Ver detalle por partida
            </Button>
          </div>
        </>
      ) : (
        <div className="px-4 py-4 flex flex-col items-start gap-2.5">
          <span className="text-ds-gray-500">Sin presupuesto cargado en BC.</span>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => router.push(`/presupuesto?obra=${obra.idObra}`)}
              icon={<Icon name="boleta" size="sm" color="currentColor" />}>
              Cargar presupuesto
            </Button>
          )}
        </div>
      )}
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
    <PageShell width="narrow">
      <PageHeader
        back={
          <button onClick={() => router.push('/obras')} aria-label="Volver a obras"
            className="p-2 rounded-ds hover:bg-ds-gray-100 transition-colors text-ds-gray-400 hover:text-ds-ink shrink-0 mt-1">
            <Icon name="chevron-left" size="sm" color="currentColor" />
          </button>
        }
        title={
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-heading font-bold text-ds-ink leading-none">{obra.numeroObra}</h1>
            <EstadoObra estado={obra.estado} />
            {obra.esBC && <Badge variant="gray">BC</Badge>}
            {obra.esProcore && <Badge variant="gray">Procore</Badge>}
          </div>
        }
        subtitle={
          <span className="truncate">
            {obra.nombreMostrado || 'Sin nombre'}
            {obra.proyectoNombre ? <span className="text-ds-gray-300"> · {obra.proyectoNombre}</span> : null}
          </span>
        }
        actions={isAdmin && (
          <>
            <Button variant={estaBloqueada ? 'primary' : 'danger'} loading={cambiandoEstado}
              onClick={estaBloqueada ? desbloquear : abrirBloqueo}
              icon={<Icon name={estaBloqueada ? 'check' : 'remove'} size="sm" color="currentColor" />}>
              {estaBloqueada ? 'Desbloquear' : 'Bloquear'}
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)} icon={<Icon name="edit" size="sm" color="currentColor" />}>
              Editar
            </Button>
          </>
        )}
      />

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

      {/* Modal: detalle del presupuesto por partida (pro_bi.fact_presupuesto) */}
      <Modal
        open={detalleOpen}
        onClose={() => setDetalleOpen(false)}
        title={`Detalle del presupuesto${detalle?.version ? ` · ${detalle.version}` : ''}`}
        size="lg"
        footer={<Button variant="outline" onClick={() => setDetalleOpen(false)}>Cerrar</Button>}
      >
        {detalleLoading ? (
          <div className="py-10 text-center text-ds-gray-400">Consultando el presupuesto…</div>
        ) : detalle?.cargado ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-ds bg-ds-gray-100 px-4 py-3">
              <span className="text-sm text-ds-gray-500">Total presupuestado (costo directo)</span>
              <span className="font-bold text-ds-ink">{fmtCRC(detalle.total)}</span>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-ds-ink">Resumen por grupos</h3>
              <div className="overflow-hidden rounded-ds border border-ds-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-ds-gray-100/60 text-left">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ds-gray-500">Grupo</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ds-gray-500">Total</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ds-gray-500">Peso %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.grupos.map((g) => (
                      <tr key={g.nombre} className="border-t border-ds-gray-100">
                        <td className="px-3 py-1.5 text-ds-ink">{g.nombre}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtCRC(g.monto)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ds-gray-500">{g.peso.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-bold text-ds-ink">Detalle de partidas</h3>
              <div className="overflow-hidden rounded-ds border border-ds-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-ds-gray-100/60 text-left">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ds-gray-500">Código</th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ds-gray-500">Partida</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ds-gray-500">Importe</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-ds-gray-500">Peso %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.partidas.map((p) => (
                      <tr key={p.codigo} className="border-t border-ds-gray-100">
                        <td className="px-3 py-1.5 font-mono text-xs text-ds-gray-500">{p.codigo}</td>
                        <td className="px-3 py-1.5 text-ds-ink">{p.nombre}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtCRC(p.monto)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ds-gray-500">{p.peso.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-ds-gray-400">No hay detalle de presupuesto para esta obra.</div>
        )}
      </Modal>

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
            Bloquear se usa cuando la obra ya está <span className="font-semibold text-ds-ink">terminada y por entregar</span>.
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
    </PageShell>
  );
}
