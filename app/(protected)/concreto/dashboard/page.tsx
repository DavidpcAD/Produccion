'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { DatePicker } from '@/components/ui/DatePicker';
import { Pills } from '../_components/Pills';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { PageShell, PageHeader } from '@/components/layout/Page';
import type { KpisResponse, PlantaListadoItem, M3PorDia } from '@/lib/concreto/tipos';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Límites (primer/último día) y etiqueta del mes de una fecha ISO. */
function boundsMes(anyIso: string): { desde: string; hasta: string; label: string } {
  const d = new Date(`${anyIso}T00:00:00`);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { desde: iso(first), hasta: iso(last), label: first.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }) };
}
function mesInicial(): { desde: string; hasta: string } {
  return boundsMes(iso(new Date()));
}
function fmtNum(n: number, dec = 0): string {
  return n.toLocaleString('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtDiaCorto(isoStr: string): string {
  const d = new Date(`${isoStr}T00:00:00`);
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short' });
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-ds-surface rounded-ds-lg shadow-ds-01 p-5 border border-ds-gray-200">
      <p className="text-ds-gray-400 text-body-sm leading-tight min-h-[2.4em]">{label}</p>
      <p className="text-heading font-bold text-ds-ink mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-ds-gray-400 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { toast } = useToast();
  const [plantas, setPlantas] = useState<PlantaListadoItem[]>([]);
  const [kpis, setKpis] = useState<KpisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const inicial = mesInicial();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [idPlanta, setIdPlanta] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ desde, hasta });
    if (idPlanta) params.set('id_planta', idPlanta);
    try {
      const data = await fetch(`/api/concreto/batches/kpis?${params}`).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      setKpis(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error cargando KPIs', 'error');
      setKpis(null);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, idPlanta, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/concreto/plantas')
      .then((r) => r.json())
      .then((d) => setPlantas(d.data ?? []))
      .catch(() => {});
  }, []);

  // Navegación mes a mes: mueve el rango al mes anterior/siguiente completo.
  const mesLabel = boundsMes(desde).label;
  const irMes = (delta: number) => {
    const d = new Date(`${desde}T00:00:00`);
    d.setMonth(d.getMonth() + delta, 1);
    const b = boundsMes(iso(d));
    setDesde(b.desde);
    setHasta(b.hasta);
  };
  const esMesCompleto = useMemo(() => {
    const b = boundsMes(desde);
    return b.desde === desde && b.hasta === hasta;
  }, [desde, hasta]);

  return (
    <PageShell>
      <PageHeader title="Dashboard de Concreto" subtitle="Producción del periodo seleccionado" />

      <div className="space-y-3">
        {/* Navegación mensual */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => irMes(-1)} title="Mes anterior"
            className="h-9 w-9 inline-flex items-center justify-center rounded-ds border border-ds-gray-200 text-ds-gray-500 hover:text-ds-ink hover:border-ds-gray-400">
            <Icon name="chevron-left" size="sm" color="currentColor" />
          </button>
          <span className="min-w-[150px] text-center text-sm font-semibold capitalize text-ds-ink">{mesLabel}</span>
          <button type="button" onClick={() => irMes(1)} title="Mes siguiente"
            className="h-9 w-9 inline-flex items-center justify-center rounded-ds border border-ds-gray-200 text-ds-gray-500 hover:text-ds-ink hover:border-ds-gray-400">
            <Icon name="chevron-right" size="sm" color="currentColor" />
          </button>
          <button type="button" onClick={() => { const b = mesInicial(); setDesde(b.desde); setHasta(b.hasta); }}
            className="h-9 px-3 rounded-ds border border-ds-gray-200 text-sm font-semibold text-ds-gray-500 hover:text-ds-ink hover:border-ds-gray-400">
            Mes actual
          </button>
          {!esMesCompleto && <span className="text-xs text-ds-gray-400">Rango personalizado</span>}
        </div>

        {/* Rango específico dentro (o a través) del mes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <DatePicker label="Desde" value={desde} onChange={setDesde} />
          <DatePicker label="Hasta" value={hasta} onChange={setHasta} />
        </div>
        <Pills
          label="Planta"
          value={idPlanta}
          onChange={setIdPlanta}
          options={[{ value: '', label: 'Todas' }, ...plantas.map((p) => ({ value: String(p.id), label: p.codigo }))]}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading || !kpis ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[92px] rounded-ds-lg" />)
        ) : (
          <>
            <KpiCard label="Batches" value={fmtNum(kpis.total_batches)} />
            <KpiCard label="m³ producidos" value={fmtNum(kpis.total_m3, 2)} sub="metros cúbicos" />
            <KpiCard label="% con alarma" value={`${fmtNum(kpis.pct_con_alarma, 1)}%`} />
            <KpiCard label="% receta modificada" value={`${fmtNum(kpis.pct_receta_modificada, 1)}%`} />
          </>
        )}
      </div>

      <div className="bg-ds-surface rounded-ds-lg shadow-ds-01 p-5 border border-ds-gray-200">
        <h2 className="font-semibold text-ds-ink mb-4">m³ producidos por día — por planta y total</h2>
        {loading || !kpis ? (
          <Skeleton className="h-64 rounded-ds" />
        ) : kpis.m3_por_dia.every((d) => d.m3 === 0) ? (
          <p className="text-ds-gray-400 text-body-sm py-8 text-center">Sin producción en el periodo.</p>
        ) : (
          <GraficoM3PorDia dias={kpis.m3_por_dia} />
        )}
      </div>
    </PageShell>
  );
}

// Paleta para las líneas por planta (el total va en negro).
const COLORES_PLANTA = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#0ea5e9', '#ec4899', '#84cc16'];

/** Gráfico de líneas: una por planta (m³/día) + la línea total (suma del día). */
function GraficoM3PorDia({ dias }: { dias: M3PorDia[] }) {
  const plantaKeys = useMemo(() => {
    const set = new Set<string>();
    for (const d of dias) for (const k of Object.keys(d.m3_por_planta ?? {})) set.add(k);
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [dias]);

  const maxY = useMemo(() => Math.max(1, ...dias.map((d) => d.m3)), [dias]);

  // Geometría (viewBox fijo; el SVG escala al ancho del contenedor).
  const W = 900, H = 280, padL = 44, padR = 12, padT = 12, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = dias.length;
  const xAt = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - (Math.max(0, v) / maxY) * plotH;
  const pathFor = (getV: (d: M3PorDia) => number) =>
    dias.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(getV(d)).toFixed(1)}`).join(' ');

  // Ticks del eje Y (5 líneas) y del eje X (cada ~7 días).
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: maxY * f, y: yAt(maxY * f) }));
  const stepX = Math.max(1, Math.ceil(n / 12));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px]" style={{ height: 280 }} role="img" aria-label="m³ por día por planta">
          {/* Grid + eje Y */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={t.y} x2={W - padR} y2={t.y} stroke="var(--ds-color-gray-200)" strokeWidth={1} />
              <text x={padL - 6} y={t.y + 3} textAnchor="end" fontSize={10} fill="var(--ds-color-gray-400)">{fmtNum(t.v, 0)}</text>
            </g>
          ))}
          {/* Eje X (fechas cada stepX) */}
          {dias.map((d, i) => (i % stepX === 0 ? (
            <text key={d.fecha} x={xAt(i)} y={H - 10} textAnchor="middle" fontSize={9} fill="var(--ds-color-gray-400)">
              {fmtDiaCorto(d.fecha)}
            </text>
          ) : null))}
          {/* Línea por planta */}
          {plantaKeys.map((k, ki) => (
            <path key={k} d={pathFor((d) => d.m3_por_planta?.[k] ?? 0)} fill="none"
              stroke={COLORES_PLANTA[ki % COLORES_PLANTA.length]} strokeWidth={1.5} strokeLinejoin="round" opacity={0.9} />
          ))}
          {/* Línea total (negra, gruesa) + puntos con tooltip */}
          <path d={pathFor((d) => d.m3)} fill="none" stroke="var(--ds-text)" strokeWidth={2.5} strokeLinejoin="round" />
          {dias.map((d, i) => (
            <circle key={d.fecha} cx={xAt(i)} cy={yAt(d.m3)} r={2.5} fill="var(--ds-text)">
              <title>{`${fmtDiaCorto(d.fecha)}: ${fmtNum(d.m3, 2)} m³ (total)`}</title>
            </circle>
          ))}
        </svg>
      </div>
      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: 'var(--ds-text)', height: 3 }} /><span className="font-semibold text-ds-ink">Total</span></span>
        {plantaKeys.map((k, ki) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: COLORES_PLANTA[ki % COLORES_PLANTA.length], height: 3 }} />
            <span className="text-ds-gray-500">{k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
