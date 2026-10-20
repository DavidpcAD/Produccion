'use client';
/* eslint-disable react-hooks/set-state-in-effect -- efectos de carga de datos (obras al
   montar, comparación al cambiar de obra): el setState va tras el fetch/await. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Icon, IconName } from '@/components/ds/Icon/Icon';
import { formatCRC } from '@/lib/utilidades/format';
import type { EstadoPL, PresupuestoLiquidadoResponse, PresupuestoLiquidadoRow } from '@/lib/bc/presupuesto-liquidado';

// Material presupuestado vs. liquidado por obra (SOLO Super Admin). Portado de
// Digitación como dashboard: valores en ₡, por categoría, con gráficos; el Detalle va
// agrupado por actividad (se expande para ver los materiales de cada tarea).

const num = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 });
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
const PALETA = ['#16a34a', '#2563eb', '#f59e0b', '#ea580c', '#7c3aed', '#94a3b8', '#0d9488', '#db2777'];
const sinAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const ESTADO_META: Record<EstadoPL, { label: string; bg: string; fg: string }> = {
  en_rango:          { label: 'En rango',          bg: '#e6f4ea', fg: '#1a8245' },
  revisar:           { label: 'Revisar',           bg: '#f7ecd6', fg: '#b7791f' },
  sobre_presupuesto: { label: 'Sobre presupuesto', bg: '#f5e1e1', fg: '#bb4a4a' },
};

function estadoDe(tp: number, tl: number): EstadoPL {
  if (tp <= 0) return tl > 0 ? 'sobre_presupuesto' : 'en_rango';
  const v = ((tl - tp) / tp) * 100;
  if (v > 10) return 'sobre_presupuesto';
  if (v > 1e-4) return 'revisar';
  return 'en_rango';
}

interface ObraOpt { codigo: string; nombre: string }

export default function PresupuestoLiquidadoPage() {
  const { toast } = useToast();
  const [obras, setObras] = useState<ObraOpt[]>([]);
  const [obra, setObra] = useState('');
  const [data, setData] = useState<PresupuestoLiquidadoResponse | null>(null);
  const [cargandoObras, setCargandoObras] = useState(true);
  const [loading, setLoading] = useState(false);

  const [categoriaSel, setCategoriaSel] = useState('');
  const [soloVariacion, setSoloVariacion] = useState(false);
  const [vista, setVista] = useState<'resumen' | 'detalle'>('resumen');

  const cargarObras = useCallback(async () => {
    try {
      const res = await fetch('/api/bc/presupuesto-liquidado', { credentials: 'include' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'No se pudieron cargar las obras');
      setObras(Array.isArray(d.obras) ? d.obras : []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cargar obras', 'error');
    } finally {
      setCargandoObras(false);
    }
  }, [toast]);
  useEffect(() => { cargarObras(); }, [cargarObras]);

  useEffect(() => {
    if (!obra) { setData(null); return; }
    let vivo = true;
    setLoading(true);
    setData(null);
    setCategoriaSel('');
    fetch(`/api/bc/presupuesto-liquidado?obra=${encodeURIComponent(obra)}`, { credentials: 'include' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!vivo) return; if (!ok) throw new Error(d.error || 'No se pudo cargar'); setData(d as PresupuestoLiquidadoResponse); })
      .catch((e) => { if (vivo) toast(e instanceof Error ? e.message : 'Error al cargar', 'error'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [obra, toast]);

  const obraOpts = useMemo(
    () => [{ value: '', label: 'Seleccione una obra' }, ...obras.map((o) => ({ value: o.codigo, label: o.nombre ? `${o.codigo} — ${o.nombre}` : o.codigo }))],
    [obras],
  );
  const categorias = useMemo(
    () => Array.from(new Set((data?.rows ?? []).map((r) => r.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [data],
  );
  const catOpts = useMemo(() => [{ value: '', label: 'Todas las categorías' }, ...categorias.map((c) => ({ value: c, label: c }))], [categorias]);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => {
    if (categoriaSel && r.categoria !== categoriaSel) return false;
    if (soloVariacion && r.estado === 'en_rango') return false;
    return true;
  }), [data, categoriaSel, soloVariacion]);

  const k = useMemo(() => {
    const vp = rows.reduce((s, r) => s + r.presupuestadoValor, 0);
    const vl = rows.reduce((s, r) => s + r.liquidadoValor, 0);
    return { valorPresup: vp, valorLiq: vl, diferencia: vp - vl, pctLiq: vp > 0 ? (vl / vp) * 100 : 0, diffPct: vp > 0 ? ((vp - vl) / vp) * 100 : 0, conVariacion: rows.filter((r) => r.estado !== 'en_rango').length, total: rows.length };
  }, [rows]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, { presupuestado: number; liquidado: number }>();
    for (const r of rows) {
      const cat = r.categoria || 'Sin categoría';
      const g = m.get(cat) ?? { presupuestado: 0, liquidado: 0 };
      g.presupuestado += r.presupuestadoValor; g.liquidado += r.liquidadoValor; m.set(cat, g);
    }
    return Array.from(m, ([categoria, v]) => ({ categoria, ...v })).sort((a, b) => (b.presupuestado + b.liquidado) - (a.presupuestado + a.liquidado));
  }, [rows]);

  const donut = useMemo(() => {
    const top = porCategoria.filter((c) => c.liquidado > 0).slice(0, 7).map((c, i) => ({ nombre: c.categoria, valor: c.liquidado, color: PALETA[i % PALETA.length] }));
    const resto = porCategoria.slice(7).reduce((s, c) => s + c.liquidado, 0);
    if (resto > 0) top.push({ nombre: 'Varios', valor: resto, color: '#cbd5e1' });
    return top;
  }, [porCategoria]);

  return (
    <PageShell>
      <PageHeader
        title="Material presupuestado vs. liquidado"
        subtitle="Compará el material presupuestado con el realmente liquidado (consumido), en cantidad y en colones, desde Business Central."
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
        <div className="w-72"><Combobox label="Obra" value={obra} onChange={setObra} options={obraOpts} placeholder={cargandoObras ? 'Cargando obras…' : 'Seleccione una obra'} emptyText="Sin obras con presupuesto." /></div>
        <div className="w-56"><Combobox label="Categoría" value={categoriaSel} onChange={setCategoriaSel} options={catOpts} placeholder="Todas las categorías" /></div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ds-gray-500">Solo con variación</span>
          <button type="button" onClick={() => setSoloVariacion((v) => !v)} aria-pressed={soloVariacion}
            className={`rounded-ds border px-3 py-2 text-body-sm transition-colors ${soloVariacion ? 'border-ds-ink bg-ds-ink text-ds-surface' : 'border-ds-gray-200 bg-ds-surface text-ds-gray-500 hover:border-ds-gray-300'}`}>
            {soloVariacion ? 'Activado' : 'Todos'}
          </button>
        </div>
        <div className="ml-auto flex flex-col gap-1.5">
          <span className="text-label text-ds-gray-500">Vista</span>
          <div className="inline-flex overflow-hidden rounded-ds border border-ds-gray-200">
            {([{ v: 'resumen', l: 'Resumen' }, { v: 'detalle', l: 'Detalle' }] as const).map((o) => (
              <button key={o.v} type="button" onClick={() => setVista(o.v)}
                className={`px-4 py-2 text-body-sm transition-colors ${vista === o.v ? 'bg-brand font-semibold text-ds-ink' : 'bg-ds-surface text-ds-gray-500 hover:bg-ds-gray-100'}`}>{o.l}</button>
            ))}
          </div>
        </div>
      </div>

      {!obra ? (
        <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface py-16 text-center shadow-ds-01">
          <div className="mb-2 flex justify-center text-ds-gray-300"><Icon name="boleta" size="lg" /></div>
          <p className="text-body-sm text-ds-gray-400">Elegí una obra para comparar su presupuesto contra lo liquidado.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard icono="boleta" accent="green" titulo="Valor presupuestado" valor={loading ? '—' : formatCRC(k.valorPresup)} />
            <KpiCard icono="list" accent="blue" titulo="Valor liquidado" valor={loading ? '—' : formatCRC(k.valorLiq)} sub={loading ? undefined : `${k.pctLiq.toFixed(1)}% del presupuesto`} />
            <KpiCard icono="completado" accent="purple" titulo="Diferencia" valor={loading ? '—' : formatCRC(Math.abs(k.diferencia))}
              sub={loading ? undefined : (k.diferencia >= 0 ? `Ahorro · ${k.diffPct.toFixed(1)}%` : `Sobre presupuesto · ${Math.abs(k.diffPct).toFixed(1)}%`)}
              subColor={k.diferencia >= 0 ? 'text-ds-green-ink' : 'text-ds-red-ink'} />
            <KpiCard icono="alert" accent="orange" titulo="Materiales con variación" valor={loading ? '—' : num.format(k.conVariacion)} sub={loading ? undefined : `de ${num.format(k.total)} materiales`} destacado={k.conVariacion > 0} />
          </div>

          {vista === 'resumen' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
                <SeccionHeader icono="list" titulo="Avance por categoría" leyenda />
                <AvanceCategoria datos={porCategoria.slice(0, 7)} loading={loading} />
              </div>
              <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
                <SeccionHeader icono="completado" titulo="Distribución del valor liquidado" />
                <Donut datos={donut} total={k.valorLiq} loading={loading} />
              </div>
            </div>
          ) : (
            <DetalleActividades rows={rows} loading={loading} obra={obra} />
          )}
        </>
      )}
    </PageShell>
  );
}

const ACCENTS: Record<string, { bg: string; fg: string }> = {
  green: { bg: '#e6f4ea', fg: '#1a8245' },
  blue: { bg: '#e3edfb', fg: '#2f66b8' },
  purple: { bg: '#ece3fb', fg: '#7c3aed' },
  orange: { bg: '#fdecd6', fg: '#b7791f' },
};

function KpiCard({ icono, accent, titulo, valor, sub, subColor, destacado }: { icono: IconName; accent: string; titulo: string; valor: string; sub?: string; subColor?: string; destacado?: boolean }) {
  const a = ACCENTS[accent] ?? ACCENTS.green;
  return (
    <div className={`flex items-center gap-3 rounded-ds-lg border p-4 shadow-ds-01 ${destacado ? 'border-ds-yellow-ink bg-ds-yellow-soft' : 'border-ds-gray-200 bg-ds-surface'}`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ds" style={{ background: a.bg, color: a.fg }}><Icon name={icono} size="md" /></span>
      <div className="min-w-0">
        <p className="text-label uppercase tracking-wide text-ds-gray-400">{titulo}</p>
        <p className="text-sub-sm font-bold text-ds-ink">{valor}</p>
        {sub && <p className={`text-label ${subColor ?? 'text-ds-gray-400'}`}>{sub}</p>}
      </div>
    </div>
  );
}

function SeccionHeader({ icono, titulo, leyenda }: { icono: IconName; titulo: string; leyenda?: boolean }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-ds bg-ds-gray-100 text-ds-gray-500"><Icon name={icono} size="sm" /></span>
        <h2 className="text-body font-semibold text-ds-ink">{titulo}</h2>
      </div>
      {leyenda && (
        <div className="flex items-center gap-3 text-label text-ds-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#16a34a' }} /> Presupuestado</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2563eb' }} /> Liquidado</span>
        </div>
      )}
    </div>
  );
}

function EstadoChip({ estado }: { estado: EstadoPL }) {
  const m = ESTADO_META[estado];
  return <span className="inline-flex items-center whitespace-nowrap rounded-ds px-2 py-0.5 text-label font-medium" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

// ─── Detalle agrupado por ACTIVIDAD (acordeón) ──────────────────────────────────
function DetalleActividades({ rows, loading, obra }: { rows: PresupuestoLiquidadoRow[]; loading?: boolean; obra: string }) {
  const [buscar, setBuscar] = useState('');
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const filtradas = useMemo(() => {
    const q = sinAcento(buscar.trim());
    if (!q) return rows;
    return rows.filter((r) => sinAcento(`${r.description} ${r.itemNo} ${r.categoria} ${r.taskNo} ${r.taskDescription}`).includes(q));
  }, [rows, buscar]);

  const grupos = useMemo(() => {
    const m = new Map<string, PresupuestoLiquidadoRow[]>();
    for (const r of filtradas) { const kk = r.taskNo || '—'; const a = m.get(kk); if (a) a.push(r); else m.set(kk, [r]); }
    return Array.from(m.entries()).map(([taskNo, lineas]) => {
      const tp = lineas.reduce((s, r) => s + r.presupuestadoValor, 0);
      const tl = lineas.reduce((s, r) => s + r.liquidadoValor, 0);
      return { taskNo, descripcion: lineas[0]?.taskDescription ?? '', lineas, tp, tl, variacion: tp > 0 ? ((tl - tp) / tp) * 100 : (tl > 0 ? 100 : 0), estado: estadoDe(tp, tl) };
    }).sort((a, b) => a.taskNo.localeCompare(b.taskNo, undefined, { numeric: true }));
  }, [filtradas]);

  const todasAbiertas = grupos.length > 0 && grupos.every((g) => abiertas.has(g.taskNo));
  const toggleTodas = () => setAbiertas(todasAbiertas ? new Set() : new Set(grupos.map((g) => g.taskNo)));
  const toggle = (t: string) => setAbiertas((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  function exportar() {
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Actividad', 'Descripción actividad', 'Código', 'Descripción', 'Categoría', 'Unidad', 'Presup. cant', 'Presup. ₡', 'Liq. cant', 'Liq. ₡', 'Variación %', 'Estado'];
    const body = filtradas.map((r) => [r.taskNo, r.taskDescription, r.itemNo, r.description, r.categoria, r.unitOfMeasureCode, r.presupuestadoCant, r.presupuestadoValor, r.liquidadoCant, r.liquidadoValor, r.variacionPct, ESTADO_META[r.estado].label].map(esc).join(';'));
    const csv = '﻿' + [head.join(';'), ...body].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `presupuesto-liquidado-${obra}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-ds-lg bg-ds-gray-100" />)}</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1"><Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Material, código, actividad…" /></div>
        <button type="button" onClick={toggleTodas} className="rounded-ds border border-ds-gray-200 bg-ds-surface px-3.5 py-2 text-body-sm font-medium text-ds-gray-600 hover:border-ds-gray-300">{todasAbiertas ? 'Colapsar todo' : 'Expandir todo'}</button>
        <button type="button" onClick={exportar} disabled={filtradas.length === 0} className="rounded-ds border border-ds-gray-200 bg-ds-surface px-3.5 py-2 text-body-sm font-medium text-ds-gray-600 hover:border-ds-gray-300 disabled:opacity-50">Exportar</button>
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface py-12 text-center text-body-sm text-ds-gray-400 shadow-ds-01">Sin materiales con los filtros actuales.</div>
      ) : grupos.map((g) => {
        const open = abiertas.has(g.taskNo);
        return (
          <div key={g.taskNo} className="overflow-hidden rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
            <button type="button" onClick={() => toggle(g.taskNo)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-ds-gray-100">
              <span className={`shrink-0 text-ds-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}><Icon name="arrow-right" size="sm" color="currentColor" /></span>
              <span className="shrink-0 font-mono font-semibold text-ds-ink">{g.taskNo}</span>
              <span className="min-w-[120px] flex-1 break-words font-medium text-ds-ink">{g.descripcion || '—'}</span>
              <span className="shrink-0 whitespace-nowrap text-body-sm text-ds-gray-500">Presup. <b className="font-mono text-ds-ink">{formatCRC(g.tp)}</b></span>
              <span className="shrink-0 whitespace-nowrap text-body-sm text-ds-gray-500">Liq. <b className="font-mono text-ds-ink">{formatCRC(g.tl)}</b></span>
              <span className={`w-16 shrink-0 text-right font-semibold ${g.variacion > 0 ? 'text-ds-red-ink' : g.variacion < 0 ? 'text-ds-green-ink' : 'text-ds-gray-400'}`}>{pct(g.variacion)}</span>
              <EstadoChip estado={g.estado} />
            </button>
            {open && (
              <div className="overflow-x-auto border-t border-ds-gray-100">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-ds-gray-100 bg-ds-gray-50 text-label uppercase tracking-wide text-ds-gray-400">
                      <th className="px-4 py-2 text-left font-semibold">Código</th>
                      <th className="px-4 py-2 text-left font-semibold">Descripción</th>
                      <th className="px-3 py-2 text-left font-semibold">Unidad</th>
                      <th className="px-3 py-2 text-right font-semibold">Presup. cant</th>
                      <th className="px-3 py-2 text-right font-semibold">Presup. ₡</th>
                      <th className="px-3 py-2 text-right font-semibold">Liq. cant</th>
                      <th className="px-3 py-2 text-right font-semibold">Liq. ₡</th>
                      <th className="px-3 py-2 text-right font-semibold">Variación</th>
                      <th className="px-3 py-2 text-left font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lineas.map((r) => (
                      <tr key={`${r.itemNo}|${r.variantCode}|${r.taskNo}`} className="border-b border-ds-gray-100 last:border-0">
                        <td className="px-4 py-2 font-mono whitespace-nowrap">{r.itemNo}</td>
                        <td className="px-4 py-2">{r.description || '—'}{r.variantCode ? <span className="text-ds-gray-400"> · {r.variantDescription || r.variantCode}</span> : null}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.unitOfMeasureCode || '—'}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{num.format(r.presupuestadoCant)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-mono">{formatCRC(r.presupuestadoValor)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{num.format(r.liquidadoCant)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-mono">{formatCRC(r.liquidadoValor)}</td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap font-semibold ${r.variacionPct > 0 ? 'text-ds-red-ink' : r.variacionPct < 0 ? 'text-ds-green-ink' : 'text-ds-gray-400'}`}>{pct(r.variacionPct)}</td>
                        <td className="px-3 py-2"><EstadoChip estado={r.estado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AvanceCategoria({ datos, loading }: { datos: { categoria: string; presupuestado: number; liquidado: number }[]; loading?: boolean }) {
  const max = Math.max(1, ...datos.flatMap((d) => [d.presupuestado, d.liquidado]));
  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded-ds bg-ds-gray-100" />)}</div>;
  if (datos.length === 0) return <p className="py-8 text-center text-body-sm text-ds-gray-400">Sin datos</p>;
  return (
    <div className="space-y-3">
      {datos.map((d) => (
        <div key={d.categoria} className="grid grid-cols-[minmax(90px,120px)_1fr_auto] items-center gap-3">
          <span className="break-words text-body-sm text-ds-gray-600" title={d.categoria}>{d.categoria}</span>
          <div className="space-y-1">
            <div className="h-2.5 overflow-hidden rounded-ds bg-ds-gray-100"><div className="h-full rounded-ds" style={{ width: `${(d.presupuestado / max) * 100}%`, background: '#16a34a' }} /></div>
            <div className="h-2.5 overflow-hidden rounded-ds bg-ds-gray-100"><div className="h-full rounded-ds" style={{ width: `${(d.liquidado / max) * 100}%`, background: '#2563eb' }} /></div>
          </div>
          <div className="text-right font-mono text-label leading-tight">
            <div className="text-ds-gray-600">{formatCRC(d.presupuestado)}</div>
            <div className="text-ds-gray-400">{formatCRC(d.liquidado)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Donut({ datos, total, loading }: { datos: { nombre: string; valor: number; color: string }[]; total: number; loading?: boolean }) {
  const r = 70, sw = 24, c = 2 * Math.PI * r;
  if (loading) return <div className="h-44 animate-pulse rounded-ds bg-ds-gray-100" />;
  if (datos.length === 0 || total <= 0) return <p className="py-8 text-center text-body-sm text-ds-gray-400">Sin liquidado</p>;
  const segs = datos.map((d, i) => { const antes = datos.slice(0, i).reduce((s, x) => s + x.valor, 0); return { ...d, len: (d.valor / total) * c, offset: (antes / total) * c }; });
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
        <svg width="180" height="180" viewBox="0 0 180 180">
          <g transform="translate(90,90) rotate(-90)">
            <circle r={r} fill="none" stroke="#eef0f2" strokeWidth={sw} />
            {segs.map((d) => <circle key={d.nombre} r={r} fill="none" stroke={d.color} strokeWidth={sw} strokeDasharray={`${d.len} ${c - d.len}`} strokeDashoffset={-d.offset} />)}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-body font-bold text-ds-ink">{formatCRC(total)}</span>
          <span className="text-label uppercase tracking-wide text-ds-gray-400">Liquidado</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 self-stretch">
        {datos.map((d) => (
          <div key={d.nombre} className="flex items-center gap-2 text-body-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 break-words text-ds-gray-600">{d.nombre}</span>
            <span className="w-12 shrink-0 text-right font-mono text-ds-gray-400">{((d.valor / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
