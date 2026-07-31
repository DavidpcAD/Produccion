'use client';

// Grupo de filtros tipo "pill" segmentado, replicando los chips del módulo
// Avance (rounded-full, activo negro). Fuente única de estilo para que todos
// los filtros de Concreto se vean idénticos entre sí y con el resto del app.

export interface PillOption {
  value: string;
  label: string;
  /** Contador opcional a la derecha de la etiqueta (ej. "Todas 9"). */
  count?: number;
}

export function Pills({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: PillOption[];
  /** Etiqueta corta a la izquierda del grupo (ej. "Estado"). */
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wide text-ds-gray-400 mr-1">
          {label}
        </span>
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
              active ? 'bg-black text-white shadow-ds-01' : 'bg-ds-gray-100 text-ds-gray-500 hover:text-black'
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`text-xs tabular-nums ${active ? 'text-white/60' : 'text-ds-gray-400'}`}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
