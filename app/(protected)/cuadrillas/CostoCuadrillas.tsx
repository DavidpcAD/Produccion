'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EstadoVacio } from '@/components/ui/EstadoVacio';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { formatCRC } from '@/lib/utilidades/format';
import { coincideBusqueda } from '@/lib/utilidades/buscar';
import type { FilaCostoCuadrilla, SemanaPlanilla } from '@/lib/cuadrillas-costo';

// Cuadrillas → Costo por semana. Cuánto costó cada cuadrilla cada semana de
// planilla (jueves a miércoles), y en qué partidas y obras. La plata sale de la
// planilla que se guarda en H4 (Historial de nóminas); el cálculo y sus reglas
// están en lib/cuadrillas-costo.ts. Lo pidió Michael Thames (Obra Gris) para
// saber, por ejemplo, cuánto costó la cuadrilla de losa en Fundaciones o la de
// acero por semana.

type Medida = 'neto' | 'monto';
const MEDIDAS: { val: Medida; label: string; ayuda: string }[] = [
  { val: 'neto', label: 'Costo neto (×1,5)', ayuda: 'Lo de la planilla por el factor con que se guardó en H4' },
  { val: 'monto', label: 'Planilla', ayuda: 'Lo que se le pagó a la gente, tal cual el Excel de planilla' },
];

const SIN_CUADRILLA = 'Sin cuadrilla';
/** Igual que TOPE en app/api/cuadrillas-costos/route.ts. */
const TOPE_SEMANAS = 13;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
/** "8–14 oct" en el mismo mes, "29 oct – 4 nov" si cruza. */
const rangoSemana = (s: SemanaPlanilla) =>
  s.desde.slice(5, 7) === s.hasta.slice(5, 7)
    ? `${Number(s.desde.slice(8, 10))}–${fechaCorta(s.hasta)}`
    : `${fechaCorta(s.desde)} – ${fechaCorta(s.hasta)}`;
const horasFmt = (h: number) => h.toLocaleString('es-CR', { maximumFractionDigits: 1 });
const porCodigo = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
const etiquetaPartida = (f: Pick<FilaCostoCuadrilla, 'partidaCodigo' | 'partidaNombre'>) =>
  [f.partidaCodigo, f.partidaNombre].filter(Boolean).join(' ') || 'Sin partida';

async function loadXLSX(): Promise<typeof import('xlsx')> {
  const m = await import('xlsx');
  return ((m as unknown as { default?: typeof import('xlsx') }).default ?? m) as typeof import('xlsx');
}

interface Celda { valor: number; horas: number }
interface Renglon {
  clave: string;
  titulo: string;
  sub?: string;
  porSemana: Map<number, Celda>;
  total: number;
  horas: number;
}

/** Agrupa filas en renglones (por cuadrilla, partida u obra) con una celda por semana. */
function agrupar(
  filas: FilaCostoCuadrilla[],
  medida: Medida,
  claveDe: (f: FilaCostoCuadrilla) => string,
  tituloDe: (f: FilaCostoCuadrilla) => string,
  subDe?: (fs: FilaCostoCuadrilla[]) => string,
): Renglon[] {
  const grupos = new Map<string, FilaCostoCuadrilla[]>();
  for (const f of filas) {
    const k = claveDe(f);
    const g = grupos.get(k);
    if (g) g.push(f);
    else grupos.set(k, [f]);
  }
  return [...grupos.entries()].map(([clave, fs]) => {
    const porSemana = new Map<number, Celda>();
    let total = 0;
    let horas = 0;
    for (const f of fs) {
      const c = porSemana.get(f.idSemana) ?? { valor: 0, horas: 0 };
      c.valor += f[medida];
      c.horas += f.horas;
      porSemana.set(f.idSemana, c);
      total += f[medida];
      horas += f.horas;
    }
    return { clave, titulo: tituloDe(fs[0]), sub: subDe?.(fs), porSemana, total, horas };
  });
}

/** Tabla de renglones × semanas, con fila de totales. Se usa en la vista y en el detalle. */
function TablaSemanas({
  renglones,
  semanas,
  encabezado,
  onAbrir,
}: {
  renglones: Renglon[];
  semanas: SemanaPlanilla[];
  encabezado: string;
  onAbrir?: (r: Renglon) => void;
}) {
  const totalSemana = (id: number) => renglones.reduce((a, r) => a + (r.porSemana.get(id)?.valor ?? 0), 0);
  const total = renglones.reduce((a, r) => a + r.total, 0);
  const horas = renglones.reduce((a, r) => a + r.horas, 0);
  const num = 'px-4 py-3 text-right tabular-nums whitespace-nowrap';
  return (
    <div className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-ds-gray-100 border-b border-ds-gray-200 text-xs uppercase tracking-wide text-ds-gray-500">
            <th className="px-4 py-3 text-left font-semibold min-w-[200px]">{encabezado}</th>
            {semanas.map((s) => (
              <th key={s.id} className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                <div>Sem {s.numero}</div>
                <div className="font-normal normal-case tracking-normal text-ds-gray-400">{rangoSemana(s)}</div>
              </th>
            ))}
            <th className="px-4 py-3 text-right font-semibold">Total</th>
            <th className="px-4 py-3 text-right font-semibold">Horas</th>
            <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">₡ / hora</th>
          </tr>
        </thead>
        <tbody>
          {renglones.map((r) => (
            <tr
              key={r.clave}
              onClick={onAbrir ? () => onAbrir(r) : undefined}
              onKeyDown={onAbrir ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(r); } } : undefined}
              tabIndex={onAbrir ? 0 : undefined}
              className={`border-b border-ds-gray-100 last:border-0 ${onAbrir ? 'cursor-pointer hover:bg-ds-gray-100 focus-visible:outline-none focus-visible:bg-ds-gray-100' : ''}`}
            >
              <td className="px-4 py-3 text-ds-ink">
                <div className={`font-semibold break-words ${r.titulo === SIN_CUADRILLA ? 'text-ds-gray-400' : ''}`}>{r.titulo}</div>
                {r.sub && <div className="text-xs text-ds-gray-400 break-words">{r.sub}</div>}
              </td>
              {semanas.map((s) => {
                const c = r.porSemana.get(s.id);
                return (
                  <td key={s.id} className={`${num} ${c && c.valor ? 'text-ds-ink' : 'text-ds-gray-300'}`}>
                    {c && c.valor ? formatCRC(c.valor) : '—'}
                  </td>
                );
              })}
              <td className={`${num} font-semibold text-ds-ink`}>{formatCRC(r.total)}</td>
              <td className={`${num} text-ds-gray-500`}>{horasFmt(r.horas)}</td>
              <td className={`${num} text-ds-gray-500`}>{r.horas > 0 ? formatCRC(r.total / r.horas) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-ds-gray-100 border-t border-ds-gray-200 font-semibold text-ds-ink">
            <td className="px-4 py-3">Total</td>
            {semanas.map((s) => (
              <td key={s.id} className={num}>{formatCRC(totalSemana(s.id))}</td>
            ))}
            <td className={num}>{formatCRC(total)}</td>
            <td className={num}>{horasFmt(horas)}</td>
            <td className={num}>{horas > 0 ? formatCRC(total / horas) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function CostoCuadrillas() {
  const { toast } = useToast();
  const [semanas, setSemanas] = useState<SemanaPlanilla[]>([]);
  const [elegidas, setElegidas] = useState<number[]>([]);
  const [filas, setFilas] = useState<FilaCostoCuadrilla[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [medida, setMedida] = useState<Medida>('neto');
  const [proyecto, setProyecto] = useState('');
  const [partidas, setPartidas] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [abierta, setAbierta] = useState<{ clave: string; titulo: string } | null>(null);
  const [exportando, setExportando] = useState(false);

  // Trae las semanas pedidas (sin `ids`, las últimas que elija el servidor). Los
  // setState van en el .then: el efecto de la primera carga no puede llamarlos de una.
  const pedir = useCallback((ids?: number[]) => {
    const qs = ids && ids.length ? `?semanas=${ids.join(',')}` : '';
    return fetch(`/api/cuadrillas-costos${qs}`, { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudo cargar el costo de las cuadrillas');
        setSemanas(data.semanas ?? []);
        setElegidas(data.elegidas ?? []);
        setFilas(data.filas ?? []);
        setError(null);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Error al cargar';
        setError(msg);
        toast(msg, 'error');
      })
      .finally(() => setCargando(false));
  }, [toast]);

  useEffect(() => { pedir(); }, [pedir]);

  function cargar(ids?: number[]) {
    setCargando(true);
    pedir(ids);
  }

  // Columnas: de la más vieja a la más nueva.
  const columnas = useMemo(
    () => semanas.filter((s) => elegidas.includes(s.id)).sort((a, b) => a.desde.localeCompare(b.desde)),
    [semanas, elegidas],
  );

  /** Rango de semanas: todas las guardadas entre "desde" y "hasta" (en cualquier orden), hasta TOPE_SEMANAS. */
  function elegirRango(idDesde: number, idHasta: number) {
    const a = semanas.find((s) => s.id === idDesde);
    const b = semanas.find((s) => s.id === idHasta);
    if (!a || !b) return;
    const [ini, fin] = a.desde <= b.desde ? [a.desde, b.desde] : [b.desde, a.desde];
    let ids = semanas.filter((s) => s.desde >= ini && s.desde <= fin).map((s) => s.id); // vienen de la más nueva a la más vieja
    if (ids.length > TOPE_SEMANAS) {
      ids = ids.slice(0, TOPE_SEMANAS);
      toast(`Se muestran ${TOPE_SEMANAS} semanas a la vez: las más recientes del rango.`, 'warning');
    }
    setElegidas(ids);
    cargar(ids);
  }
  const opcionesSemana = semanas.map((s) => ({ value: String(s.id), label: `Sem ${s.numero} · ${rangoSemana(s)}` }));
  const idDesde = columnas[0]?.id;
  const idHasta = columnas[columnas.length - 1]?.id;

  const opcionesProyecto = useMemo(
    () => [...new Set(filas.map((f) => f.proyecto))].sort((a, b) => a.localeCompare(b, 'es')).map((p) => ({ value: p, label: p })),
    [filas],
  );
  const opcionesPartida = useMemo(() => {
    const base = proyecto ? filas.filter((f) => f.proyecto === proyecto) : filas;
    const vistas = new Map<string, string>();
    for (const f of base) vistas.set(etiquetaPartida(f), f.partidaCodigo);
    return [...vistas.entries()]
      .sort(([a, ca], [b, cb]) => porCodigo(ca, cb) || a.localeCompare(b, 'es'))
      .map(([label]) => ({ value: label, label }));
  }, [filas, proyecto]);

  const filtradas = useMemo(() => {
    const busca = q.trim();
    const conPartida = new Set(partidas);
    return filas.filter(
      (f) =>
        (!proyecto || f.proyecto === proyecto) &&
        (conPartida.size === 0 || conPartida.has(etiquetaPartida(f))) &&
        (!busca || coincideBusqueda(f.cuadrilla, busca)),
    );
  }, [filas, proyecto, partidas, q]);

  const porCuadrilla = useMemo(
    () =>
      agrupar(filtradas, medida, (f) => String(f.idCuadrilla ?? 'sin'), (f) => f.cuadrilla).sort(
        (a, b) => Number(a.titulo === SIN_CUADRILLA) - Number(b.titulo === SIN_CUADRILLA) || b.total - a.total,
      ),
    [filtradas, medida],
  );

  // El detalle de la cuadrilla abierta, con los mismos filtros de la vista.
  const detalle = useMemo(() => {
    if (!abierta) return null;
    const suyas = filtradas.filter((f) => String(f.idCuadrilla ?? 'sin') === abierta.clave);
    const obrasDe = (fs: FilaCostoCuadrilla[]) => [...new Set(fs.map((f) => f.obra))].sort(porCodigo).join(', ');
    const porPartida = agrupar(suyas, medida, etiquetaPartida, etiquetaPartida, obrasDe).sort(
      (a, b) => b.total - a.total,
    );
    const porObra = agrupar(suyas, medida, (f) => f.obra, (f) => f.obra, (fs) => fs[0].proyecto).sort(
      (a, b) => b.total - a.total,
    );
    const total = suyas.reduce((a, f) => a + f[medida], 0);
    const horas = suyas.reduce((a, f) => a + f.horas, 0);
    return { porPartida, porObra, total, horas };
  }, [abierta, filtradas, medida]);

  const total = porCuadrilla.reduce((a, r) => a + r.total, 0);
  const horas = porCuadrilla.reduce((a, r) => a + r.horas, 0);
  const conCosto = porCuadrilla.filter((r) => r.titulo !== SIN_CUADRILLA && r.total > 0).length;
  const hayFiltro = !!proyecto || partidas.length > 0 || !!q.trim();
  const medidaLabel = MEDIDAS.find((m) => m.val === medida)!.label;

  async function exportar() {
    setExportando(true);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.utils.book_new();
      const resumen = [
        ['Cuadrilla', ...columnas.map((s) => `Sem ${s.numero} (${s.desde} a ${s.hasta})`), 'Total', 'Horas', '₡ / hora'],
        ...porCuadrilla.map((r) => [
          r.titulo,
          ...columnas.map((s) => Math.round((r.porSemana.get(s.id)?.valor ?? 0) * 100) / 100),
          Math.round(r.total * 100) / 100,
          Math.round(r.horas * 100) / 100,
          r.horas > 0 ? Math.round(r.total / r.horas) : '',
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), `Resumen ${medida === 'neto' ? 'neto' : 'planilla'}`);
      const semanaDe = new Map(semanas.map((s) => [s.id, s]));
      const plano = [
        ['Semana', 'Desde', 'Hasta', 'Cuadrilla', 'Proyecto', 'Obra', 'Código partida', 'Partida', 'Subpartida', 'Horas', 'Costo planilla', 'Costo neto'],
        ...filtradas.map((f) => {
          const s = semanaDe.get(f.idSemana);
          return [s ? `Sem ${s.numero}` : '', s?.desde ?? '', s?.hasta ?? '', f.cuadrilla, f.proyecto, f.obra, f.partidaCodigo, f.partidaNombre, f.subpartida, f.horas, f.monto, f.neto];
        }),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plano), 'Detalle');
      const rango = columnas.length ? `${columnas[0].desde}_${columnas[columnas.length - 1].hasta}` : 'sin-semanas';
      XLSX.writeFile(wb, `costo-cuadrillas_${rango}.xlsx`);
    } catch {
      toast('No se pudo armar el Excel', 'error');
    } finally {
      setExportando(false);
    }
  }

  if (!cargando && !error && semanas.length === 0) {
    return (
      <EstadoVacio icono="calculator" titulo="Todavía no hay planillas guardadas">
        El costo sale de la planilla que se guarda en H4 (Cierre → Obra o Porcentajes → Guardar en el historial). Cuando se guarde la primera semana, aparece acá.
      </EstadoVacio>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-60">
          <Combobox
            label="Desde la semana"
            value={idDesde ? String(idDesde) : ''}
            onChange={(v) => elegirRango(Number(v), idHasta ?? Number(v))}
            options={opcionesSemana}
            placeholder={semanas.length === 0 ? 'Cargando…' : 'Elegí una semana'}
          />
        </div>
        <div className="w-full sm:w-60">
          <Combobox
            label="Hasta la semana"
            value={idHasta ? String(idHasta) : ''}
            onChange={(v) => elegirRango(idDesde ?? Number(v), Number(v))}
            options={opcionesSemana}
            placeholder={semanas.length === 0 ? 'Cargando…' : 'Elegí una semana'}
          />
        </div>
        <div className="w-full sm:w-64">
          <Combobox
            label="Proyecto"
            value={proyecto}
            onChange={(v) => { setProyecto(v); setPartidas([]); }}
            options={[{ value: '', label: 'Todos los proyectos' }, ...opcionesProyecto]}
            placeholder="Todos los proyectos"
          />
        </div>
        <div className="w-full sm:w-72">
          <Combobox
            label="Partida"
            multiple
            values={partidas}
            onValuesChange={setPartidas}
            options={opcionesPartida}
            placeholder="Todas las partidas"
          />
        </div>
        <div className="w-full sm:w-60">
          <Input
            label="Cuadrilla"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cuadrilla"
            leftIcon={<Icon name="search" size="sm" color="currentColor" className="text-ds-gray-400" />}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ds-gray-500">Mostrar</span>
          <div className="flex gap-1">
            {MEDIDAS.map((m) => (
              <button
                key={m.val}
                type="button"
                onClick={() => setMedida(m.val)}
                aria-pressed={medida === m.val}
                title={m.ayuda}
                className={`rounded-ds border px-3 py-2 text-body-sm transition-colors ${
                  medida === m.val
                    ? 'border-ds-ink bg-ds-ink text-ds-surface'
                    : 'border-ds-gray-200 bg-ds-surface text-ds-gray-500 hover:border-ds-gray-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex items-end gap-2">
          {hayFiltro && (
            <Button variant="ghost" size="sm" onClick={() => { setProyecto(''); setPartidas([]); setQ(''); }}>
              Quitar filtros
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            loading={exportando}
            disabled={cargando || filtradas.length === 0}
            onClick={exportar}
            icon={<Icon name="boleta" size="sm" color="currentColor" />}
          >
            Descargar Excel
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: medidaLabel, valor: cargando ? '—' : formatCRC(total) },
          { label: 'Horas', valor: cargando ? '—' : horasFmt(horas) },
          { label: 'Costo por hora', valor: cargando || horas === 0 ? '—' : formatCRC(total / horas) },
          { label: 'Cuadrillas con costo', valor: cargando ? '—' : String(conCosto) },
        ].map((x) => (
          <div key={x.label} className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface px-4 py-3 shadow-ds-01">
            <div className="text-label text-ds-gray-400">{x.label}</div>
            <div className="text-sub-sm font-semibold text-ds-ink tabular-nums">{x.valor}</div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      {cargando ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <EstadoVacio icono="alert" titulo="No se pudo cargar" accion={<Button variant="outline" onClick={() => cargar(elegidas)}>Probar de nuevo</Button>}>
          {error}
        </EstadoVacio>
      ) : porCuadrilla.length === 0 ? (
        <EstadoVacio icono="calculator" titulo="Sin costo con esos filtros">
          Ninguna cuadrilla tiene costo en esas semanas con el proyecto, la partida o la búsqueda elegidos.
        </EstadoVacio>
      ) : (
        <TablaSemanas renglones={porCuadrilla} semanas={columnas} encabezado="Cuadrilla" onAbrir={(r) => setAbierta({ clave: r.clave, titulo: r.titulo })} />
      )}

      <p className="text-body-sm text-ds-gray-400">
        Sale de la planilla que se guarda en H4 cada semana (jueves a miércoles; si se guardó dos veces, vale la última).
        Por subpartida da lo mismo que la hoja ACT BC; cuando varias cuadrillas trabajaron la misma subpartida, se reparte
        según las horas de cada persona y lo que cuesta su hora. «Sin cuadrilla» es lo que no se marcó en ninguna
        (feriados, vacaciones e incapacidades). Tocá una cuadrilla para ver sus partidas y obras.
      </p>

      <Modal open={!!abierta} onClose={() => setAbierta(null)} title={abierta?.titulo ?? 'Cuadrilla'} size="2xl">
        {abierta && detalle && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-label text-ds-gray-400">{medidaLabel}</div>
                <div className="font-semibold text-ds-ink tabular-nums">{formatCRC(detalle.total)}</div>
              </div>
              <div>
                <div className="text-label text-ds-gray-400">Horas</div>
                <div className="font-semibold text-ds-ink tabular-nums">{horasFmt(detalle.horas)}</div>
              </div>
              <div>
                <div className="text-label text-ds-gray-400">Costo por hora</div>
                <div className="font-semibold text-ds-ink tabular-nums">{detalle.horas > 0 ? formatCRC(detalle.total / detalle.horas) : '—'}</div>
              </div>
            </div>
            {hayFiltro && (
              <p className="text-body-sm text-ds-gray-400">Con los filtros de la pantalla (proyecto, partida o búsqueda).</p>
            )}
            <div className="space-y-2">
              <h3 className="text-label uppercase tracking-wide text-ds-gray-500">Por partida</h3>
              <TablaSemanas renglones={detalle.porPartida} semanas={columnas} encabezado="Partida · obras" />
            </div>
            <div className="space-y-2">
              <h3 className="text-label uppercase tracking-wide text-ds-gray-500">Por obra</h3>
              <TablaSemanas renglones={detalle.porObra} semanas={columnas} encabezado="Obra · proyecto" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
