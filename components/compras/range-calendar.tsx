"use client";

import { useState } from "react";

// Calendario de RANGO estilo Airbnb para el filtro de fecha: se elige el día de
// inicio y luego el de fin; el rango queda resaltado. Devuelve { from, to } en ISO
// "solo día" (YYYY-MM-DD), sin conversión de zona horaria.
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DOW = ["L", "Ma", "Mi", "J", "V", "S", "D"];
const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s?: string) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

export function RangeCalendar({ from, to, onChange }: {
  from?: string; to?: string; onChange: (r: { from?: string; to?: string }) => void;
}) {
  const inicial = fromISO(from) ?? new Date();
  const [view, setView] = useState({ y: inicial.getFullYear(), m: inicial.getMonth() });
  const hoyISO = toISO(new Date());

  const startOffset = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // lunes primero
  const diasMes = new Date(view.y, view.m + 1, 0).getDate();
  const celdas: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) celdas.push(null);
  for (let d = 1; d <= diasMes; d++) celdas.push(d);

  const pick = (d: number) => {
    const iso = toISO(new Date(view.y, view.m, d));
    if (!from || (from && to)) { onChange({ from: iso, to: undefined }); return; } // arranca rango
    if (iso < from) { onChange({ from: iso, to: undefined }); return; }             // reinicia si es antes
    onChange({ from, to: iso });                                                    // cierra rango
  };
  const move = (delta: number) => setView((v) => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div className="rc">
      <div className="rc__head">
        <button type="button" className="rc__nav" onClick={() => move(-1)} aria-label="Mes anterior">‹</button>
        <span className="rc__title">{MESES[view.m]} {view.y}</span>
        <button type="button" className="rc__nav" onClick={() => move(1)} aria-label="Mes siguiente">›</button>
      </div>
      <div className="rc__grid rc__dow">{DOW.map((d) => <span key={d} className="rc__dowcell">{d}</span>)}</div>
      <div className="rc__grid">
        {celdas.map((d, i) => {
          if (d == null) return <span key={`e${i}`} className="rc__cell rc__cell--empty" />;
          const iso = toISO(new Date(view.y, view.m, d));
          const isFrom = from === iso, isTo = to === iso;
          const inRange = !!from && !!to && iso > from && iso < to;
          const cls = ["rc__cell",
            isFrom ? "is-from" : "", isTo ? "is-to" : "", inRange ? "is-in" : "",
            isFrom && !to ? "is-single" : "", iso === hoyISO ? "is-today" : ""].filter(Boolean).join(" ");
          return <button type="button" key={iso} className={cls} onClick={() => pick(d)}>{d}</button>;
        })}
      </div>
    </div>
  );
}
