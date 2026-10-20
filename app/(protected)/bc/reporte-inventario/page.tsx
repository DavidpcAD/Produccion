'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Input } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

// Reporte de inventario por almacén (SOLO Super Admin). Lee el snapshot
// dbo.InventarioAlmacen vía /api/bc/inventario/almacen. Lo importante son los
// almacenes VIRTUALES: ahí es donde queda el inventario "sin liquidar". El dato se
// refresca de noche; el botón "Refrescar desde BC" dispara el sync a mano.
// Ver lib/inventario/snapshot.ts y migrations/2026-10-20_inventario_almacen.sql.

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
const num = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 });

function fechaHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ReporteInventarioPage() {
  const { toast } = useToast();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const [buscar, setBuscar] = useState('');
  const [almacenSel, setAlmacenSel] = useState('');
  const [categoriaSel, setCategoriaSel] = useState('');
  const [soloVirtuales, setSoloVirtuales] = useState(true);

  const cargar = useCallback(async () => {
    // `loading` ya arranca en true, así que la primera carga muestra skeletons sin
    // tocar setLoading acá.
    try {
      const res = await fetch('/api/bc/inventario/almacen', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el inventario');
      setFilas(Array.isArray(data.filas) ? data.filas : []);
      setEstado(data.estado ?? null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cargar', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Cargar al montar. react-hooks/set-state-in-effect marca cualquier efecto que llame
  // una función con setState (aunque sea tras await): es el patrón normal de carga al montar.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar(); }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    try {
      const res = await fetch('/api/bc/inventario/sync-almacen', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo refrescar');
      toast(`Inventario actualizado: ${num.format(data.filas ?? 0)} movimientos.`, 'success');
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al refrescar', 'error');
    } finally {
      setRefrescando(false);
    }
  }, [toast, cargar]);

  // Opciones de los filtros (almacenes y categorías presentes en los datos).
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
      if (almacenSel && f.almacen !== almacenSel) return false;
      if (categoriaSel && f.categoria !== categoriaSel) return false;
      if (q && !coincideBusqueda(f.itemNo, q) && !coincideBusqueda(f.descripcion ?? '', q) &&
        !coincideBusqueda(f.obra ?? '', q) && !coincideBusqueda(f.almacen ?? '', q)) return false;
      return true;
    });
  }, [filas, buscar, almacenSel, categoriaSel, soloVirtuales]);

  // KPIs sobre lo FILTRADO (así los números acompañan el filtro).
  const kpis = useMemo(() => {
    const virt = filtradas.filter((f) => f.esVirtual);
    return {
      movimientos: filtradas.length,
      almacenes: new Set(filtradas.map((f) => f.almacen)).size,
      cantidad: filtradas.reduce((s, f) => s + (f.cantidad || 0), 0),
      sinLiquidar: virt.reduce((s, f) => s + (f.cantidadProyecto || 0), 0),
    };
  }, [filtradas]);

  const visibles = filtradas.slice(0, TOPE_FILAS);

  const subtitle = estado?.ultimaCorrida
    ? `Última actualización: ${fechaHora(estado.ultimaCorrida)} · ${num.format(estado.filas ?? 0)} movimientos abiertos (sin liquidar) bajados de Business Central.`
    : 'Inventario sin liquidar por almacén, tomado de Business Central. Todavía no se ha corrido ningún refresco.';

  return (
    <PageShell>
      <PageHeader
        title="Reporte de inventario"
        subtitle={subtitle}
        actions={
          <button
            type="button"
            onClick={refrescar}
            disabled={refrescando}
            className="rounded-ds border border-ds-ink bg-ds-ink px-4 py-2 text-body-sm font-semibold text-ds-surface transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {refrescando ? 'Refrescando…' : 'Refrescar desde BC'}
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo="Movimientos" valor={loading ? '—' : num.format(kpis.movimientos)} />
        <KpiCard titulo="Almacenes" valor={loading ? '—' : num.format(kpis.almacenes)} />
        <KpiCard titulo="Cantidad total" valor={loading ? '—' : num.format(kpis.cantidad)} />
        <KpiCard titulo="Apartado sin liquidar" valor={loading ? '—' : num.format(kpis.sinLiquidar)} destacado={kpis.sinLiquidar > 0} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Input
            label="Buscar"
            placeholder="Artículo, descripción, obra o almacén"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <SelectFiltro label="Almacén" value={almacenSel} onChange={setAlmacenSel} options={almacenes} todos="Todos los almacenes" />
        <SelectFiltro label="Categoría" value={categoriaSel} onChange={setCategoriaSel} options={categorias} todos="Todas las categorías" />
        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ds-gray-500">Vista</span>
          <button
            type="button"
            onClick={() => setSoloVirtuales((v) => !v)}
            aria-pressed={soloVirtuales}
            className={`rounded-ds border px-3 py-2 text-body-sm transition-colors ${
              soloVirtuales
                ? 'border-ds-ink bg-ds-ink text-ds-surface'
                : 'border-ds-gray-200 bg-ds-surface text-ds-gray-500 hover:border-ds-gray-300'
            }`}
          >
            Solo sin liquidar
          </button>
        </div>
      </div>

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
          { key: 'cantidad', header: 'Existencia', className: 'text-right whitespace-nowrap', render: (f) => (
            <span>{num.format(f.cantidad)}</span>
          ) },
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
            ? 'No hay material sin liquidar (apartado al almacén de proyecto) con los filtros actuales. Probá "Refrescar desde BC".'
            : buscar || almacenSel || categoriaSel
              ? 'Ningún movimiento coincide con el filtro.'
              : 'Sin datos. Usá "Refrescar desde BC" para cargar el inventario.'
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

function SelectFiltro({
  label, value, onChange, options, todos,
}: { label: string; value: string; onChange: (v: string) => void; options: string[]; todos: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-label text-ds-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-ds border border-ds-gray-200 bg-ds-surface px-3 py-2 text-body-sm text-ds-ink focus:border-ds-ink focus:outline-none"
      >
        <option value="">{todos}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
