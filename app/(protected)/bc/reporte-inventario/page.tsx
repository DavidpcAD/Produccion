'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

// Reporte de inventario por almacén (SOLO Super Admin). Lee el snapshot
// dbo.InventarioAlmacen vía /api/bc/inventario/almacen. Lo importante es lo SIN
// LIQUIDAR: material apartado al almacén de proyecto (gomJobWarehouseQuantity > 0),
// lo que muestra la página "Almacén de proyecto" de BC. Se mantiene al día SOLO: al
// abrir, si la foto está vieja, dispara el sync en segundo plano (sin botón).

interface Fila {
  entryNo: number;
  almacen: string | null;
  tipoAlmacen: string | null;
  esVirtual: boolean;
  categoria: string | null;
  itemNo: string;
  descripcion: string | null;
  obra: string | null;
  unidad: string | null;
  cantidad: number;
  cantidadProyecto: number;
  costoActual: number | null;
  proveedor: string | null;
  documentoNo: string | null;
  tipoMovimiento: string | null;
  fechaMovimiento: string | null;
}
interface Estado {
  ultimaCorrida: string | null;
  filas: number | null;
  ok: boolean | null;
  ms: number | null;
  mensaje: string | null;
}

const TOPE_FILAS = 300;
const STALE_MS = 10 * 60 * 1000; // si la foto es más vieja que esto, se re-sincroniza sola al abrir.
const num = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 });

function haceCuanto(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'hace instantes';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function agrupar(filas: Fila[], key: (f: Fila) => string): { nombre: string; valor: number }[] {
  const m = new Map<string, number>();
  for (const f of filas) {
    const k = key(f);
    m.set(k, (m.get(k) ?? 0) + (f.cantidadProyecto || 0));
  }
  return Array.from(m, ([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor).slice(0, 10);
}

export default function ReporteInventarioPage() {
  const { toast } = useToast();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);

  const [buscar, setBuscar] = useState('');
  const [obraSel, setObraSel] = useState('');
  const [almacenSel, setAlmacenSel] = useState('');
  const [categoriaSel, setCategoriaSel] = useState('');
  const [soloVirtuales, setSoloVirtuales] = useState(true);
  const yaAutorefresco = useRef(false);

  const cargar = useCallback(async (): Promise<Estado | null> => {
    try {
      const res = await fetch('/api/bc/inventario/almacen', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el inventario');
      setFilas(Array.isArray(data.filas) ? data.filas : []);
      setEstado(data.estado ?? null);
      return (data.estado ?? null) as Estado | null;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cargar', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const sincronizar = useCallback(async () => {
    setActualizando(true);
    try {
      const res = await fetch('/api/bc/inventario/sync-almacen', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar');
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo actualizar desde BC', 'error');
    } finally {
      setActualizando(false);
    }
  }, [cargar, toast]);

  // Al abrir: carga la foto y, si está vieja (o vacía), re-sincroniza SOLA una vez en
  // segundo plano. Así el reporte siempre está al día sin que el usuario toque nada.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const est = await cargar();
      if (!vivo || yaAutorefresco.current) return;
      const edad = est?.ultimaCorrida ? Date.now() - new Date(est.ultimaCorrida).getTime() : Infinity;
      if (edad > STALE_MS) {
        yaAutorefresco.current = true;
        sincronizar();
      }
    })();
    return () => { vivo = false; };
  }, [cargar, sincronizar]);

  const obras = useMemo(
    () => Array.from(new Set(filas.map((f) => f.obra).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es')),
    [filas],
  );
  const almacenes = useMemo(
    () => Array.from(new Set(filas.map((f) => f.almacen).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es')),
    [filas],
  );
  const categorias = useMemo(
    () => Array.from(new Set(filas.map((f) => f.categoria).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es')),
    [filas],
  );

  const filtradas = useMemo(() => {
    const q = buscar.trim();
    return filas.filter((f) => {
      if (soloVirtuales && !f.esVirtual) return false;
      if (obraSel && f.obra !== obraSel) return false;
      if (almacenSel && f.almacen !== almacenSel) return false;
      if (categoriaSel && f.categoria !== categoriaSel) return false;
      if (q && !coincideBusqueda(f.itemNo, q) && !coincideBusqueda(f.descripcion ?? '', q) &&
        !coincideBusqueda(f.obra ?? '', q) && !coincideBusqueda(f.almacen ?? '', q)) return false;
      return true;
    });
  }, [filas, buscar, obraSel, almacenSel, categoriaSel, soloVirtuales]);

  const kpis = useMemo(() => ({
    movimientos: filtradas.length,
    almacenes: new Set(filtradas.map((f) => f.almacen)).size,
    cantidad: filtradas.reduce((s, f) => s + (f.cantidad || 0), 0),
    sinLiquidar: filtradas.filter((f) => f.esVirtual).reduce((s, f) => s + (f.cantidadProyecto || 0), 0),
  }), [filtradas]);

  // Gráficos: apartado SIN LIQUIDAR agrupado (responden a los filtros).
  const soloSinLiquidar = useMemo(() => filtradas.filter((f) => f.esVirtual), [filtradas]);
  const porAlmacen = useMemo(() => agrupar(soloSinLiquidar, (f) => f.almacen ?? '—'), [soloSinLiquidar]);
  const porCategoria = useMemo(() => agrupar(soloSinLiquidar, (f) => f.categoria ?? 'Sin categoría'), [soloSinLiquidar]);

  const visibles = filtradas.slice(0, TOPE_FILAS);

  const opt = (xs: string[], todos: string) => [{ value: '', label: todos }, ...xs.map((x) => ({ value: x, label: x }))];

  return (
    <PageShell>
      <PageHeader
        title="Reporte de inventario"
        subtitle="Material apartado al almacén de proyecto que aún no se liquidó, tomado de Business Central. Se actualiza solo al abrir — no hay que refrescar a mano."
        actions={
          <span className="inline-flex items-center gap-2 text-body-sm text-ds-gray-500">
            <span className={`h-2 w-2 rounded-full ${actualizando ? 'animate-pulse bg-ds-yellow-ink' : 'bg-ds-green-ink'}`} />
            {actualizando ? 'Actualizando desde BC…' : estado?.ultimaCorrida ? `Al día · ${haceCuanto(estado.ultimaCorrida)}` : 'Sin datos aún'}
          </span>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo="Movimientos" valor={loading ? '—' : num.format(kpis.movimientos)} />
        <KpiCard titulo="Almacenes" valor={loading ? '—' : num.format(kpis.almacenes)} />
        <KpiCard titulo="Existencia total" valor={loading ? '—' : num.format(kpis.cantidad)} />
        <KpiCard titulo="Apartado sin liquidar" valor={loading ? '—' : num.format(kpis.sinLiquidar)} destacado={kpis.sinLiquidar > 0} />
      </div>

      {/* Filtros (Combobox del DS) */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-60">
          <Input label="Buscar" placeholder="Artículo, descripción u obra" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        <div className="w-52">
          <Combobox label="Obra" value={obraSel} onChange={setObraSel} options={opt(obras, 'Todas las obras')} placeholder="Todas las obras" />
        </div>
        <div className="w-52">
          <Combobox label="Almacén" value={almacenSel} onChange={setAlmacenSel} options={opt(almacenes, 'Todos los almacenes')} placeholder="Todos los almacenes" />
        </div>
        <div className="w-56">
          <Combobox label="Categoría" value={categoriaSel} onChange={setCategoriaSel} options={opt(categorias, 'Todas las categorías')} placeholder="Todas las categorías" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ds-gray-500">Vista</span>
          <button
            type="button"
            onClick={() => setSoloVirtuales((v) => !v)}
            aria-pressed={soloVirtuales}
            className={`rounded-ds border px-3 py-2 text-body-sm transition-colors ${
              soloVirtuales ? 'border-ds-ink bg-ds-ink text-ds-surface' : 'border-ds-gray-200 bg-ds-surface text-ds-gray-500 hover:border-ds-gray-300'
            }`}
          >
            Solo sin liquidar
          </button>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartBar titulo="Apartado sin liquidar · por almacén" datos={porAlmacen} loading={loading} />
        <ChartBar titulo="Apartado sin liquidar · por categoría" datos={porCategoria} loading={loading} />
      </div>

      {/* Detalle */}
      <Table<Fila>
        columns={[
          { key: 'almacen', header: 'Almacén', className: 'font-semibold whitespace-nowrap', render: (f) => (
            <span className="inline-flex items-center gap-2">
              {f.almacen || <span className="text-ds-gray-300">—</span>}
              {f.esVirtual && (
                <span className="inline-flex items-center rounded-ds bg-ds-yellow-soft px-1.5 py-0.5 text-label font-medium text-ds-yellow-ink">sin liquidar</span>
              )}
            </span>
          ) },
          { key: 'categoria', header: 'Categoría', render: (f) => f.categoria || <span className="text-ds-gray-300">—</span> },
          { key: 'itemNo', header: 'Artículo', className: 'font-mono whitespace-nowrap', render: (f) => f.itemNo },
          { key: 'descripcion', header: 'Descripción', render: (f) => f.descripcion || <span className="text-ds-gray-300">—</span> },
          { key: 'obra', header: 'Obra', className: 'whitespace-nowrap', render: (f) => f.obra || <span className="text-ds-gray-300">—</span> },
          { key: 'cantidad', header: 'Existencia', className: 'text-right whitespace-nowrap', render: (f) => <span>{num.format(f.cantidad)}</span> },
          { key: 'cantidadProyecto', header: 'Sin liquidar', className: 'text-right whitespace-nowrap', render: (f) => (
            f.cantidadProyecto > 0
              ? <span className="font-semibold text-ds-yellow-ink">{num.format(f.cantidadProyecto)}</span>
              : <span className="text-ds-gray-300">—</span>
          ) },
          { key: 'unidad', header: 'Unidad', className: 'whitespace-nowrap', render: (f) => f.unidad || '—' },
          { key: 'proveedor', header: 'Proveedor', render: (f) => f.proveedor || <span className="text-ds-gray-300">—</span> },
          { key: 'fechaMovimiento', header: 'Fecha', className: 'whitespace-nowrap', render: (f) => (f.fechaMovimiento ? f.fechaMovimiento.slice(0, 10) : '—') },
        ]}
        data={visibles}
        keyField="entryNo"
        loading={loading}
        emptyMessage={
          soloVirtuales
            ? 'No hay material sin liquidar (apartado al almacén de proyecto) con los filtros actuales.'
            : buscar || obraSel || almacenSel || categoriaSel
              ? 'Ningún movimiento coincide con el filtro.'
              : 'Sin datos todavía.'
        }
      />

      {!loading && filtradas.length > TOPE_FILAS && (
        <p className="text-body-sm text-ds-gray-400">
          Mostrando {num.format(TOPE_FILAS)} de {num.format(filtradas.length)} movimientos. Usá los filtros para acotar.
        </p>
      )}
    </PageShell>
  );
}

function KpiCard({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className={`rounded-ds-lg border p-4 shadow-ds-01 ${destacado ? 'border-ds-yellow-ink bg-ds-yellow-soft' : 'border-ds-gray-200 bg-ds-surface'}`}>
      <p className="text-label uppercase tracking-wide text-ds-gray-400">{titulo}</p>
      <p className={`mt-1 text-sub-sm font-bold ${destacado ? 'text-ds-yellow-ink' : 'text-ds-ink'}`}>{valor}</p>
    </div>
  );
}

function ChartBar({ titulo, datos, loading }: { titulo: string; datos: { nombre: string; valor: number }[]; loading?: boolean }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
      <p className="mb-3 text-label uppercase tracking-wide text-ds-gray-400">{titulo}</p>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded-ds bg-ds-gray-100" />)}
        </div>
      ) : datos.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-ds-gray-400">Sin material sin liquidar</p>
      ) : (
        <div className="space-y-2">
          {datos.map((d) => (
            <div key={d.nombre} className="flex items-center gap-3">
              <span className="w-32 shrink-0 break-words text-body-sm text-ds-gray-600" title={d.nombre}>{d.nombre}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-ds bg-ds-gray-100">
                <div className="h-full rounded-ds bg-brand" style={{ width: `${(d.valor / max) * 100}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-body-sm text-ds-ink">{num.format(d.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
