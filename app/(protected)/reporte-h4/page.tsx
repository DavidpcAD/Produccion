'use client';

// Reporte H4 → Cierre del Día. Reconstrucción del ScreenReportes de h4control
// usando ÚNICAMENTE el Adelante Design System de la base (sin CSS/tokens ajenos).
// KPIs de la jornada + tabla de anomalías pendientes de resolver antes de cerrar
// el día y procesar a nómina.

import { useState, useEffect, useCallback } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { DataTable } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';

interface CierreKpis {
  diaCompleto: number;
  totalPersonal: number;
  sinMarcaje: number;
  horasTotales: number;
}
interface AnomaliaCierre {
  id: number;
  tipo: string;
  severidad: 'info' | 'warning' | 'critical' | string;
  titulo: string;
  code?: string | null;
  ocurridoUtc: string;
}

const KPIS_VACIOS: CierreKpis = { diaCompleto: 0, totalPersonal: 0, sinMarcaje: 0, horasTotales: 0 };

// Etiqueta de acción sugerida según el tipo de anomalía (portado de h4control).
const ACCION: Record<string, string> = {
  TramoFueraHorario: 'Cerrar tramo',
  EntradaSinSalida: 'Crear entrada manual',
  SinPersonal: 'Marcar ausente',
  CapacidadExcedida: 'Revisar cuadrilla',
  AlertaPresupuesto: 'Revisar presupuesto',
};

const sevBadge = (s: string): React.ComponentProps<typeof Badge>['variant'] =>
  s === 'critical' ? 'red' : s === 'warning' ? 'yellow' : 'gray';
const sevLabel = (s: string) => (s === 'critical' ? 'Crítica' : s === 'warning' ? 'Alerta' : 'Info');

const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');
const hoyLocal = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtHora = (utc: string) => {
  try {
    return new Date(utc).toLocaleString('es-CR', {
      timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return utc; }
};

const col = createColumnHelper<AnomaliaCierre>();

export default function ReporteH4Page() {
  const { toast } = useToast();
  const [fecha, setFecha] = useState<string>(hoyLocal());
  const [kpis, setKpis] = useState<CierreKpis>(KPIS_VACIOS);
  const [anomalias, setAnomalias] = useState<AnomaliaCierre[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<AnomaliaCierre | null>(null);

  const cargar = useCallback(async (f: string, spinner = false) => {
    if (spinner) setLoading(true);
    try {
      const res = await fetch(`/api/reporte-h4/cierre-dia?fecha=${f}`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { kpis: CierreKpis; anomalias: AnomaliaCierre[] };
        setKpis(data.kpis);
        setAnomalias(data.anomalias);
      }
    } catch {
      // sin datos: la pantalla muestra ceros / sin anomalías
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar(fecha, true);
    // Refresco automático (como el original) solo cuando se ve el día de hoy.
    if (fecha !== hoyLocal()) return;
    const id = setInterval(() => cargar(fecha), 30000);
    return () => clearInterval(id);
  }, [fecha, cargar]);

  const nAnom = anomalias.length;
  const bloqueado = nAnom > 0;
  const pct = kpis.totalPersonal > 0 ? Math.round((kpis.diaCompleto / kpis.totalPersonal) * 100) : 0;
  const promedio = kpis.totalPersonal > 0 ? (kpis.horasTotales / kpis.totalPersonal).toFixed(1) : '0.0';
  const completos = Math.max(0, kpis.totalPersonal - nAnom);

  function cerrarDia() {
    // TODO(reporte-h4): el cierre del día (mutación + procesar a nómina) no está
    // en alcance; requiere endpoint dedicado en h4control. Aquí solo se reporta.
    toast('Cerrar el día se hace desde el flujo de nómina; este módulo es de solo reporte.', 'warning');
  }
  function resolver(a: AnomaliaCierre) {
    // TODO(reporte-h4): resolver anomalías requiere las mutaciones de h4control
    // (crear entrada manual, cerrar tramo, etc.), fuera de alcance de este módulo.
    toast(`Resolver "${ACCION[a.tipo] ?? a.tipo}" aún no está disponible en este módulo.`, 'warning');
  }

  const columns = [
    col.accessor('severidad', {
      header: 'Severidad',
      meta: { label: 'Severidad' },
      cell: (c) => <Badge variant={sevBadge(c.getValue())} dot>{sevLabel(c.getValue())}</Badge>,
    }),
    col.accessor('titulo', {
      header: 'Anomalía',
      meta: { label: 'Anomalía' },
      cell: (c) => {
        const partes = c.getValue().split(/ · | — /);
        return (
          <div className="min-w-0">
            <p className="font-semibold text-black truncate">{partes[0]}</p>
            {partes.length > 1 && (
              <p className="text-xs text-ds-gray-400 truncate">{partes.slice(1).join(' · ')}</p>
            )}
          </div>
        );
      },
    }),
    col.accessor('tipo', { header: 'Tipo', meta: { label: 'Tipo' } }),
    col.accessor((r) => r.code ?? '', {
      id: 'code',
      header: 'Obra',
      meta: { label: 'Obra' },
      cell: (c) => c.getValue() || <span className="text-ds-gray-300">—</span>,
    }),
    col.accessor('ocurridoUtc', {
      header: 'Hora',
      meta: { label: 'Hora', exportValue: (r) => fmtHora(r.ocurridoUtc) },
      cell: (c) => <span className="text-ds-gray-500 whitespace-nowrap">{fmtHora(c.getValue())}</span>,
    }),
    col.display({
      id: 'acciones',
      header: '',
      cell: (c) => {
        const a = c.row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={() => setDetalle(a)}>Ver</Button>
            <Button size="xs" variant={a.severidad === 'critical' ? 'secondary' : 'primary'} onClick={() => resolver(a)}>
              {ACCION[a.tipo] ?? 'Revisar'}
            </Button>
          </div>
        );
      },
    }),
  ];

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-heading font-bold text-black">Reporte H4 · Cierre del Día</h1>
          <p className="text-ds-gray-400 text-body-sm">
            Resumen de la jornada y anomalías pendientes a resolver antes de cerrar el día y procesar a nómina.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-44">
            <DatePicker label="Día" value={fecha} onChange={(v) => setFecha(v || hoyLocal())} />
          </div>
          <Button
            variant="primary"
            disabled={bloqueado}
            onClick={cerrarDia}
            icon={<Icon name="check" size="sm" color="currentColor" />}
          >
            {bloqueado ? `Cerrar Día (${nAnom})` : 'Cerrar Día'}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" rounded="rounded-ds-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="DÍA COMPLETO" value={fmtNum(kpis.diaCompleto)} sub={`${pct}% del personal`} />
          <Kpi label="ANOMALÍAS" value={fmtNum(nAnom)} sub="requieren revisión" tone={nAnom > 0 ? 'warning' : undefined} />
          <Kpi label="SIN MARCAJE" value={fmtNum(kpis.sinMarcaje)} sub="¿ausencia? ¿incapacidad?" />
          <Kpi label="HORAS TOTALES" value={fmtNum(kpis.horasTotales)} sub={`${kpis.totalPersonal} trab. · ${promedio}h prom`} />
        </div>
      )}

      {/* Anomalías pendientes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-body font-bold text-black">Anomalías pendientes ({nAnom})</h2>
          <span className="text-xs text-ds-gray-400">Resolver antes de cerrar el día</span>
        </div>
        <DataTable
          columns={columns}
          data={anomalias}
          loading={loading}
          searchPlaceholder="Buscar anomalía…"
          exportFilename="anomalias-cierre-dia"
          emptyMessage="Sin anomalías pendientes"
        />
      </div>

      {/* Banner nómina */}
      {!loading && (
        <div className="flex items-center gap-3 rounded-ds-lg border border-brand bg-brand-soft px-5 py-4 text-body-sm text-black">
          <span className="text-brand shrink-0"><Icon name="check" size="md" color="currentColor" /></span>
          <span><strong>{completos} trabajadores</strong> con jornada completa y sin anomalías. Listos para procesar a nómina.</span>
        </div>
      )}

      {/* Detalle de anomalía */}
      <Modal open={!!detalle} onClose={() => setDetalle(null)} title="Detalle de la anomalía" size="md">
        {detalle && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant={sevBadge(detalle.severidad)} dot>{sevLabel(detalle.severidad)}</Badge>
              <span className="text-xs text-ds-gray-400">{fmtHora(detalle.ocurridoUtc)}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-black">{detalle.titulo}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ds-gray-400">Tipo</dt>
                <dd className="text-black">{detalle.tipo}</dd>
              </div>
              <div>
                <dt className="text-xs text-ds-gray-400">Obra</dt>
                <dd className="text-black">{detalle.code || '—'}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: {
  label: string; value: React.ReactNode; sub?: string; tone?: 'warning' | 'critical';
}) {
  const valueColor = tone === 'critical' ? 'text-ds-red' : tone === 'warning' ? 'text-ds-yellow-ink' : 'text-black';
  return (
    <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
      <p className="text-xs font-bold tracking-wide text-ds-gray-500">{label}</p>
      <p className={`mt-2 text-4xl font-bold leading-none ${valueColor}`}>{value}</p>
      {sub && <p className="mt-2 text-xs text-ds-gray-400">{sub}</p>}
    </div>
  );
}
