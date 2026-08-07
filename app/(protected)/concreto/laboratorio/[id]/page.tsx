'use client';
import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Combobox } from '@/components/ui/Combobox';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { useSession } from '@/hooks/useSession';
import type { EnsayoDetalle, MuestraDetalle } from '@/lib/concreto/tipos';
import {
  CATEGORIAS_CONCRETO,
  PLANTAS_LAB,
  type CategoriaConcreto,
  type PuntoCurvaTeorica,
} from '@/lib/concreto/tipos-lab';

const FACTOR_MPA_A_KGCM2 = 10.197;

function fmtDia(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-ds-gray-400">{label}</p>
      <p className="text-sm font-semibold text-ds-ink break-words">{value}</p>
    </div>
  );
}

/** Interpola linealmente la curva teórica a una edad y escala por F'C. */
function interpolarCurva(puntos: PuntoCurvaTeorica[], edad: number, fc: number): number {
  if (puntos.length === 0) return 0;
  const exacto = puntos.find((p) => p.edad_dias === edad);
  if (exacto) return exacto.pct_resistencia * fc;
  const ant = puntos.filter((p) => p.edad_dias < edad);
  const post = puntos.filter((p) => p.edad_dias > edad);
  if (ant.length === 0) return (post[0]?.pct_resistencia ?? 0) * fc;
  if (post.length === 0) return (ant.at(-1)?.pct_resistencia ?? 0) * fc;
  const a = ant.at(-1)!;
  const b = post[0]!;
  const t = (edad - a.edad_dias) / (b.edad_dias - a.edad_dias);
  return (a.pct_resistencia + t * (b.pct_resistencia - a.pct_resistencia)) * fc;
}

/** Cumplimiento de un ensayo vs curva teórica: cumple ≥95%, marginal 85-95%. */
function evaluar(kg: number | null, edad: number, fc: number, curva: PuntoCurvaTeorica[]):
  'cumple' | 'marginal' | 'incumple' | 'sin_dato' {
  if (kg === null) return 'sin_dato';
  const esperado = interpolarCurva(curva, edad, fc);
  if (esperado <= 0) return 'sin_dato';
  const ratio = kg / esperado;
  if (ratio >= 0.95) return 'cumple';
  if (ratio >= 0.85) return 'marginal';
  return 'incumple';
}

const BADGE_CUMPL: Record<string, { variant: 'green' | 'yellow' | 'red' | 'gray'; label: string }> = {
  cumple: { variant: 'green', label: 'Cumple' },
  marginal: { variant: 'yellow', label: 'Marginal' },
  incumple: { variant: 'red', label: 'No cumple' },
  sin_dato: { variant: 'gray', label: 'Sin dato' },
};

export default function MuestraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const session = useSession();
  const esAdmin = (session?.nivelAdmin ?? 0) >= 4;

  const [data, setData] = useState<MuestraDetalle | null>(null);
  const [curva, setCurva] = useState<PuntoCurvaTeorica[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado de los modales.
  const [editarMuestra, setEditarMuestra] = useState(false);
  const [agregarEnsayo, setAgregarEnsayo] = useState(false);
  const [ensayoEdit, setEnsayoEdit] = useState<EnsayoDetalle | null>(null);
  const [medEdit, setMedEdit] = useState<{ id: number; resistencia_mpa: number; notas: string | null } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/concreto/lab/muestras/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => toast('No se pudo cargar la muestra', 'error'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/concreto/lab/curva-teorica')
      .then((r) => r.json())
      .then((d) => setCurva(d.puntos ?? []))
      .catch(() => {});
  }, []);

  const borrarMuestra = async () => {
    if (!data) return;
    const ok = await confirm({
      title: 'Borrar muestra',
      message: `¿Borrar la muestra #${data.numero_muestra} y todos sus ensayos y mediciones? Esta acción no se puede deshacer.`,
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/concreto/lab/muestras/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Muestra borrada', 'success');
      router.push('/concreto/laboratorio');
    } else {
      const d = await res.json().catch(() => ({}));
      toast(d.error || 'No se pudo borrar', 'error');
    }
  };

  const borrarEnsayo = async (e: EnsayoDetalle) => {
    const ok = await confirm({
      title: 'Borrar ensayo',
      message: `¿Borrar el ensayo de ${e.edad_dias} días y sus mediciones?`,
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/concreto/lab/ensayos/${e.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Ensayo borrado', 'success');
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      toast(d.error || 'No se pudo borrar', 'error');
    }
  };

  const borrarMedicion = async (idMed: number) => {
    const ok = await confirm({ message: '¿Borrar esta probeta?', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/concreto/lab/mediciones/${idMed}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Probeta borrada', 'success');
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      toast(d.error || 'No se pudo borrar', 'error');
    }
  };

  if (loading) {
    return (
      <PageShell width="narrow" className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" rounded="rounded-ds-lg" />
        <Skeleton className="h-64 w-full" rounded="rounded-ds-lg" />
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell width="narrow">
        <Button variant="outline" onClick={() => router.push('/concreto/laboratorio')} icon={<Icon name="back" size="sm" color="currentColor" />}>
          Volver
        </Button>
        <p className="mt-6 text-ds-gray-400">Muestra no encontrada.</p>
      </PageShell>
    );
  }

  const ensayos = [...data.ensayos_detalle].sort((a, b) => a.edad_dias - b.edad_dias);

  return (
    <PageShell width="narrow">
      <PageHeader
        back={
          <Button variant="outline" size="sm" onClick={() => router.push('/concreto/laboratorio')} icon={<Icon name="back" size="sm" color="currentColor" />}>
            Volver
          </Button>
        }
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-heading font-bold text-ds-ink">Muestra #{data.numero_muestra}</h1>
            <Badge variant="gray">{data.actividad_nombre}</Badge>
          </div>
        }
        actions={
          <>
            <Link href={`/concreto/laboratorio/${id}/informe`} target="_blank">
              <Button variant="outline" size="sm" icon={<Icon name="boleta" size="sm" color="currentColor" />}>
                Ver informe
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setEditarMuestra(true)} icon={<Icon name="edit" size="sm" color="currentColor" />}>
              Editar
            </Button>
            {esAdmin && (
              <Button variant="danger" size="sm" onClick={borrarMuestra} icon={<Icon name="delete" size="sm" color="currentColor" />}>
                Borrar
              </Button>
            )}
          </>
        }
      />

      {/* Header */}
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
          <Dato label="Obra" value={data.obra_works_no ? `${data.obra_works_no}${data.obra_display_name ? ` · ${data.obra_display_name}` : ''}` : '—'} />
          <Dato label="Casa" value={data.id_casa || '—'} />
          <Dato label="Actividad" value={data.actividad_nombre} />
          <Dato label="Colado" value={fmtDia(data.fecha_colado)} />
          <Dato label="Proveedor" value={data.proveedor} />
          <Dato label="Tipo de concreto" value={data.tipo_concreto_display} />
          <Dato label="f'c objetivo" value={`${data.fc_objetivo} kg/cm²`} />
          <Dato label="Colada" value={data.codigo_interno_colada ? `#${data.codigo_interno_colada}` : '—'} />
          <Dato label="Planta" value={data.planta_nombre || '—'} />
        </div>
        {data.notas && (
          <div className="mt-4 pt-4 border-t border-ds-gray-100">
            <p className="text-xs font-semibold text-ds-gray-400 mb-1">Notas</p>
            <p className="text-sm text-ds-ink whitespace-pre-wrap">{data.notas}</p>
          </div>
        )}
      </div>

      {/* Gráfico resistencia vs curva teórica */}
      <section className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
        <h2 className="font-bold text-ds-ink text-sm mb-3">Curva de resistencia</h2>
        <GraficoResistencia ensayos={ensayos} fcObjetivo={data.fc_objetivo} curva={curva} />
      </section>

      {/* Ensayos + mediciones */}
      <section className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
        <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
            <Icon name="boleta" size="sm" color="currentColor" className="text-brand" />
          </div>
          <h2 className="font-bold text-ds-ink text-sm">Ensayos ({ensayos.length})</h2>
          <Button size="xs" variant="outline" className="ml-auto" onClick={() => setAgregarEnsayo(true)} icon={<Icon name="plus" size="sm" color="currentColor" />}>
            Agregar ensayo
          </Button>
        </div>
        {ensayos.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ds-gray-400 text-center">Sin ensayos registrados</p>
        ) : (
          <div className="divide-y divide-ds-gray-100">
            {ensayos.map((e) => {
              const cumpl = BADGE_CUMPL[evaluar(e.resistencia_kg_cm2_promedio, e.edad_dias, data.fc_objetivo, curva)];
              return (
                <div key={e.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold text-ds-ink w-16">{e.edad_dias} días</span>
                    <span className="text-xs text-ds-gray-400">{fmtDia(e.fecha_prueba)}</span>
                    {e.resistencia_kg_cm2_promedio !== null ? (
                      <Badge variant={cumpl.variant} dot>
                        {e.resistencia_kg_cm2_promedio.toFixed(1)} kg/cm² ({e.resistencia_mpa_promedio?.toFixed(1)} MPa) · {cumpl.label}
                      </Badge>
                    ) : (
                      <Badge variant="gray">Planificado</Badge>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        onClick={() => setEnsayoEdit(e)}
                        className="text-ds-gray-400 hover:text-ds-ink p-1"
                        title="Editar ensayo"
                      >
                        <Icon name="edit" size="sm" color="currentColor" />
                      </button>
                      {esAdmin && (
                        <button
                          onClick={() => borrarEnsayo(e)}
                          className="text-ds-gray-400 hover:text-ds-red p-1"
                          title="Borrar ensayo"
                        >
                          <Icon name="delete" size="sm" color="currentColor" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mediciones (probetas) */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-16">
                    {e.mediciones.map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-ds-gray-100 text-ds-gray-600 text-xs font-semibold pl-2.5 pr-1.5 py-1"
                      >
                        <button
                          onClick={() => setMedEdit({ id: m.id, resistencia_mpa: m.resistencia_mpa, notas: m.notas })}
                          className="hover:text-ds-ink"
                          title="Editar probeta"
                        >
                          P{m.orden}: {m.resistencia_mpa.toFixed(1)} MPa ({(m.resistencia_mpa * FACTOR_MPA_A_KGCM2).toFixed(0)} kg/cm²)
                        </button>
                        {esAdmin && (
                          <button onClick={() => borrarMedicion(m.id)} className="text-ds-gray-400 hover:text-ds-red" title="Borrar probeta">
                            <Icon name="close" size="sm" color="currentColor" />
                          </button>
                        )}
                      </span>
                    ))}
                    <AgregarMedicion idEnsayo={e.id} siguienteOrden={(e.mediciones.at(-1)?.orden ?? 0) + 1} onOk={load} />
                  </div>

                  {e.notas && <p className="text-xs text-ds-gray-400 mt-1.5 pl-16">{e.notas}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modales */}
      {editarMuestra && (
        <ModalEditarMuestra muestra={data} cerrar={() => setEditarMuestra(false)} onGuardado={() => { setEditarMuestra(false); load(); }} />
      )}
      {agregarEnsayo && (
        <ModalAgregarEnsayo idMuestra={Number(id)} fechaColado={data.fecha_colado} cerrar={() => setAgregarEnsayo(false)} onGuardado={() => { setAgregarEnsayo(false); load(); }} />
      )}
      {ensayoEdit && (
        <ModalEditarEnsayo ensayo={ensayoEdit} cerrar={() => setEnsayoEdit(null)} onGuardado={() => { setEnsayoEdit(null); load(); }} />
      )}
      {medEdit && (
        <ModalEditarMedicion med={medEdit} cerrar={() => setMedEdit(null)} onGuardado={() => { setMedEdit(null); load(); }} />
      )}
    </PageShell>
  );
}

// ─── Gráfico SVG resistencia vs curva teórica ──────────────────────────────

function GraficoResistencia({
  ensayos,
  fcObjetivo,
  curva,
}: {
  ensayos: EnsayoDetalle[];
  fcObjetivo: number;
  curva: PuntoCurvaTeorica[];
}) {
  const W = 720;
  const H = 300;
  const pad = { top: 16, right: 16, bottom: 36, left: 48 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const reales = ensayos
    .filter((e) => e.resistencia_kg_cm2_promedio !== null)
    .map((e) => ({ edad: e.edad_dias, kg: e.resistencia_kg_cm2_promedio as number }));

  if (curva.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-ds border border-dashed border-ds-gray-200 text-sm text-ds-gray-400">
        Curva teórica no disponible.
      </div>
    );
  }

  const maxEdadReal = reales.reduce((m, p) => Math.max(m, p.edad), 0);
  const xMax = Math.max(90, maxEdadReal + 5);
  const puntosCurvaVis = curva.filter((p) => p.edad_dias <= xMax);
  const yMaxData = Math.max(
    fcObjetivo * 1.2,
    ...puntosCurvaVis.map((p) => p.pct_resistencia * fcObjetivo),
    ...reales.map((r) => r.kg),
  );
  const yMax = Math.ceil(yMaxData / 50) * 50;

  const sx = (edad: number) => pad.left + (edad / xMax) * plotW;
  const sy = (kg: number) => pad.top + plotH - (kg / yMax) * plotH;

  const lineaTeorica = puntosCurvaVis
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.edad_dias).toFixed(1)} ${sy(p.pct_resistencia * fcObjetivo).toFixed(1)}`)
    .join(' ');

  const ticksX = [1, 3, 7, 14, 28, 56, 90].filter((t) => t <= xMax);
  const ticksY = Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" role="img" aria-label="Gráfico de resistencia vs edad">
        {/* Grid + ejes Y */}
        {ticksY.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.left} y1={sy(t)} x2={W - pad.right} y2={sy(t)} stroke="#E5E7EB" strokeWidth={1} strokeDasharray="3 3" />
            <text x={pad.left - 6} y={sy(t) + 3} textAnchor="end" fontSize={10} fill="#9CA3AF">{t}</text>
          </g>
        ))}
        {/* Ticks X */}
        {ticksX.map((t) => (
          <text key={`x${t}`} x={sx(t)} y={H - pad.bottom + 16} textAnchor="middle" fontSize={10} fill="#9CA3AF">{t}</text>
        ))}
        <text x={pad.left + plotW / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="#6B7280">Edad (días)</text>
        <text x={14} y={pad.top + plotH / 2} textAnchor="middle" fontSize={11} fill="#6B7280" transform={`rotate(-90 14 ${pad.top + plotH / 2})`}>kg/cm²</text>

        {/* Línea F'C objetivo */}
        <line x1={pad.left} y1={sy(fcObjetivo)} x2={W - pad.right} y2={sy(fcObjetivo)} stroke="#DC2626" strokeWidth={1} strokeDasharray="5 4" />
        <text x={W - pad.right} y={sy(fcObjetivo) - 4} textAnchor="end" fontSize={10} fill="#DC2626">{`F'C ${fcObjetivo}`}</text>

        {/* Curva teórica */}
        <path d={lineaTeorica} fill="none" stroke="#94A3B8" strokeWidth={2} />

        {/* Puntos reales */}
        {reales.map((r) => (
          <g key={r.edad}>
            <circle cx={sx(r.edad)} cy={sy(r.kg)} r={4.5} fill="#ADD010" stroke="#000" strokeWidth={0.5} />
            <text x={sx(r.edad)} y={sy(r.kg) - 8} textAnchor="middle" fontSize={9} fill="#374151">{r.kg.toFixed(0)}</text>
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-4 mt-1 text-xs text-ds-gray-400 pl-12">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-[#94A3B8]" /> Teórica (ASTM C-150)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-brand" /> Real</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 border-t border-dashed border-ds-red" /> {`F'C objetivo`}</span>
      </div>
    </div>
  );
}

// ─── Inline: agregar medición ─────────────────────────────────────────────

function AgregarMedicion({ idEnsayo, siguienteOrden, onOk }: { idEnsayo: number; siguienteOrden: number; onOk: () => void }) {
  const { toast } = useToast();
  const [mpa, setMpa] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const n = Number(mpa);
    if (!Number.isFinite(n) || n <= 0 || n > 200) return toast('MPa inválido (0-200)', 'warning');
    setGuardando(true);
    try {
      const res = await fetch(`/api/concreto/lab/ensayos/${idEnsayo}/mediciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resistencia_mpa: n, orden: siguienteOrden }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Error');
      setMpa('');
      onOk();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        value={mpa}
        onChange={(e) => setMpa(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') guardar(); }}
        placeholder="+ MPa"
        className="w-20 h-7 rounded-full border border-ds-gray-200 bg-ds-surface px-2.5 text-xs text-ds-ink placeholder-ds-gray-300 focus:outline-none focus:border-ds-gray-400"
      />
      <button
        onClick={guardar}
        disabled={guardando || !mpa}
        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black text-white disabled:opacity-40"
        title="Agregar probeta"
      >
        <Icon name="plus" size="sm" color="currentColor" />
      </button>
    </span>
  );
}

// ─── Modal: editar muestra ─────────────────────────────────────────────────

function ModalEditarMuestra({ muestra, cerrar, onGuardado }: { muestra: MuestraDetalle; cerrar: () => void; onGuardado: () => void }) {
  const { toast } = useToast();
  const [fechaColado, setFechaColado] = useState(muestra.fecha_colado);
  const [fcObjetivo, setFcObjetivo] = useState(String(muestra.fc_objetivo));
  const [proveedor, setProveedor] = useState(muestra.proveedor);
  const [planta, setPlanta] = useState(muestra.planta_nombre ?? '');
  const [tipoLibre, setTipoLibre] = useState('');
  const [categoria, setCategoria] = useState<CategoriaConcreto>('convencional');
  const [obra, setObra] = useState(muestra.obra_works_no ?? '');
  const [casa, setCasa] = useState(muestra.id_casa ?? '');
  const [notas, setNotas] = useState(muestra.notas ?? '');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const fc = Number(fcObjetivo);
    if (!Number.isFinite(fc) || fc <= 0) return toast("f'c objetivo inválido", 'warning');
    setGuardando(true);
    try {
      const res = await fetch(`/api/concreto/lab/muestras/${muestra.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_colado: fechaColado,
          fc_objetivo: fc,
          proveedor: proveedor.trim() || 'ADELANTE DESARROLLOS',
          planta_nombre: planta || null,
          categoria_concreto: categoria,
          tipo_concreto_libre: tipoLibre.trim() || null,
          obra_works_no: obra.trim() || null,
          id_casa: casa.trim() || null,
          notas: notas.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar');
      toast('Muestra actualizada', 'success');
      onGuardado();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onClose={cerrar}
      title={`Editar muestra #${muestra.numero_muestra}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={cerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando}>Guardar</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DatePicker label="Fecha de colado" value={fechaColado} onChange={setFechaColado} />
        <Input label="f'c objetivo (kg/cm²)" type="number" value={fcObjetivo} onChange={(e) => setFcObjetivo(e.target.value)} />
        <Combobox
          label="Planta"
          value={planta}
          onChange={setPlanta}
          options={[{ value: '', label: 'Sin especificar' }, ...PLANTAS_LAB.map((p) => ({ value: p, label: p }))]}
        />
        <Combobox
          label="Categoría"
          value={categoria}
          onChange={(v) => setCategoria(v as CategoriaConcreto)}
          options={CATEGORIAS_CONCRETO.map((c) => ({ value: c, label: c }))}
        />
        <Input label="Proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        <Input label="Tipo de concreto (texto)" value={tipoLibre} onChange={(e) => setTipoLibre(e.target.value)} placeholder="Dejar vacío para no cambiar" />
        <Input label="Obra (works_no)" value={obra} onChange={(e) => setObra(e.target.value)} />
        <Input label="ID Casa / ubicación" value={casa} onChange={(e) => setCasa(e.target.value)} />
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-sm font-medium text-ds-ink">Notas</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="w-full rounded-ds-xl border border-ds-gray-200 bg-ds-surface p-3 text-sm text-ds-ink placeholder-ds-gray-300 focus:outline-none focus:border-ds-gray-400"
          />
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: agregar ensayo ─────────────────────────────────────────────────

function ModalAgregarEnsayo({ idMuestra, fechaColado, cerrar, onGuardado }: { idMuestra: number; fechaColado: string; cerrar: () => void; onGuardado: () => void }) {
  const { toast } = useToast();
  // Fecha de prueba sugerida = colado + edad. Se calcula sin efecto: al
  // cambiar la edad recomputamos la sugerencia (el usuario puede editarla).
  const sugerirFecha = (edadStr: string): string => {
    const n = Number(edadStr);
    if (!Number.isFinite(n) || n <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fechaColado)) return '';
    const d = new Date(`${fechaColado}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const [edad, setEdad] = useState('28');
  const [fechaPrueba, setFechaPrueba] = useState(() => sugerirFecha('28'));
  const [guardando, setGuardando] = useState(false);

  const cambiarEdad = (v: string) => {
    setEdad(v);
    setFechaPrueba(sugerirFecha(v));
  };

  const guardar = async () => {
    const n = Number(edad);
    if (!Number.isInteger(n) || n <= 0 || n > 365) return toast('Edad inválida (1-365)', 'warning');
    setGuardando(true);
    try {
      const res = await fetch(`/api/concreto/lab/muestras/${idMuestra}/ensayos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edad_dias: n, fecha_prueba: fechaPrueba || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo crear el ensayo');
      toast('Ensayo agregado', 'success');
      onGuardado();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onClose={cerrar}
      title="Agregar ensayo"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={cerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando}>Agregar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ds-ink">Edad (días)</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[3, 7, 14, 28, 56, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => cambiarEdad(String(d))}
                className={`px-3 py-1.5 rounded-ds text-sm font-semibold border transition-colors ${
                  Number(edad) === d
                    ? 'bg-black text-white border-black'
                    : 'bg-ds-surface text-ds-gray-500 border-ds-gray-200 hover:border-ds-gray-300'
                }`}
              >
                {d}d
              </button>
            ))}
            <Input
              type="number"
              value={edad}
              onChange={(e) => cambiarEdad(e.target.value)}
              className="w-24"
              placeholder="Otra"
            />
          </div>
          <p className="text-xs text-ds-gray-400">Edades preestablecidas o manual.</p>
        </div>
        <DatePicker label="Fecha de prueba" value={fechaPrueba} onChange={setFechaPrueba} hint="Sugerida = colado + edad" />
      </div>
    </Modal>
  );
}

// ─── Modal: editar ensayo ──────────────────────────────────────────────────

function ModalEditarEnsayo({ ensayo, cerrar, onGuardado }: { ensayo: EnsayoDetalle; cerrar: () => void; onGuardado: () => void }) {
  const { toast } = useToast();
  const [fechaPrueba, setFechaPrueba] = useState(ensayo.fecha_prueba ?? '');
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState(ensayo.notas ?? '');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch(`/api/concreto/lab/ensayos/${ensayo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_prueba: fechaPrueba || null,
          fecha_ajustada_motivo: motivo.trim() || null,
          notas: notas.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar');
      toast('Ensayo actualizado', 'success');
      onGuardado();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onClose={cerrar}
      title={`Editar ensayo (${ensayo.edad_dias} días)`}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={cerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando}>Guardar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <DatePicker label="Fecha de prueba" value={fechaPrueba} onChange={setFechaPrueba} />
        <Input label="Motivo del ajuste de fecha" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional" />
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-ds-ink">Notas</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="w-full rounded-ds-xl border border-ds-gray-200 bg-ds-surface p-3 text-sm text-ds-ink placeholder-ds-gray-300 focus:outline-none focus:border-ds-gray-400"
          />
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: editar medición ────────────────────────────────────────────────

function ModalEditarMedicion({ med, cerrar, onGuardado }: { med: { id: number; resistencia_mpa: number; notas: string | null }; cerrar: () => void; onGuardado: () => void }) {
  const { toast } = useToast();
  const [mpa, setMpa] = useState(String(med.resistencia_mpa));
  const [notas, setNotas] = useState(med.notas ?? '');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const n = Number(mpa);
    if (!Number.isFinite(n) || n <= 0 || n > 200) return toast('MPa inválido (0-200)', 'warning');
    setGuardando(true);
    try {
      const res = await fetch(`/api/concreto/lab/mediciones/${med.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resistencia_mpa: n, notas: notas.trim() || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar');
      toast('Probeta actualizada', 'success');
      onGuardado();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onClose={cerrar}
      title="Editar probeta"
      size="sm"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={cerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando}>Guardar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Resistencia (MPa)" type="number" value={mpa} onChange={(e) => setMpa(e.target.value)} />
        <Input label="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
      </div>
    </Modal>
  );
}
