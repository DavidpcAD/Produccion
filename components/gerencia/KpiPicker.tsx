'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  CATEGORIAS, KPIS, NOMBRE_CATEGORIA, SLOT_NOMBRE,
  type CategoriaId, type Kpi, type SlotSize,
} from './kpis';
import { IconClose } from './icons';

interface Props {
  size: SlotSize;
  /** KPIs que ya están en el tablero (tag "En pantalla"). */
  enTablero: Set<string>;
  /** KPI que ocupa el espacio que se edita (tag "Actual" + botón Quitar), o null. */
  actual: string | null;
  onElegir: (kpiId: string) => void;
  onQuitar?: () => void;
  onCerrar: () => void;
}

type Filtro = 'todos' | CategoriaId;

export function KpiPicker({ size, enTablero, actual, onElegir, onQuitar, onCerrar }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('todos');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar]);

  // Agrupado por categoría, respetando el filtro. useMemo: derivar/filtrar en el
  // cuerpo del componente rompe la memoización del React Compiler.
  const grupos = useMemo(
    () => CATEGORIAS
      .filter((c) => filtro === 'todos' || c.id === filtro)
      .map((c) => ({ cat: c, items: KPIS.filter((k) => k.categoria === c.id) }))
      .filter((g) => g.items.length > 0),
    [filtro],
  );

  const chips: { id: Filtro; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    ...CATEGORIAS.map((c) => ({ id: c.id as Filtro, label: c.nombre })),
  ];

  return (
    <div className="kpi-sheet-backdrop" onClick={onCerrar} role="dialog" aria-modal="true" aria-label="Elegir KPI">
      <div className="kpi-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="kpi-sheet__head">
          <div>
            <h2 className="kpi-display kpi-sheet__title">Elegir KPI</h2>
            <p className="kpi-sheet__hint">Elija qué ver en el {SLOT_NOMBRE[size]}.</p>
          </div>
          <button type="button" className="kpi-sheet__close" onClick={onCerrar} aria-label="Cerrar">
            <IconClose />
          </button>
        </div>

        <div className="kpi-chips">
          {chips.map((c) => (
            <button key={c.id} type="button"
              className={`kpi-chip${filtro === c.id ? ' is-active' : ''}`}
              onClick={() => setFiltro(c.id)}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="kpi-sheet__list">
          {actual && onQuitar && (
            <button type="button" className="kpi-sheet__remove" onClick={onQuitar}>
              Quitar del tablero
            </button>
          )}
          {grupos.map(({ cat, items }) => (
            <div key={cat.id}>
              <div className="kpi-group__title">{NOMBRE_CATEGORIA[cat.id]}</div>
              {items.map((k) => (
                <Fila key={k.id} k={k}
                  tag={k.id === actual ? 'Actual' : enTablero.has(k.id) ? 'En pantalla' : null}
                  esActual={k.id === actual} onElegir={onElegir} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Fila({ k, tag, esActual, onElegir }: { k: Kpi; tag: string | null; esActual: boolean; onElegir: (id: string) => void }) {
  return (
    <button type="button" className={`kpi-row${esActual ? ' is-current' : ''}`} onClick={() => onElegir(k.id)}>
      <span className="kpi-num kpi-row__val">{k.valor}</span>
      <span className="kpi-row__body">
        <span className="kpi-row__name">{k.nombre}</span>
        <span className="kpi-row__meta">{k.unidad} · {k.fuente}</span>
      </span>
      {tag && <span className={`kpi-row__badge${esActual ? ' is-actual' : ''}`}>{tag}</span>}
    </button>
  );
}
