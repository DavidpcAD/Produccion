'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Input } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatCRC } from '@/lib/utilidades/format';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

type Tipo = 'inventario' | 'servicio' | 'no-inventario';
interface Item {
  code: string;
  descripcion: string;
  unidad: string;
  unidadCompra?: string;
  tipo: Tipo;
  lastDirectCost?: number;
  categoria?: string;
}

const num = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 });

// Cuántas filas se dibujan a la vez. El catálogo de BC trae ~5.500 artículos y
// pintarlos todos (cada fila con su animación) traba el navegador; el presupuestista
// busca un material concreto, así que se muestran los primeros y se acota buscando.
const TOPE_FILAS = 200;

const TIPOS: { tipo: Tipo; label: string; badge: string }[] = [
  { tipo: 'inventario', label: 'Inventario', badge: 'bg-ds-green-soft text-ds-green-ink' },
  { tipo: 'servicio', label: 'Servicio', badge: 'bg-ds-yellow-soft text-ds-yellow-ink' },
  { tipo: 'no-inventario', label: 'No inventariable', badge: 'bg-ds-gray-100 text-ds-gray-500' },
];
const tipoMeta = (t: Tipo) => TIPOS.find((x) => x.tipo === t) ?? TIPOS[0];

function Badge({ tipo }: { tipo: Tipo }) {
  const m = tipoMeta(tipo);
  return (
    <span className={`inline-flex items-center rounded-ds px-2 py-0.5 text-label font-medium ${m.badge}`}>
      {m.label}
    </span>
  );
}

// ─── Existencias de un artículo (se piden al abrir la ficha) ──────────────────
interface FilaAlmacen { almacen: string; variante: string; cantidad: number; unidad: string }
interface Existencias { tipo: string; base: string; conocido: boolean; total: number | null; almacenes: FilaAlmacen[] }

function FichaExistencias({ item }: { item: Item }) {
  const [stock, setStock] = useState<Existencias | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');

  useEffect(() => {
    let vivo = true;
    setEstado('cargando');
    setStock(null);
    fetch(`/api/bc/existencias?item=${encodeURIComponent(item.code)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (!ok) throw new Error(d?.error || 'Sin datos');
        setStock(d);
        setEstado('ok');
      })
      .catch(() => { if (vivo) setEstado('error'); });
    return () => { vivo = false; };
  }, [item.code]);

  if (estado === 'cargando') {
    return <p className="text-body-sm text-ds-gray-400">Consultando existencias en Business Central…</p>;
  }
  if (estado === 'error' || !stock) {
    return <p className="text-body-sm text-ds-gray-400">Business Central no respondió por las existencias.</p>;
  }
  if (stock.tipo === 'servicio' || stock.tipo === 'no-inventario') {
    return <p className="text-body-sm text-ds-gray-400">No mueve inventario: no hay existencias que mostrar.</p>;
  }
  if (!stock.conocido && !stock.almacenes.length) {
    return <p className="text-body-sm text-ds-gray-400">Business Central no tiene ficha de este artículo.</p>;
  }
  if (stock.total == null) {
    return <p className="text-body-sm text-ds-gray-400">No se pudo leer el inventario.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-label uppercase tracking-wide text-ds-gray-500">Existencia total</span>
        <span className="font-semibold text-ds-ink">{num.format(stock.total)} {stock.base || item.unidad}</span>
      </div>
      {stock.almacenes.length === 0 ? (
        <p className="text-body-sm text-ds-gray-400">Sin existencias en ningún almacén de BC.</p>
      ) : (
        <div className="overflow-hidden rounded-ds-lg border border-ds-gray-200">
          <table className="w-full text-body-sm">
            <thead className="bg-ds-gray-100 text-label uppercase tracking-wide text-ds-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Almacén / obra</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {stock.almacenes.map((a, i) => (
                <tr key={`${a.almacen}-${a.variante}-${i}`} className="border-t border-ds-gray-100">
                  <td className="px-3 py-2 text-ds-ink">
                    {a.almacen || 'Sin almacén'}
                    {a.variante && <span className="ml-2 text-ds-gray-400">variante {a.variante}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-ds-ink">{num.format(a.cantidad)} {a.unidad || stock.base}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function InventarioBcPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [tipo, setTipo] = useState<Tipo | 'todos'>('todos');
  const [sel, setSel] = useState<Item | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bc/inventario', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el inventario');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cargar', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const f = filtro.trim();
    return items
      .filter((i) => tipo === 'todos' || i.tipo === tipo)
      .filter((i) => !f || coincideBusqueda(i.code, f) || coincideBusqueda(i.descripcion, f) || coincideBusqueda(i.categoria ?? '', f))
      .sort((a, b) => a.code.localeCompare(b.code, 'es'));
  }, [items, filtro, tipo]);

  const visibles = filtrados.slice(0, TOPE_FILAS);
  const conCosto = items.filter((i) => (i.lastDirectCost ?? 0) > 0).length;

  return (
    <PageShell>
      <PageHeader
        title="Inventario de materiales (BC)"
        subtitle="Catálogo de artículos de Business Central: material, unidad y costo unitario. Abrí una fila para ver las existencias por almacén."
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Input
              label="Buscar material"
              placeholder="Código o descripción"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-label text-ds-gray-500">Tipo</span>
            <div className="flex gap-1">
              {([{ tipo: 'todos', label: 'Todos' }, ...TIPOS] as { tipo: Tipo | 'todos'; label: string }[]).map((t) => (
                <button
                  key={t.tipo}
                  type="button"
                  onClick={() => setTipo(t.tipo)}
                  className={`rounded-ds border px-3 py-2 text-body-sm transition-colors ${
                    tipo === t.tipo
                      ? 'border-ds-ink bg-ds-ink text-ds-surface'
                      : 'border-ds-gray-200 bg-ds-surface text-ds-gray-500 hover:border-ds-gray-300'
                  }`}
                  aria-pressed={tipo === t.tipo}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-6 rounded-ds-lg border border-ds-gray-200 bg-ds-surface px-4 py-3 shadow-ds-01">
          <div>
            <div className="text-label text-ds-gray-400">Artículos</div>
            <div className="font-semibold text-ds-ink">{loading ? '—' : items.length.toLocaleString('es-CR')}</div>
          </div>
          <div>
            <div className="text-label text-ds-gray-400">Con costo</div>
            <div className="font-semibold text-ds-ink">{loading ? '—' : conCosto.toLocaleString('es-CR')}</div>
          </div>
        </div>
      </div>

      <Table<Item>
        columns={[
          { key: 'code', header: 'Código', className: 'font-mono font-semibold whitespace-nowrap', render: (i) => i.code },
          { key: 'descripcion', header: 'Descripción', render: (i) => i.descripcion },
          { key: 'categoria', header: 'Partida', render: (i) => i.categoria || <span className="text-ds-gray-300">—</span> },
          { key: 'tipo', header: 'Tipo', render: (i) => <Badge tipo={i.tipo} /> },
          { key: 'unidad', header: 'Unidad', className: 'whitespace-nowrap', render: (i) => i.unidad || '—' },
          {
            key: 'lastDirectCost',
            header: 'Costo unitario',
            className: 'text-right whitespace-nowrap',
            render: (i) => (i.lastDirectCost ?? 0) > 0
              ? <span className="font-semibold">{formatCRC(i.lastDirectCost)}</span>
              : <span className="text-ds-gray-300">s/d</span>,
          },
        ]}
        data={visibles}
        keyField="code"
        loading={loading}
        emptyMessage={filtro || tipo !== 'todos' ? 'Ningún material coincide con el filtro.' : 'Sin artículos en Business Central.'}
        onRowClick={(i) => setSel(i)}
      />

      {!loading && filtrados.length > TOPE_FILAS && (
        <p className="text-body-sm text-ds-gray-400">
          Mostrando {TOPE_FILAS.toLocaleString('es-CR')} de {filtrados.length.toLocaleString('es-CR')} resultados. Buscá para acotar.
        </p>
      )}

      <Modal
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel ? sel.code : 'Material'}
        size="lg"
      >
        {sel && (
          <div className="space-y-5">
            <div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-body font-semibold text-ds-ink">{sel.descripcion}</h3>
                <Badge tipo={sel.tipo} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <div className="text-label text-ds-gray-400">Unidad base</div>
                <div className="font-semibold text-ds-ink">{sel.unidad || '—'}</div>
              </div>
              <div>
                <div className="text-label text-ds-gray-400">Unidad de compra</div>
                <div className="font-semibold text-ds-ink">{sel.unidadCompra || sel.unidad || '—'}</div>
              </div>
              <div>
                <div className="text-label text-ds-gray-400">Partida</div>
                <div className="font-semibold text-ds-ink">{sel.categoria || '—'}</div>
              </div>
              <div>
                <div className="text-label text-ds-gray-400">Costo unitario</div>
                <div className="font-semibold text-ds-ink">
                  {(sel.lastDirectCost ?? 0) > 0 ? formatCRC(sel.lastDirectCost) : 's/d'}
                </div>
              </div>
            </div>

            <div className="border-t border-ds-gray-100 pt-4">
              <h4 className="mb-2 text-label uppercase tracking-wide text-ds-gray-500">Existencias en BC</h4>
              <FichaExistencias item={sel} />
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
