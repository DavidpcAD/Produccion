'use client';
import { useState, useEffect } from 'react';
import { Clock } from '@phosphor-icons/react';

interface TimeFieldProps {
  label?: string;
  value: string;            // "HH:MM" (o "HH:MM:SS" / "" al venir de la DB)
  onChange: (v: string) => void; // emite "HH:MM" (o "" si se limpia)
  disabled?: boolean;
}

/** Deja solo HH:MM a partir de un valor cualquiera ("7:5", "07:30:00", …). */
function toHHMM(raw: string): string {
  const m = (raw ?? '').match(/^(\d{1,2}):(\d{1,2})/);
  if (!m) return '';
  const h = Math.min(23, parseInt(m[1], 10));
  const mm = Math.min(59, parseInt(m[2], 10));
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Campo de hora simple y liviano: se escribe con el teclado (ej. "0730" → "07:30")
 * en formato 24h. Evita el date-picker nativo del navegador (feo e incómodo).
 * Mantiene el look del DS (mismo alto, radio y sombra que Input).
 */
export function TimeField({ label, value, onChange, disabled }: TimeFieldProps) {
  const [text, setText] = useState('');

  // Sincroniza el texto visible con el valor externo (normalizado a HH:MM).
  useEffect(() => { setText(toHHMM(value)); }, [value]);

  function formatWhileTyping(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  function handleChange(raw: string) {
    const shown = formatWhileTyping(raw);
    setText(shown);
    if (shown === '') { onChange(''); return; }
    // Emitir solo cuando ya hay HH:MM completo y válido.
    if (/^\d{2}:\d{2}$/.test(shown)) onChange(toHHMM(shown));
  }

  function handleBlur() {
    if (text.trim() === '') { onChange(''); return; }
    const norm = toHHMM(text.length <= 2 ? `${text}:00` : text);
    setText(norm);
    onChange(norm);
  }

  const inputId = label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={inputId} className="text-sm font-medium text-ds-ink">{label}</label>}
      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          placeholder="--:--"
          value={text}
          disabled={disabled}
          onChange={e => handleChange(e.target.value)}
          onBlur={handleBlur}
          className="w-full h-12 rounded-ds-xl bg-ds-surface text-ds-ink placeholder-ds-gray-300 text-body-sm
            font-normal tabular-nums border-2 border-transparent shadow-ds-01 pl-5 pr-11
            transition-all duration-150 focus:outline-none focus:border-black focus:shadow-none
            disabled:bg-ds-gray-100 disabled:text-ds-gray-400 disabled:cursor-not-allowed disabled:border-transparent disabled:shadow-none"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-ds-gray-400">
          <Clock size={18} weight="bold" />
        </div>
      </div>
    </div>
  );
}
