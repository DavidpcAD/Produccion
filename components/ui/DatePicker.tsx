'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';

interface DatePickerProps {
  label?: string;
  value?: string;              // formato 'YYYY-MM-DD' (o '')
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
  placeholder?: string;
}

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const pad = (n: number) => String(n).padStart(2, '0');
const parse = (v?: string) => {
  const m = v && /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null;
};

export function DatePicker({
  label, value = '', onChange, required, disabled, hint, error, placeholder = 'dd/mm/aaaa',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parse(value);
  const today = new Date();
  const [view, setView] = useState(() =>
    parsed ? { y: parsed.y, mo: parsed.mo } : { y: today.getFullYear(), mo: today.getMonth() });

  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; bottomAnchor: number; openUp: boolean } | null>(null);

  const updateCoords = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const panelH = 360;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const openUp = spaceBelow < panelH && r.top - 8 > spaceBelow;
    setCoords({ left: r.left, top: r.bottom + gap, bottomAnchor: window.innerHeight - r.top + gap, openUp });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (parsed) setView({ y: parsed.y, mo: parsed.mo });
    updateCoords();
    const h = () => updateCoords();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, updateCoords]);

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

  const labelId = label?.toLowerCase().replace(/\s+/g, '-');
  const display = parsed ? `${pad(parsed.d)}/${pad(parsed.mo + 1)}/${parsed.y}` : '';

  function pick(y: number, mo: number, d: number) {
    onChange(`${y}-${pad(mo + 1)}-${pad(d)}`);
    setOpen(false);
  }
  function shift(delta: number) {
    setView(v => {
      const dt = new Date(v.y, v.mo + delta, 1);
      return { y: dt.getFullYear(), mo: dt.getMonth() };
    });
  }

  // Rejilla de 42 celdas empezando el lunes (incluye días del mes anterior/siguiente en gris).
  const firstOffset = (new Date(view.y, view.mo, 1).getDay() + 6) % 7;
  const start = new Date(view.y, view.mo, 1 - firstOffset);
  const cells: { y: number; mo: number; d: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);
    cells.push({ y: dt.getFullYear(), mo: dt.getMonth(), d: dt.getDate(), inMonth: dt.getMonth() === view.mo });
  }
  const monthLabel = new Date(view.y, view.mo, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const isToday = (c: { y: number; mo: number; d: number }) =>
    c.y === today.getFullYear() && c.mo === today.getMonth() && c.d === today.getDate();
  const isSel = (c: { y: number; mo: number; d: number }) =>
    !!parsed && c.y === parsed.y && c.mo === parsed.mo && c.d === parsed.d;

  return (
    <div className="flex flex-col gap-1.5" ref={wrapRef}>
      {label && (
        <label htmlFor={labelId} className="text-sm font-medium text-black">
          {label}{required && <span className="text-ds-red ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button" id={labelId} ref={btnRef} disabled={disabled}
          onClick={() => !disabled && setOpen(o => !o)}
          className={`
            w-full h-12 rounded-ds-xl bg-white text-body-sm pl-5 pr-11 text-left transition-all duration-150
            flex items-center border-2 shadow-ds-01
            focus:outline-none focus:border-black focus:shadow-none
            disabled:bg-ds-gray-100 disabled:cursor-not-allowed disabled:border-transparent disabled:shadow-none
            ${open ? 'border-black shadow-none' : error ? 'border-ds-red' : 'border-transparent'}
          `}
        >
          {display ? <span className="text-black">{display}</span> : <span className="text-ds-gray-300">{placeholder}</span>}
          <CalendarBlank size={18} weight="bold" className="absolute right-4 top-1/2 -translate-y-1/2 text-ds-gray-400" />
        </button>

        {open && coords && createPortal(
          <div
            ref={panelRef}
            style={{
              position: 'fixed', left: coords.left,
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? coords.bottomAnchor : undefined,
            }}
            className="z-[100] w-[300px] rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-03 p-3 animate-fade-in"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-black capitalize">{monthLabel}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => shift(-1)} aria-label="Mes anterior"
                  className="p-1.5 rounded-ds text-ds-gray-400 hover:text-black hover:bg-ds-gray-100 transition-colors">
                  <CaretLeft size={16} weight="bold" />
                </button>
                <button type="button" onClick={() => shift(1)} aria-label="Mes siguiente"
                  className="p-1.5 rounded-ds text-ds-gray-400 hover:text-black hover:bg-ds-gray-100 transition-colors">
                  <CaretRight size={16} weight="bold" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {DIAS.map((d, i) => (
                <div key={i} className="h-8 flex items-center justify-center text-xs font-semibold text-ds-gray-400">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((c, i) => {
                const sel = isSel(c);
                const tod = isToday(c);
                return (
                  <button
                    key={i} type="button" onClick={() => pick(c.y, c.mo, c.d)}
                    className={`h-9 rounded-ds text-sm transition-colors flex items-center justify-center ${
                      sel ? 'bg-black text-white font-bold shadow-ds-02'
                        : tod ? 'bg-brand/25 text-black font-bold'
                        : c.inMonth ? 'text-black font-medium hover:bg-ds-gray-100'
                        : 'text-ds-gray-300 hover:bg-ds-gray-100'
                    }`}
                  >
                    {c.d}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-ds-gray-100">
              <button type="button" onClick={() => { onChange(''); setOpen(false); }}
                className="text-xs font-semibold text-ds-gray-400 hover:text-black transition-colors">Borrar</button>
              <button type="button" onClick={() => { const t = new Date(); pick(t.getFullYear(), t.getMonth(), t.getDate()); }}
                className="text-xs font-semibold text-black hover:underline">Hoy</button>
            </div>
          </div>,
          document.body,
        )}
      </div>
      {error && <p className="text-xs text-ds-red font-medium pl-1">{error}</p>}
      {hint && !error && <p className="text-xs text-ds-gray-400 pl-1">{hint}</p>}
    </div>
  );
}
