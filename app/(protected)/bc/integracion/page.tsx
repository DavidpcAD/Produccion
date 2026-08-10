'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { formatCRC } from '@/lib/utilidades/format';

interface ResumenObra {
  obra: string;
  estado: 'en_ejecucion' | 'en_espera' | 'finalizada';
  monto_registrado: number;
  monto_a_registrar: number;
  n_cambios: number;
  ya_registrado: boolean;
  produccion_inicializada: boolean;
}
interface Resumen {
  registrar_disponible: boolean;
  obras: ResumenObra[];
  total_registrado: number;
  total_a_registrar: number;
}

type Col = 'obra' | 'registrado' | 'a_registrar';

// Estado de REGISTRO de la obra (el que pinta la columna "Estado"), para filtrar.
type EstadoReg = 'por_reportar' | 'al_dia' | 'sin_inicializar';
function estadoReg(o: ResumenObra): EstadoReg {
  if (!o.produccion_inicializada) return 'sin_inicializar';
  if (o.ya_registrado) return 'al_dia';
  return 'por_reportar';
}
const ESTADOS_REG: { key: EstadoReg | 'todas'; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'por_reportar', label: 'Por reportar' },
  { key: 'al_dia', label: 'Al día' },
  { key: 'sin_inicializar', label: 'Sin inicializar' },
];

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function IntegracionBcPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [fecha, setFecha] = useState(hoyISO());
  const [filtro, setFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoReg | 'todas'>('todas');
  const [orden, setOrden] = useState<{ col: Col; dir: 1 | -1 }>({ col: 'a_registrar', dir: -1 });
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/bc/resumen', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar');
      setResumen(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      toast(e instanceof Error ? e.message : 'Error al cargar', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas = useMemo(() => {
    let arr = resumen?.obras ?? [];
    const f = filtro.trim().toLowerCase();
    if (f) arr = arr.filter((o) => o.obra.toLowerCase().includes(f));
    if (estadoFiltro !== 'todas') arr = arr.filter((o) => estadoReg(o) === estadoFiltro);
    const { col, dir } = orden;
    return [...arr].sort((a, b) => {
      if (col === 'obra') return a.obra.localeCompare(b.obra, 'es', { numeric: true }) * dir;
      const va = col === 'registrado' ? a.monto_registrado : a.monto_a_registrar;
      const vb = col === 'registrado' ? b.monto_registrado : b.monto_a_registrar;
      return (va - vb) * dir;
    });
  }, [resumen, filtro, estadoFiltro, orden]);

  // Conteo por estado de registro (sobre todas las obras, para los chips).
  const conteosEstado = useMemo(() => {
    const c: Record<EstadoReg, number> = { por_reportar: 0, al_dia: 0, sin_inicializar: 0 };
    for (const o of resumen?.obras ?? []) c[estadoReg(o)]++;
    return c;
  }, [resumen]);

  function ordenar(col: Col) {
    setOrden((o) => (o.col === col ? { col, dir: o.dir === 1 ? -1 : 1 } : { col, dir: 1 }));
  }

  const totReg = filas.reduce((s, o) => s + o.monto_registrado, 0);
  const totAReg = filas.reduce((s, o) => s + o.monto_a_registrar, 0);

  const irDetalle = (obra: string) =>
    router.push(`/bc/integracion/${encodeURIComponent(obra)}?fecha=${fecha}`);

  return (
    <PageShell>
      <PageHeader
        title="Integración Business Central"
        subtitle="Elegí la fecha de registro y trabajá las obras: ver monto registrado, monto a registrar y el detalle por partida."
      />

      <div className="flex flex-wrap items-end gap-4 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
        <div className="w-44">
          <Input label="Fecha de registro" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="w-48">
          <Input label="Filtrar obra" placeholder="Ej. VN-K" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
      </div>

      {/* Filtro por estado de registro */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ESTADOS_REG.map((e) => {
          const activo = estadoFiltro === e.key;
          const count = e.key === 'todas' ? (resumen?.obras.length ?? 0) : conteosEstado[e.key];
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => setEstadoFiltro(e.key)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                activo
                  ? 'border-brand bg-brand/15 text-ds-green-ink'
                  : 'border-ds-gray-200 bg-ds-surface text-ds-gray-400 hover:border-ds-gray-400 hover:text-black'
              }`}
            >
              {e.label}
              <span className="ml-1 tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {error && !loading && (
        <p className="text-body-sm text-ds-red">{error}</p>
      )}

      <div className="flex flex-wrap gap-6 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
        <div>
          <div className="text-label text-ds-gray-400">Obras</div>
          <div className="font-semibold text-ds-ink">{loading ? '—' : filas.length}</div>
        </div>
        <div>
          <div className="text-label text-ds-gray-400">Total registrado</div>
          <div className="font-semibold text-ds-ink">{formatCRC(totReg)}</div>
        </div>
        <div>
          <div className="text-label text-ds-gray-400">Total a registrar</div>
          <div className="font-semibold text-ds-yellow-ink">{formatCRC(totAReg)}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b border-ds-gray-200 bg-ds-gray-100 text-label uppercase tracking-wide text-ds-gray-500">
              <th className="px-4 py-3 text-left">
                <button type="button" onClick={() => ordenar('obra')} className="inline-flex items-center gap-1">
                  Obra <Icon name="filter" size="sm" color="currentColor" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button type="button" onClick={() => ordenar('registrado')} className="inline-flex items-center gap-1">
                  Monto Registrado <Icon name="filter" size="sm" color="currentColor" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button type="button" onClick={() => ordenar('a_registrar')} className="inline-flex items-center gap-1">
                  Monto a Registrar <Icon name="filter" size="sm" color="currentColor" />
                </button>
              </th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-ds-gray-100">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded-ds bg-ds-gray-100" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center text-ds-gray-400">Sin obras.</td>
              </tr>
            ) : (
              filas.map((o) => (
                <tr
                  key={o.obra}
                  onClick={() => irDetalle(o.obra)}
                  className="cursor-pointer border-b border-ds-gray-100 last:border-0 hover:bg-ds-gray-100"
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 font-mono text-body-sm font-semibold text-ds-ink">
                      {o.obra}
                      {o.estado === 'finalizada' && (
                        <span className="rounded-ds bg-ds-green-soft px-1.5 py-0.5 text-[10px] font-medium text-ds-green-ink">Terminada</span>
                      )}
                      {o.estado === 'en_espera' && (
                        <span className="rounded-ds bg-ds-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-ds-gray-500">Congelada</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-ds-ink">{formatCRC(o.monto_registrado)}</td>
                  <td className={`px-4 py-3 text-right ${o.monto_a_registrar > 0 ? 'font-semibold text-ds-yellow-ink' : 'text-ds-gray-400'}`}>
                    {o.monto_a_registrar > 0 ? formatCRC(o.monto_a_registrar) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-body-sm">
                    {!o.produccion_inicializada ? (
                      <span className="text-ds-red">Sin inicializar</span>
                    ) : o.ya_registrado ? (
                      <span className="text-ds-green-ink">Al día</span>
                    ) : (
                      <span className="text-ds-yellow-ink">{o.n_cambios} x reportar</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-body-sm font-medium text-ds-gray-500">
                      Detalle <Icon name="arrow-right" size="sm" color="currentColor" />
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
