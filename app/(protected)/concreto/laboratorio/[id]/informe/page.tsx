'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ds/Icon/Icon';
import type { EnsayoDetalle, MuestraDetalle } from '@/lib/concreto/tipos';
import type { PuntoCurvaTeorica } from '@/lib/concreto/tipos-lab';

const FACTOR_MPA_A_KGCM2 = 10.197;

// Truco de impresión: ocultamos TODO menos la hoja del informe (incluye el
// sidebar del layout, que vive fuera de esta página) y la posicionamos al
// inicio de la página.
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  body * { visibility: hidden !important; }
  .informe-hoja, .informe-hoja * { visibility: visible !important; }
  .informe-hoja { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; }
  .no-print { display: none !important; }
}
.informe-hoja { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

function fmt(n: number | null | undefined, dec: number): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtFecha(iso: string | null, largo = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CR', largo
    ? { day: '2-digit', month: 'long', year: 'numeric' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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

function evaluar(kg: number | null, edad: number, fc: number, curva: PuntoCurvaTeorica[]): string {
  if (kg === null) return 'Sin dato';
  const esperado = interpolarCurva(curva, edad, fc);
  if (esperado <= 0) return 'Sin dato';
  const ratio = kg / esperado;
  if (ratio >= 0.95) return 'Cumple';
  if (ratio >= 0.85) return 'Marginal';
  return 'No cumple';
}

export default function InformeMuestraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<MuestraDetalle | null>(null);
  const [curva, setCurva] = useState<PuntoCurvaTeorica[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/concreto/lab/muestras/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    fetch('/api/concreto/lab/curva-teorica')
      .then((r) => r.json())
      .then((d) => setCurva(d.puntos ?? []))
      .catch(() => {});
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[820px] space-y-4 p-8">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" rounded="rounded-ds-lg" />
        <Skeleton className="h-64 w-full" rounded="rounded-ds-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-8">
        <Button variant="outline" size="sm" onClick={() => router.back()} icon={<Icon name="back" size="sm" color="currentColor" />}>
          Volver
        </Button>
        <p className="text-sm text-ds-red">No se pudo cargar la muestra.</p>
      </div>
    );
  }

  const ensayos = [...data.ensayos_detalle].sort((a, b) => a.edad_dias - b.edad_dias);
  const fc = data.fc_objetivo;
  const hayMediciones = ensayos.some((e) => e.mediciones.length > 0);

  return (
    <div className="min-h-screen bg-ds-gray-100 print:bg-white">
      <style>{PRINT_CSS}</style>

      {/* Barra de acciones — no se imprime */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-ds-gray-200 bg-white px-4 py-3 shadow-ds-01">
        <Button variant="outline" size="sm" onClick={() => router.back()} icon={<Icon name="back" size="sm" color="currentColor" />}>
          Volver
        </Button>
        <Button size="sm" onClick={() => window.print()} icon={<Icon name="boleta" size="sm" color="currentColor" />}>
          Imprimir / Guardar PDF
        </Button>
        <span className="ml-2 text-xs text-ds-gray-400">
          En el diálogo de impresión elegí “Guardar como PDF” para descargar el informe.
        </span>
      </div>

      {/* Hoja del informe */}
      <div className="informe-hoja mx-auto my-6 max-w-[820px] bg-white p-10 text-black shadow-ds-01 print:my-0 print:p-0 print:shadow-none">
        {/* Encabezado */}
        <header className="flex items-start justify-between border-b-2 border-black pb-4">
          <div>
            <div className="text-sub-sm font-bold tracking-wider">ADELANTE.</div>
            <div className="text-xs text-ds-gray-400">Laboratorio de Concreto</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold uppercase tracking-wide text-ds-gray-600">Informe de ensayo</div>
            <div className="text-xs text-ds-gray-400">Resistencia a la compresión (ASTM C-39)</div>
          </div>
        </header>

        <div className="mt-5 flex items-center justify-between gap-3">
          <h1 className="text-sub-sm font-semibold">Muestra <span className="font-mono">#{data.numero_muestra}</span></h1>
        </div>

        {/* Datos generales */}
        <section className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Dato label="Fecha de colado">{fmtFecha(data.fecha_colado, true)}</Dato>
          <Dato label="Actividad">{data.actividad_nombre}</Dato>
          <Dato label="Obra">
            {data.obra_works_no ? (
              <>
                <span className="font-mono">{data.obra_works_no}</span>
                {data.obra_display_name && <span className="text-ds-gray-400"> — {data.obra_display_name}</span>}
              </>
            ) : <span className="italic text-ds-gray-300">sin obra</span>}
          </Dato>
          <Dato label="ID Casa / ubicación">{data.id_casa ?? <span className="italic text-ds-gray-300">—</span>}</Dato>
          <Dato label="Proveedor">{data.proveedor}</Dato>
          <Dato label="F'C objetivo"><span className="font-mono font-semibold">{fc} kg/cm²</span></Dato>
          <Dato label="Tipo de concreto">{data.tipo_concreto_display}</Dato>
          <Dato label="Planta">{data.planta_nombre ?? '—'}</Dato>
          {data.codigo_interno_colada && (
            <Dato label="Colada vinculada"><span className="font-mono">#{data.codigo_interno_colada}</span></Dato>
          )}
        </section>

        {/* Resultados */}
        <section className="mt-6" style={{ breakInside: 'avoid' }}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ds-gray-600">Resultados de resistencia</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-ds-gray-300 text-left">
                <Th>Edad (días)</Th>
                <Th>Fecha de prueba</Th>
                <Th className="text-right">Probetas</Th>
                <Th className="text-right">MPa prom.</Th>
                <Th className="text-right">kg/cm² prom.</Th>
                <Th className="text-right">% F&apos;C</Th>
                <Th className="text-right">% teórico</Th>
                <Th>Resultado</Th>
              </tr>
            </thead>
            <tbody>
              {ensayos.length === 0 && (
                <tr><td colSpan={8} className="py-4 text-center text-ds-gray-400">Sin ensayos registrados.</td></tr>
              )}
              {ensayos.map((e) => {
                const kg = e.resistencia_kg_cm2_promedio;
                const pctFc = kg !== null ? (kg / fc) * 100 : null;
                const esperado = interpolarCurva(curva, e.edad_dias, fc);
                const pctTeorico = esperado > 0 && kg !== null ? (kg / esperado) * 100 : null;
                return (
                  <tr key={e.id} className="border-b border-ds-gray-200">
                    <Td className="font-medium">{e.edad_dias}</Td>
                    <Td>{e.fecha_prueba ? fmtFecha(e.fecha_prueba) : <span className="italic text-ds-gray-300">pendiente</span>}</Td>
                    <Td className="text-right tabular-nums">{e.cantidad_mediciones}</Td>
                    <Td className="text-right font-mono tabular-nums">{fmt(e.resistencia_mpa_promedio, 1)}</Td>
                    <Td className="text-right font-mono font-semibold tabular-nums">{fmt(kg, 0)}</Td>
                    <Td className="text-right tabular-nums">{pctFc !== null ? `${fmt(pctFc, 0)}%` : '—'}</Td>
                    <Td className="text-right tabular-nums text-ds-gray-400">{pctTeorico !== null ? `${fmt(pctTeorico, 0)}%` : '—'}</Td>
                    <Td>{evaluar(kg, e.edad_dias, fc, curva)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ds-gray-400">
            % F&apos;C = resistencia real / F&apos;C objetivo. % teórico = real / esperado a esa edad según curva ASTM
            C-150. Cumple ≥ 95% del teórico · Marginal 85–95% · No cumple &lt; 85%.
          </p>
        </section>

        {/* Gráfico */}
        <section className="mt-6" style={{ breakInside: 'avoid' }}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ds-gray-600">Curva de resistencia</h2>
          <div className="rounded-ds border border-ds-gray-200 p-2">
            <GraficoInforme ensayos={ensayos} fcObjetivo={fc} curva={curva} />
          </div>
        </section>

        {/* Detalle de probetas */}
        {hayMediciones && (
          <section className="mt-6" style={{ breakInside: 'avoid' }}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ds-gray-600">Detalle de probetas</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-ds-gray-300 text-left">
                  <Th>Edad (días)</Th>
                  <Th className="text-right">Probeta</Th>
                  <Th className="text-right">MPa</Th>
                  <Th className="text-right">kg/cm²</Th>
                  <Th>Notas</Th>
                </tr>
              </thead>
              <tbody>
                {ensayos.flatMap((e) =>
                  e.mediciones.map((m) => (
                    <tr key={m.id} className="border-b border-ds-gray-200">
                      <Td>{e.edad_dias}</Td>
                      <Td className="text-right tabular-nums">{m.orden}</Td>
                      <Td className="text-right font-mono tabular-nums">{fmt(m.resistencia_mpa, 1)}</Td>
                      <Td className="text-right font-mono tabular-nums">{fmt(m.resistencia_mpa * FACTOR_MPA_A_KGCM2, 0)}</Td>
                      <Td className="text-ds-gray-400">{m.notas ?? ''}</Td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </section>
        )}

        {/* Notas */}
        {data.notas && (
          <section className="mt-6" style={{ breakInside: 'avoid' }}>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ds-gray-600">Notas</h2>
            <p className="whitespace-pre-wrap text-sm text-ds-gray-600">{data.notas}</p>
          </section>
        )}

        {/* Pie */}
        <footer className="mt-10 flex items-end justify-between border-t border-ds-gray-200 pt-4 text-xs text-ds-gray-400">
          <div>Informe generado el {fmtFecha(new Date().toISOString().slice(0, 10), true)}.</div>
          <div className="text-center">
            <div className="mb-1 h-10 w-56 border-b border-ds-gray-400" />
            Responsable de laboratorio
          </div>
        </footer>
      </div>
    </div>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ds-gray-400">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold text-ds-gray-500 ${className ?? ''}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 align-top ${className ?? ''}`}>{children}</td>;
}

// Gráfico SVG (mismo criterio que el detalle, compacto para el informe).
function GraficoInforme({ ensayos, fcObjetivo, curva }: { ensayos: EnsayoDetalle[]; fcObjetivo: number; curva: PuntoCurvaTeorica[] }) {
  const W = 720, H = 260;
  const pad = { top: 14, right: 16, bottom: 34, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  if (curva.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-ds-gray-400">Curva teórica no disponible.</div>;
  }

  const reales = ensayos.filter((e) => e.resistencia_kg_cm2_promedio !== null)
    .map((e) => ({ edad: e.edad_dias, kg: e.resistencia_kg_cm2_promedio as number }));
  const maxEdadReal = reales.reduce((m, p) => Math.max(m, p.edad), 0);
  const xMax = Math.max(90, maxEdadReal + 5);
  const puntosVis = curva.filter((p) => p.edad_dias <= xMax);
  const yMaxData = Math.max(fcObjetivo * 1.2, ...puntosVis.map((p) => p.pct_resistencia * fcObjetivo), ...reales.map((r) => r.kg));
  const yMax = Math.ceil(yMaxData / 50) * 50;
  const sx = (edad: number) => pad.left + (edad / xMax) * plotW;
  const sy = (kg: number) => pad.top + plotH - (kg / yMax) * plotH;
  const lineaTeorica = puntosVis.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.edad_dias).toFixed(1)} ${sy(p.pct_resistencia * fcObjetivo).toFixed(1)}`).join(' ');
  const ticksX = [1, 3, 7, 14, 28, 56, 90].filter((t) => t <= xMax);
  const ticksY = Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Curva de resistencia">
      {ticksY.map((t) => (
        <g key={`y${t}`}>
          <line x1={pad.left} y1={sy(t)} x2={W - pad.right} y2={sy(t)} stroke="#E5E7EB" strokeWidth={1} strokeDasharray="3 3" />
          <text x={pad.left - 6} y={sy(t) + 3} textAnchor="end" fontSize={10} fill="#9CA3AF">{t}</text>
        </g>
      ))}
      {ticksX.map((t) => (
        <text key={`x${t}`} x={sx(t)} y={H - pad.bottom + 16} textAnchor="middle" fontSize={10} fill="#9CA3AF">{t}</text>
      ))}
      <text x={pad.left + plotW / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="#6B7280">Edad (días)</text>
      <line x1={pad.left} y1={sy(fcObjetivo)} x2={W - pad.right} y2={sy(fcObjetivo)} stroke="#DC2626" strokeWidth={1} strokeDasharray="5 4" />
      <text x={W - pad.right} y={sy(fcObjetivo) - 4} textAnchor="end" fontSize={10} fill="#DC2626">{`F'C ${fcObjetivo}`}</text>
      <path d={lineaTeorica} fill="none" stroke="#94A3B8" strokeWidth={2} />
      {reales.map((r) => (
        <g key={r.edad}>
          <circle cx={sx(r.edad)} cy={sy(r.kg)} r={4} fill="#ADD010" stroke="#000" strokeWidth={0.5} />
          <text x={sx(r.edad)} y={sy(r.kg) - 7} textAnchor="middle" fontSize={9} fill="#374151">{r.kg.toFixed(0)}</text>
        </g>
      ))}
    </svg>
  );
}
