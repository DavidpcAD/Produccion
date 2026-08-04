'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { DatePicker } from '@/components/ui/DatePicker';
import { Pills } from '../_components/Pills';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { PageShell, PageHeader } from '@/components/layout/Page';
import type { KpisResponse, PlantaListadoItem } from '@/lib/concreto/tipos';

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtNum(n: number, dec = 0): string {
  return n.toLocaleString('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtDiaCorto(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
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
  const [desde, setDesde] = useState(isoDaysAgo(29));
  const [hasta, setHasta] = useState(hoy());
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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch('/api/concreto/plantas')
      .then((r) => r.json())
      .then((d) => setPlantas(d.data ?? []))
      .catch(() => {});
  }, []);

  const maxM3 = useMemo(
    () => (kpis ? Math.max(1, ...kpis.m3_por_dia.map((d) => d.m3)) : 1),
    [kpis],
  );

  return (
    <PageShell>
      <PageHeader
        title="Dashboard de Concreto"
        subtitle="Producción del periodo seleccionado"
      />

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <DatePicker label="Desde" value={desde} onChange={setDesde} />
          <DatePicker label="Hasta" value={hasta} onChange={setHasta} />
        </div>
        <Pills
          label="Planta"
          value={idPlanta}
          onChange={setIdPlanta}
          options={[
            { value: '', label: 'Todas' },
            ...plantas.map((p) => ({ value: String(p.id), label: p.codigo })),
          ]}
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
        <h2 className="font-semibold text-ds-ink mb-4">m³ producidos por día</h2>
        {loading || !kpis ? (
          <Skeleton className="h-56 rounded-ds" />
        ) : kpis.m3_por_dia.every((d) => d.m3 === 0) ? (
          <p className="text-ds-gray-400 text-body-sm py-8 text-center">Sin producción en el periodo.</p>
        ) : (
          <div className="flex items-end gap-1 h-56 overflow-x-auto no-scrollbar pb-6 relative">
            {kpis.m3_por_dia.map((d) => (
              <div key={d.fecha} className="flex flex-col items-center gap-1 shrink-0" style={{ width: 28 }}>
                <div
                  className="w-full rounded-t bg-brand hover:bg-black transition-colors"
                  style={{ height: `${(d.m3 / maxM3) * 180}px` }}
                  title={`${fmtDiaCorto(d.fecha)}: ${fmtNum(d.m3, 2)} m³`}
                />
                <span className="text-[9px] text-ds-gray-400 -rotate-45 origin-top-left whitespace-nowrap mt-1">
                  {fmtDiaCorto(d.fecha)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
