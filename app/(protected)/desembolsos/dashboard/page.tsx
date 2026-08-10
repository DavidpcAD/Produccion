'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Skeleton } from '@/components/ui/Skeleton';
import { Input, Select } from '@/components/ui/Input';
import { formatCRC } from '@/lib/utilidades/format';
import type {
  Banco,
  DashboardCaso,
  DashboardSemana,
  RangoDashboard,
  RespuestaDashboard,
} from '@/lib/desembolsos/dashboard';
import { EstadoCuentaModal } from '../EstadoCuentaModal';

/**
 * Dashboard ejecutivo de Flujo de Desembolsos — portado de DashboardPantalla de
 * adelante-flujo-desembolsos, adaptado al DS. Hero de pendiente + KPIs, gráfico
 * de ingresos por semana, filtros y tabla por caso. Toggle Bruto / Neto AD
 * (montos del banco vs lo que termina en AD) y rango 4 semanas / mes.
 */

type Modo = 'BRUTO' | 'NETO_AD';
type EstadoFiltrable = 1 | 2 | 4;
const ESTADOS_LABELS: Record<EstadoFiltrable, string> = { 1: 'Entregado', 2: 'Formalizado', 4: 'Reservado' };

/** ₡X.XX MM / ₡X.X M para displays compactos. */
function fmtCorto(n: number): string {
  if (!Number.isFinite(n)) return '₡0';
  if (Math.abs(n) >= 1_000_000_000) return `₡${(n / 1_000_000_000).toFixed(2)} MM`;
  if (Math.abs(n) >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)} M`;
  return `₡${Math.round(n).toLocaleString('es-CR')}`;
}

function nombreConfianza(n: 'A' | 'M' | 'B' | null): string {
  return n === 'A' ? 'Alta' : n === 'M' ? 'Media' : n === 'B' ? 'Baja' : '—';
}

export default function DesembolsosDashboardPage() {
  const [rango, setRango] = useState<RangoDashboard>('4semanas');
  const [modo, setModo] = useState<Modo>('BRUTO');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDeb, setBusquedaDeb] = useState('');
  const [idProyecto, setIdProyecto] = useState<number | null>(null);
  const [idBanco, setIdBanco] = useState<number | null>(null);
  const [estadosActivos, setEstadosActivos] = useState<EstadoFiltrable[]>([2, 4]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [data, setData] = useState<RespuestaDashboard | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [casoModal, setCasoModal] = useState<number | null>(null);

  // Debounce de la búsqueda (300ms).
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDeb(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    fetch('/api/desembolsos/bancos')
      .then((r) => (r.ok ? r.json() : { bancos: [] }))
      .then((d) => setBancos(d.bancos ?? []))
      .catch(() => setBancos([]));
  }, []);

  useEffect(() => {
    setCargando(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('rango', rango);
    if (idProyecto) params.set('idProyecto', String(idProyecto));
    if (idBanco) params.set('idBanco', String(idBanco));
    if (busquedaDeb) params.set('q', busquedaDeb);
    fetch(`/api/desembolsos/dashboard?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d) => setData(d as RespuestaDashboard))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el dashboard.'))
      .finally(() => setCargando(false));
  }, [rango, idProyecto, idBanco, busquedaDeb]);

  const kpis = data?.kpis;
  const m = (bruto: number | null | undefined, neto: number | null | undefined) =>
    modo === 'NETO_AD' ? Number(neto ?? 0) : Number(bruto ?? 0);

  const proyectosVisibles = useMemo(() => {
    const map = new Map<number, { id: number; abrev: string; nombre: string }>();
    for (const c of data?.casos ?? []) {
      if (!map.has(c.IDProyecto)) map.set(c.IDProyecto, { id: c.IDProyecto, abrev: c.AbreviaturaProyecto, nombre: c.NombreProyecto });
    }
    return Array.from(map.values()).sort((a, b) => a.abrev.localeCompare(b.abrev));
  }, [data?.casos]);

  const casosFiltrados = useMemo(() => {
    let lista = data?.casos ?? [];
    if (estadosActivos.length > 0) lista = lista.filter((c) => estadosActivos.includes(c.IDEstado as EstadoFiltrable));
    return lista;
  }, [data?.casos, estadosActivos]);

  const totalesTabla = useMemo(() => {
    let precio = 0;
    let pendiente = 0;
    let proximo = 0;
    for (const c of casosFiltrados) {
      precio += c.PrecioVenta_CRC ?? 0;
      pendiente += modo === 'NETO_AD' ? Number(c.PendienteAD_CRC ?? 0) : c.Pendiente_CRC;
      proximo += modo === 'NETO_AD' ? Number(c.ProximoMontoAD_CRC ?? 0) : Number(c.ProximoMonto_CRC ?? 0);
    }
    return { precio, pendiente, proximo };
  }, [casosFiltrados, modo]);

  const serieAjustada = useMemo(
    () =>
      (data?.serieSemanal ?? []).map((s) => ({
        ...s,
        Formalizados: modo === 'NETO_AD' ? s.FormalizadosAD_CRC : s.Formalizados_CRC,
        Reservados: modo === 'NETO_AD' ? s.ReservadosAD_CRC : s.Reservados_CRC,
        PagoCliente: s.PagoCliente_CRC,
        Total: modo === 'NETO_AD' ? s.TotalAD_CRC : s.Total_CRC,
      })),
    [data?.serieSemanal, modo],
  );

  return (
    <PageShell>
      <EstadoCuentaModal idCaso={casoModal} onClose={() => setCasoModal(null)} />

      <PageHeader
        title={
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ds-gray-400">Gerencia · Cartera ejecutiva</p>
            <h1 className="text-heading font-bold text-ds-ink">Flujo de Desembolsos</h1>
          </div>
        }
      />

      {error && (
        <p className="my-4 rounded-ds border border-ds-red bg-ds-red/5 px-4 py-3 text-sm text-ds-red">{error}</p>
      )}

      {/* Hero */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-ds-gray-400">
            {modo === 'BRUTO' ? 'Pendiente por recibir' : 'Pendiente neto AD'}
          </p>
          <h2 className="mt-1 text-6xl font-black leading-none tabular-nums text-ds-ink">
            {cargando && !data ? '…' : fmtCorto(m(kpis?.TotalPendiente_CRC, kpis?.TotalPendienteAD_CRC))}
          </h2>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-ds-gray-500">
            <span>
              <strong className="text-brand-dark">{kpis?.CasasFormalizadas ?? 0}</strong> formalizadas
            </span>
            <span className="text-ds-gray-300">·</span>
            <span>
              <strong className="text-ds-yellow">{kpis?.CasasReservadas ?? 0}</strong> reservadas
            </span>
            <span className="text-ds-gray-300">·</span>
            <span>
              Pipeline reservados:{' '}
              <strong>{fmtCorto(m(kpis?.PipelineReservados_CRC, kpis?.PipelineReservadosAD_CRC))}</strong>
            </span>
            {(kpis?.TotalPagoCliente_CRC ?? 0) > 0 && (
              <>
                <span className="text-ds-gray-300">·</span>
                <span>
                  Pendiente cliente: <strong>{fmtCorto(kpis?.TotalPagoCliente_CRC ?? 0)}</strong>
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <CardKPI label="Esta semana" valor={m(kpis?.ProyectadoSemana_CRC, kpis?.ProyectadoSemanaAD_CRC)} borde="#88a024" />
          <CardKPI label="Este mes" valor={m(kpis?.ProyectadoMes_CRC, kpis?.ProyectadoMesAD_CRC)} borde="#0a0a0a" />
        </div>
      </div>

      {/* Acumulados */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CardKPIAcum
          label="Pendiente formalizados"
          sub="Total acumulado · banco − pagado"
          valor={kpis?.TotalPendienteFormalizadoGlobal_CRC ?? 0}
          borde="#add010"
        />
        <CardKPIAcum
          label="Pendiente reservados"
          sub="Total acumulado · PrecioVenta de cada reservado"
          valor={kpis?.TotalPendienteReservadoGlobal_CRC ?? 0}
          borde="#f59e0b"
        />
      </div>

      {/* Toggles */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Toggle
          label="Rango"
          opciones={[
            { valor: '4semanas', label: 'Próximas 4 semanas' },
            { valor: 'mes', label: 'Mes actual' },
          ]}
          valor={rango}
          onChange={(v) => setRango(v as RangoDashboard)}
        />
        <Toggle
          label="Montos"
          opciones={[
            { valor: 'BRUTO', label: 'Bruto (banco)' },
            { valor: 'NETO_AD', label: 'Neto AD' },
          ]}
          valor={modo}
          onChange={(v) => setModo(v as Modo)}
        />
      </div>

      {/* Gráfico semanal */}
      <section className="mb-6 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-5 shadow-ds-01">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-sub-sm font-bold">
            Ingresos por semana{modo === 'NETO_AD' ? ' · neto AD' : ''}
          </h3>
          <div className="flex gap-4 text-xs text-ds-gray-500">
            <Leyenda color="#add010" texto="Formalizados" />
            <Leyenda color="#f59e0b" texto="Reservados" />
            <Leyenda color="#3b82f6" texto="Pago cliente" />
          </div>
        </div>
        <GraficoSemanal serie={serieAjustada} />
      </section>

      {/* Filtros */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Input placeholder="Buscar caso, cliente o lote…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <Select
          value={idProyecto ?? ''}
          onChange={(e) => setIdProyecto(Number(e.target.value) || null)}
          options={proyectosVisibles.map((p) => ({ value: p.id, label: `${p.abrev} · ${p.nombre}` }))}
          placeholder="Todos los proyectos"
        />
        <Select
          value={idBanco ?? ''}
          onChange={(e) => setIdBanco(Number(e.target.value) || null)}
          options={bancos.map((b) => ({ value: b.IDBan, label: `${b.Abreviatura} · ${b.NombreEntidad}` }))}
          placeholder="Todos los bancos"
        />
        <div className="flex items-center gap-1 rounded-ds border-2 border-transparent bg-ds-surface p-1 shadow-ds-01">
          {(Object.keys(ESTADOS_LABELS).map(Number) as EstadoFiltrable[]).map((id) => {
            const activo = estadosActivos.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() =>
                  setEstadosActivos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
                }
                className={`flex-1 rounded-ds px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition ${
                  activo ? 'bg-black text-white' : 'text-ds-gray-500 hover:bg-ds-gray-100'
                }`}
              >
                {ESTADOS_LABELS[id]}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-2 text-right text-[10px] uppercase tracking-wider text-ds-gray-400">
        {casosFiltrados.length} de {data?.casos.length ?? 0} casos
      </p>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ds-gray-200 bg-ds-gray-100">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500">Caso · Cliente</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500">Modelo · Banco</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500">Estado</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500">Precio venta</th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500">Pendiente</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500">Avance</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500">Próximo desembolso</th>
            </tr>
          </thead>
          <tbody>
            {cargando && !data ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center"><Skeleton className="h-4 w-48 mx-auto" rounded="rounded-full" /></td>
              </tr>
            ) : casosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center italic text-ds-gray-400">No hay casos con esos filtros.</td>
              </tr>
            ) : (
              casosFiltrados.map((c) => <FilaCaso key={c.IDCaso} caso={c} modo={modo} onClick={() => setCasoModal(c.IDCaso)} />)
            )}
          </tbody>
          {casosFiltrados.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-black bg-black text-white">
                <td className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" colSpan={3}>
                  Total ({casosFiltrados.length} casos)
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtCorto(totalesTabla.precio)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtCorto(totalesTabla.pendiente)}</td>
                <td />
                <td className="px-4 py-3 text-right tabular-nums text-white/80">
                  {totalesTabla.proximo > 0 ? fmtCorto(totalesTabla.proximo) : '—'}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </PageShell>
  );
}

// -------------------------------------------------------------- Sub-componentes

function CardKPI({ label, valor, borde }: { label: string; valor: number; borde: string }) {
  return (
    <div className="rounded-ds-lg bg-ds-surface px-4 py-3 shadow-ds-01" style={{ borderLeft: `3px solid ${borde}` }}>
      <p className="text-[10px] uppercase tracking-[0.15em] text-ds-gray-400">{label}</p>
      <p className="text-sub-sm font-bold tabular-nums text-ds-ink">{fmtCorto(valor)}</p>
    </div>
  );
}

function CardKPIAcum({ label, sub, valor, borde }: { label: string; sub: string; valor: number; borde: string }) {
  return (
    <div className="rounded-ds-lg bg-ds-surface px-6 py-5 shadow-ds-01" style={{ borderLeft: `4px solid ${borde}` }}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-ds-gray-400">{label}</p>
      <p className="mt-1 text-heading font-bold tabular-nums text-ds-ink">{fmtCorto(valor)}</p>
      <p className="mt-1 text-[10px] text-ds-gray-400">{sub}</p>
    </div>
  );
}

function Toggle<T extends string>({
  label,
  opciones,
  valor,
  onChange,
}: {
  label: string;
  opciones: { valor: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.15em] text-ds-gray-400">{label}</span>
      <div className="flex overflow-hidden rounded-ds border border-ds-gray-200">
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="button"
            onClick={() => onChange(o.valor)}
            className={`px-3 py-1.5 text-[11px] uppercase tracking-wider transition ${
              valor === o.valor ? 'bg-black text-white' : 'bg-ds-surface text-ds-gray-500 hover:bg-ds-gray-100'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {texto}
    </span>
  );
}

function GraficoSemanal({
  serie,
}: {
  serie: Array<DashboardSemana & { Formalizados: number; Reservados: number; PagoCliente: number; Total: number }>;
}) {
  const max = Math.max(...serie.map((s) => s.Total), 1);
  return (
    <div>
      <div className="flex items-end gap-4 border-b border-ds-gray-200 pb-1" style={{ height: 180 }}>
        {serie.map((s) => {
          const altoForm = (s.Formalizados / max) * 160;
          const altoRes = (s.Reservados / max) * 160;
          const altoCli = (s.PagoCliente / max) * 160;
          return (
            <div
              key={s.Semana}
              className="flex flex-1 flex-col items-center gap-1.5"
              title={`${s.EtiquetaCorta} · Total ${formatCRC(s.Total)}`}
            >
              <span className="text-[11px] tabular-nums text-ds-ink">{fmtCorto(s.Total)}</span>
              <div className="flex w-full flex-col justify-end" style={{ height: 160 }}>
                {s.PagoCliente > 0 && <div style={{ height: altoCli, backgroundColor: '#3b82f6' }} />}
                {s.Reservados > 0 && <div style={{ height: altoRes, backgroundColor: '#f59e0b' }} />}
                <div style={{ height: altoForm, backgroundColor: '#add010' }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-4">
        {serie.map((s) => (
          <div key={s.Semana} className="flex-1 text-center text-[10px] uppercase tracking-wider text-ds-gray-400">
            {s.EtiquetaCorta}
          </div>
        ))}
      </div>
    </div>
  );
}

function FilaCaso({ caso, modo, onClick }: { caso: DashboardCaso; modo: Modo; onClick: () => void }) {
  const esReservado = caso.EsReservado === 1;
  const labelEstado =
    caso.IDEstado === 1 ? 'Entregado' : caso.IDEstado === 2 ? 'Formalizado' : caso.IDEstado === 4 ? 'Reservado' : `Estado ${caso.IDEstado}`;
  const colorEstado =
    caso.IDEstado === 1
      ? { bg: '#e4e4e7', color: '#52525b' }
      : caso.IDEstado === 4
        ? { bg: '#f4f4f5', color: '#71717a' }
        : { bg: '#eef5d6', color: '#88a024' };
  const pendiente = modo === 'NETO_AD' ? Number(caso.PendienteAD_CRC ?? 0) : caso.Pendiente_CRC;
  const proximoMonto = modo === 'NETO_AD' ? Number(caso.ProximoMontoAD_CRC ?? 0) : Number(caso.ProximoMonto_CRC ?? 0);

  return (
    <tr className="cursor-pointer border-b border-ds-gray-100 last:border-0 hover:bg-ds-gray-100/60" onClick={onClick}>
      <td className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-ds-gray-400">
          {caso.AbreviaturaProyecto} · {caso.CodigoLote}
        </div>
        <div className="font-medium text-ds-ink">{caso.Cliente}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-xs text-ds-ink">{caso.NombreModelo ?? '—'}</div>
        <div className="text-[10px] text-ds-gray-400">
          {caso.AbrevBanco} · {caso.NombreProyecto}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: colorEstado.bg, color: colorEstado.color }}
        >
          {labelEstado}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="text-sm font-semibold tabular-nums text-ds-ink">{fmtCorto(caso.PrecioVenta_CRC ?? 0)}</div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="text-sm font-semibold tabular-nums text-ds-ink">{fmtCorto(pendiente)}</div>
        <div className="text-[10px] tabular-nums text-ds-gray-400">de {fmtCorto(caso.MontoBanco_CRC ?? 0)}</div>
      </td>
      <td className="px-4 py-3">
        {esReservado ? (
          <span className="text-xs italic text-ds-gray-400">Sin formalizar</span>
        ) : (
          <div className="min-w-[100px]">
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <span className="font-semibold tabular-nums text-ds-ink">{Number(caso.PorcentajeAvance ?? 0).toFixed(0)}%</span>
              <span className="text-ds-gray-400">
                {caso.HitosCubiertos}/{caso.TotalHitos}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-ds-gray-200">
              <div
                className="h-full"
                style={{ width: `${Number(caso.PorcentajeAvance ?? 0)}%`, background: 'linear-gradient(90deg,#88a024,#add010)' }}
              />
            </div>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {caso.ProximoMonto_CRC ? (
          <>
            <div className="text-xs font-semibold tabular-nums text-ds-ink">{fmtCorto(proximoMonto)}</div>
            <div className="text-[10px] text-ds-gray-400">
              {caso.ProximoCodigoHito} · {caso.ProximaFechaDesembolso}
            </div>
          </>
        ) : caso.FechaProyectadaFormalizacion ? (
          <>
            <div className="text-xs font-medium text-ds-yellow">Formaliz. {caso.FechaProyectadaFormalizacion}</div>
            <div className="text-[10px] text-ds-gray-400">Confianza: {nombreConfianza(caso.NivelConfianzaFormalizacion)}</div>
          </>
        ) : (
          <span className="text-xs italic text-ds-gray-400">Sin proyectar</span>
        )}
      </td>
    </tr>
  );
}
