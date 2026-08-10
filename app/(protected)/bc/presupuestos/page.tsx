'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Input } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatCRC } from '@/lib/utilidades/format';

interface Resumen {
  works_no: string;
  version_code: string;
  es_ultima_version: boolean;
  fecha_carga: string;
  total_costo: number;
}
interface Grupo { task_no: string; descripcion: string; total: number; peso_pct: number }
interface PartidaP {
  task_no: string;
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  precio_unitario: number;
  importe: number;
  peso_pct: number;
}
interface Detalle extends Resumen {
  grupos: Grupo[];
  partidas: PartidaP[];
}

function fmtFecha(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CR');
}

export default function PresupuestosPage() {
  const { toast } = useToast();
  const [filas, setFilas] = useState<Resumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargandoDet, setCargandoDet] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/presupuestos', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar');
      setFilas(Array.isArray(data) ? data : []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cargar', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Solo la versión vigente por obra en el listado (las históricas quedan fuera).
  const vigentes = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return filas
      .filter((r) => r.es_ultima_version)
      .filter((r) => !f || r.works_no.toLowerCase().includes(f))
      .sort((a, b) => b.total_costo - a.total_costo);
  }, [filas, filtro]);

  const totalGeneral = vigentes.reduce((s, r) => s + r.total_costo, 0);

  async function abrirDetalle(obra: string) {
    setCargandoDet(obra);
    try {
      const res = await fetch(`/api/presupuestos/${encodeURIComponent(obra)}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sin detalle');
      setDetalle(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al abrir detalle', 'error');
    } finally {
      setCargandoDet(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Presupuestos por obra"
        subtitle="Presupuesto de costo directo cargado en Business Central (versión vigente por obra)."
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-56">
          <Input label="Filtrar obra" placeholder="Ej. VN-K" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
        <div className="flex gap-6 rounded-ds-lg border border-ds-gray-200 bg-ds-surface px-4 py-3 shadow-ds-01">
          <div>
            <div className="text-label text-ds-gray-400">Obras</div>
            <div className="font-semibold text-ds-ink">{loading ? '—' : vigentes.length}</div>
          </div>
          <div>
            <div className="text-label text-ds-gray-400">Total presupuestado</div>
            <div className="font-semibold text-ds-ink">{formatCRC(totalGeneral)}</div>
          </div>
        </div>
      </div>

      <Table<Resumen>
        columns={[
          { key: 'works_no', header: 'Obra', className: 'font-mono font-semibold', render: (r) => r.works_no },
          { key: 'version_code', header: 'Versión', render: (r) => r.version_code },
          { key: 'fecha_carga', header: 'Cargado', render: (r) => fmtFecha(r.fecha_carga) },
          {
            key: 'total_costo',
            header: 'Total costo directo',
            className: 'text-right',
            render: (r) => <span className="font-semibold">{formatCRC(r.total_costo)}</span>,
          },
        ]}
        data={vigentes}
        keyField="works_no"
        loading={loading}
        emptyMessage="Sin presupuestos cargados."
        onRowClick={(r) => abrirDetalle(r.works_no)}
      />

      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle ? `Presupuesto · ${detalle.works_no}` : 'Presupuesto'}
        size="xl"
      >
        {detalle && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6 text-body-sm">
              <div>
                <div className="text-label text-ds-gray-400">Versión</div>
                <div className="font-semibold text-ds-ink">{detalle.version_code}</div>
              </div>
              <div>
                <div className="text-label text-ds-gray-400">Cargado</div>
                <div className="font-semibold text-ds-ink">{fmtFecha(detalle.fecha_carga)}</div>
              </div>
              <div>
                <div className="text-label text-ds-gray-400">Total costo directo</div>
                <div className="font-semibold text-ds-ink">{formatCRC(detalle.total_costo)}</div>
              </div>
            </div>

            {detalle.grupos.length > 0 && (
              <div>
                <h3 className="mb-2 text-label uppercase tracking-wide text-ds-gray-500">Por grupo</h3>
                <div className="overflow-hidden rounded-ds-lg border border-ds-gray-200">
                  <table className="w-full text-body-sm">
                    <tbody>
                      {detalle.grupos.map((g) => (
                        <tr key={g.task_no} className="border-b border-ds-gray-100 last:border-0">
                          <td className="px-3 py-2 font-mono text-ds-gray-500">{g.task_no}</td>
                          <td className="px-3 py-2 text-ds-ink">{g.descripcion}</td>
                          <td className="px-3 py-2 text-right text-ds-gray-400">{g.peso_pct.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right font-semibold text-ds-ink">{formatCRC(g.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-label uppercase tracking-wide text-ds-gray-500">Por partida</h3>
              <div className="max-h-[45vh] overflow-y-auto rounded-ds-lg border border-ds-gray-200">
                <table className="w-full text-body-sm">
                  <thead className="sticky top-0 bg-ds-gray-100 text-label uppercase tracking-wide text-ds-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Partida</th>
                      <th className="px-3 py-2 text-left">Descripción</th>
                      <th className="px-3 py-2 text-right">Cant.</th>
                      <th className="px-3 py-2 text-right">P. unitario</th>
                      <th className="px-3 py-2 text-right">Peso</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.partidas.map((p) => (
                      <tr key={p.task_no} className="border-b border-ds-gray-100 last:border-0">
                        <td className="px-3 py-2 font-mono text-ds-gray-500">{p.task_no}</td>
                        <td className="px-3 py-2 text-ds-ink">{p.descripcion}</td>
                        <td className="px-3 py-2 text-right text-ds-ink">{p.cantidad.toLocaleString('es-CR')}{p.unidad ? ` ${p.unidad}` : ''}</td>
                        <td className="px-3 py-2 text-right text-ds-ink">{formatCRC(p.precio_unitario)}</td>
                        <td className="px-3 py-2 text-right text-ds-gray-400">{p.peso_pct.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right font-semibold text-ds-ink">{formatCRC(p.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {cargandoDet && <p className="text-body-sm text-ds-gray-400">Cargando detalle de {cargandoDet}…</p>}
    </PageShell>
  );
}
