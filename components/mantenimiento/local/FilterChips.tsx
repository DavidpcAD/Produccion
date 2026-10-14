"use client";

// NOT-IN-DS: fila de filtros de selección excluyente (ej. estado de un
// equipo, tipo de OT). El DS trae `TabFilterChip`/`FilterBar`, pero su único
// estado "inactivo" es `disabled` (no clickeable) — no sirve para un filtro
// donde todas las opciones deben poder elegirse. En su lugar, esto compone
// `Button` (que sí es clickeable en cualquier color) usando color negro para
// la opción activa y blanco para las demás — sigue la regla del DS de que
// todo elemento tocable pasa por Button.

import { Button } from "@/components/mantenimiento/ds/Button/Button";

export interface FilterChipOption {
  value: string;
  label: string;
}

export function FilterChips({ options, value, onChange }: { options: FilterChipOption[]; value: string; onChange: (value: string) => void }) {
  return (
    <div style={{ display: "flex", gap: "var(--ds-space-2)", flexWrap: "wrap" }}>
      {options.map((opt) => (
        <Button key={opt.value} label={opt.label} size="sm" color={value === opt.value ? "black" : "white"} onClick={() => onChange(opt.value)} />
      ))}
    </div>
  );
}
