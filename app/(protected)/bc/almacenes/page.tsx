'use client';
/* eslint-disable react-hooks/set-state-in-effect -- carga al montar: el setState va tras el fetch. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

// Business Central → Almacenes (solo Super Admin). El lugar donde se dice qué
// almacén es REAL (una bodega física) y cuál es VIRTUAL. BC tiene un campo para eso
// ("Tipo almacén") pero viene casi todo vacío, así que la marca se lleva acá.
//
// Para qué sirve hoy: SOLO los marcados Físico salen al elegir almacén en el Nuevo
// pedido (ALM y Stock). Virtual y Sin marcar no salen; Virtual queda como dato.
// Hoy son tres: ALM-GRAL, ALM-BAR y F-MADERAS (migración 2026-11-04_almacen_fisicos).

type Clase = 'real' | 'virtual';
interface AlmacenFila {
  codigo: string; nombre: string; tipoBC: string | null;
  clase: Clase | null; actualizadoPor: string | null; actualizadoEn: string | null;
}
type Filtro = 'real' | 'virtual' | 'sin' | 'todos';

const FILTROS: { v: Filtro; label: string }[] = [
  { v: 'real', label: 'Físicos' },
  { v: 'virtual', label: 'Virtuales' },
  { v: 'sin', label: 'Sin marcar' },
  { v: 'todos', label: 'Todos' },
];
const OPCIONES: { v: Clase | null; label: string }[] = [
  { v: 'real', label: 'Físico' },
  { v: 'virtual', label: 'Virtual' },
  { v: null, label: 'Sin marcar' },
];

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

export default function AlmacenesPage() {
  const { toast } = useToast();
  const [almacenes, setAlmacenes] = useState<AlmacenFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('real');
  const [q, setQ] = useState('');
  const [guardando, setGuardando] = useState<Set<string>>(new Set());
  // Los que se marcaron en este filtro se quedan a la vista aunque ya no calcen
  // (desmarcar uno estando en "Físicos" no lo hace desaparecer de golpe, y se
  // puede deshacer ahí mismo). Se limpia al cambiar de filtro.
  const [tocados, setTocados] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    setLoading(true);
    setFallo(false);
    setTocados(new Set());
    try {
      const r = await fetch('/api/bc/almacenes', { cache: 'no-store' });
      const d = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(d?.almacenes)) { setFallo(true); return; }
      setAlmacenes(d.almacenes);
    } catch {
      setFallo(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const conteo = useMemo(() => ({
    real: almacenes.filter(a => a.clase === 'real').length,
    virtual: almacenes.filter(a => a.clase === 'virtual').length,
    sin: almacenes.filter(a => a.clase === null).length,
    todos: almacenes.length,
  }), [almacenes]);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return almacenes.filter(a => {
      const fijo = tocados.has(a.codigo);
      if (!fijo && filtro === 'real' && a.clase !== 'real') return false;
      if (!fijo && filtro === 'virtual' && a.clase !== 'virtual') return false;
      if (!fijo && filtro === 'sin' && a.clase !== null) return false;
      return !term || coincideBusqueda(`${a.codigo} ${a.nombre}`, term);
    });
  }, [almacenes, filtro, q, tocados]);

  async function marcar(a: AlmacenFila, clase: Clase | null) {
    if (a.clase === clase || guardando.has(a.codigo)) return;
    const previa = a.clase;
    // Se pinta ya; si el servidor dice que no, se vuelve atrás.
    setAlmacenes(lista => lista.map(x => (x.codigo === a.codigo ? { ...x, clase } : x)));
    setTocados(s => new Set(s).add(a.codigo));
    setGuardando(s => new Set(s).add(a.codigo));
    try {
      const r = await fetch('/api/bc/almacenes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: a.codigo, clase }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      setAlmacenes(lista => lista.map(x => (x.codigo === a.codigo
        ? { ...x, actualizadoPor: d.actualizadoPor ?? null, actualizadoEn: d.actualizadoEn ?? null }
        : x)));
      toast(
        clase === 'real'
          ? `${a.codigo} es físico: ya sale al pedir material`
          : `${a.codigo} ${clase === 'virtual' ? 'marcado virtual' : 'sin marcar'}: no sale al pedir material`,
        'success',
      );
    } catch (e) {
      setAlmacenes(lista => lista.map(x => (x.codigo === a.codigo ? { ...x, clase: previa } : x)));
      toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setGuardando(s => { const n = new Set(s); n.delete(a.codigo); return n; });
    }
  }

  const subtitulo = loading && almacenes.length === 0
    ? 'Cargando almacenes de Business Central…'
    : `${conteo.todos} almacenes · ${conteo.real} físicos · ${conteo.virtual} virtuales · ${conteo.sin} sin marcar`;

  return (
    <PageShell>
      <PageHeader
        title="Almacenes"
        subtitle={subtitulo}
        actions={
          <Button variant="ghost" size="sm" onClick={cargar} loading={loading}
            icon={<Icon name="traslado" size="sm" color="currentColor" />}>
            Actualizar
          </Button>
        }
      />

      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
        <div className="px-4 pt-3 pb-3 border-b border-ds-gray-200 space-y-3">
          <p className="text-body-sm text-ds-gray-500 max-w-3xl">
            Marcá cuáles almacenes son <span className="font-semibold text-ds-ink">físicos</span> (una bodega de verdad) y
            cuáles son <span className="font-semibold text-ds-ink">virtuales</span>. Al pedir material a un almacén
            (<span className="font-semibold text-ds-ink">Nuevo pedido</span> con ALM o Stock) salen solo los físicos.
            Los virtuales y los que no estén marcados no salen.
          </p>

          <div className="flex flex-wrap items-center gap-1">
            {FILTROS.map(f => {
              const activo = filtro === f.v;
              return (
                <button key={f.v} type="button" onClick={() => { setFiltro(f.v); setTocados(new Set()); }} aria-pressed={activo}
                  className={'inline-flex items-center gap-1.5 rounded-ds px-3 py-1.5 text-label font-semibold transition-colors '
                    + (activo ? 'bg-black text-white' : 'text-ds-gray-500 hover:bg-ds-gray-100 hover:text-ds-ink')}>
                  {f.label}
                  <span className={'text-body-sm font-normal ' + (activo ? 'text-white/70' : 'text-ds-gray-400')}>{conteo[f.v]}</span>
                </button>
              );
            })}
          </div>

          <Input placeholder="Buscar por código o nombre…" value={q} onChange={e => setQ(e.target.value)} />
        </div>

        {loading && almacenes.length === 0 ? (
          <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : fallo && almacenes.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-ds-ink font-semibold">No se pudieron cargar los almacenes.</p>
            <p className="text-body-sm text-ds-gray-400 mt-1 mb-4 max-w-md mx-auto">
              Business Central o el servidor no respondieron. Si tu sesión venció, entrá de nuevo; si no, reintentá.
            </p>
            <Button variant="ghost" onClick={cargar}>Reintentar</Button>
          </div>
        ) : visibles.length === 0 ? (
          <div className="p-10 text-center text-ds-gray-400 text-label">
            {q.trim() ? `Ningún almacén coincide con “${q.trim()}”.` : 'No hay almacenes en este filtro.'}
          </div>
        ) : (
          <ul>
            {visibles.map(a => {
              const ocupado = guardando.has(a.codigo);
              return (
                <li key={a.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 border-b border-ds-gray-100 last:border-b-0">
                  <span className="font-mono text-body-sm font-semibold text-ds-ink shrink-0 min-w-[96px]">{a.codigo}</span>
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-sm text-ds-ink break-words">{a.nombre || a.codigo}</div>
                    <div className="text-[11px] text-ds-gray-400">
                      {a.clase === null
                        ? 'Sin marcar · no sale al pedir material'
                        : `Marcado${a.actualizadoPor ? ` por ${a.actualizadoPor}` : ''}${a.actualizadoEn ? ` el ${fecha(a.actualizadoEn)}` : ''}`}
                      {a.tipoBC ? ` · en BC: ${a.tipoBC}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center rounded-ds border border-ds-gray-200 p-0.5 shrink-0" role="group" aria-label={`Clase de ${a.codigo}`}>
                    {OPCIONES.map(o => {
                      const activo = a.clase === o.v;
                      return (
                        <button key={o.label} type="button" disabled={ocupado} aria-pressed={activo}
                          onClick={() => marcar(a, o.v)}
                          className={'rounded-ds px-2.5 py-1 text-label font-semibold transition-colors '
                            + (activo ? 'bg-black text-white' : 'text-ds-gray-500 hover:bg-ds-gray-100 hover:text-ds-ink')
                            + (ocupado ? ' cursor-wait' : '')}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
