'use client';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, MagnifyingGlass, Check } from '@phosphor-icons/react';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

export type ComboWeight = 'bold' | 'normal' | 'light';

export interface ComboOption {
  value: string;
  /** Texto plano: se muestra cuando no hay `parts` y se usa para buscar. */
  label: string;
  /** Render jerárquico (ej: Distrito negrita · Cantón normal · Provincia light). */
  parts?: { text: string; weight?: ComboWeight }[];
  /** Texto extra para el filtro (además de label). */
  search?: string;
}

interface ComboboxProps {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  /** Modo multi-selección: usa `values` + `onValuesChange` en vez de value/onChange. */
  multiple?: boolean;
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  options: ComboOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Texto cuando el filtro no encuentra nada. */
  emptyText?: string;
}

const weightClass: Record<ComboWeight, string> = {
  bold: 'font-bold text-ds-ink',
  normal: 'font-normal text-ds-gray-500',
  light: 'font-light text-ds-gray-400',
};

function OptionLabel({ opt }: { opt: ComboOption }) {
  if (!opt.parts?.length) return <span className="text-ds-ink">{opt.label}</span>;
  return (
    <span className="truncate">
      {opt.parts.map((p, i) => (
        <span key={i} className={weightClass[p.weight ?? 'normal']}>
          {i > 0 && <span className="text-ds-gray-300 font-light"> · </span>}
          {p.text}
        </span>
      ))}
    </span>
  );
}

export function Combobox({
  label, value = '', onChange, multiple, values = [], onValuesChange,
  options, placeholder = 'Seleccionar…',
  required, disabled, emptyText = 'Sin resultados',
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Posición del panel (portal). Se recalcula al abrir y en scroll/resize.
  const [coords, setCoords] = useState<{ left: number; width: number; top: number; bottomAnchor: number; openUp: boolean; maxH: number } | null>(null);
  const updateCoords = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxH = Math.min(320, Math.max(160, openUp ? spaceAbove - gap : spaceBelow - gap));
    setCoords({ left: r.left, width: r.width, top: r.bottom + gap, bottomAnchor: window.innerHeight - r.top + gap, openUp, maxH });
  }, []);

  const selected = useMemo(() => options.find(o => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return options;
    // Busca por palabras: "tubo 3\"" encuentra «TUBO PVC … 3"». Ver lib/utilidades/buscar.
    return options.filter(o => coincideBusqueda(`${o.label} ${o.search ?? ''}`, q));
  }, [options, query]);

  // Cerrar al hacer click fuera (contempla el panel en portal)
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Posicionar el panel (portal) y seguir el scroll/resize del modal.
  useEffect(() => {
    if (!open) return;
    updateCoords();
    const handler = () => updateCoords();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [open, updateCoords]);

  // Al abrir: foco en el buscador y resaltar el seleccionado
  useEffect(() => {
    if (open) {
      setQuery('');
      const idx = Math.max(0, filtered.findIndex(o => o.value === value));
      setHighlight(idx);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Mantener el resaltado dentro del rango al filtrar
  useEffect(() => { setHighlight(0); }, [query]);

  function choose(opt: ComboOption) {
    if (multiple) {
      const next = values.includes(opt.value)
        ? values.filter(v => v !== opt.value)
        : [...values, opt.value];
      onValuesChange?.(next);
      return; // no cerrar: se pueden marcar varios
    }
    onChange?.(opt.value);
    setOpen(false);
  }

  // Texto del botón en modo multi (labels de los seleccionados).
  const multiLabel = multiple
    ? values.map(v => options.find(o => o.value === v)?.label ?? v).join(', ')
    : '';

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) choose(filtered[highlight]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  // Auto-scroll del item resaltado
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const labelId = label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5" ref={wrapRef}>
      {label && (
        <label htmlFor={labelId} className="text-sm font-medium text-ds-ink">
          {label}{required && <span className="text-ds-red ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          id={labelId}
          ref={btnRef}
          disabled={disabled}
          onClick={() => !disabled && setOpen(o => !o)}
          className={`
            w-full h-12 rounded-ds-xl bg-ds-surface text-body-sm pl-5 pr-10 text-left transition-all duration-150
            flex items-center border-2 shadow-ds-01
            focus:outline-none focus:border-black focus:shadow-none
            disabled:bg-ds-gray-100 disabled:cursor-not-allowed disabled:border-transparent disabled:shadow-none
            ${open ? 'border-black shadow-none' : 'border-transparent'}
          `}
        >
          {multiple
            ? (values.length
                ? <span className="truncate text-ds-ink">{multiLabel}</span>
                : <span className="text-ds-gray-300">{placeholder}</span>)
            : (selected
                ? <OptionLabel opt={selected} />
                : <span className="text-ds-gray-300">{placeholder}</span>)}
          <CaretDown
            size={16} weight="bold"
            className={`absolute right-4 top-1/2 -translate-y-1/2 text-ds-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && coords && createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: coords.left,
              width: coords.width,
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? coords.bottomAnchor : undefined,
            }}
            className="z-[100] rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-03 overflow-hidden animate-fade-in"
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-ds-gray-100">
              <MagnifyingGlass size={15} weight="bold" className="text-ds-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar…"
                className="w-full text-body-sm text-ds-ink placeholder-ds-gray-300 focus:outline-none bg-transparent"
              />
            </div>
            <div ref={listRef} style={{ maxHeight: coords.maxH }} className="overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-sm text-ds-gray-400 text-center">{emptyText}</p>
              ) : filtered.map((opt, i) => (
                <button
                  key={opt.value}
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(opt)}
                  className={`
                    w-full text-left px-3 py-2 text-body-sm flex items-center gap-2 transition-colors
                    ${i === highlight ? 'bg-ds-gray-100' : 'hover:bg-ds-gray-100/60'}
                  `}
                >
                  <span className="flex-1 min-w-0"><OptionLabel opt={opt} /></span>
                  {(multiple ? values.includes(opt.value) : opt.value === value) && <Check size={15} weight="bold" className="text-brand shrink-0" />}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}
