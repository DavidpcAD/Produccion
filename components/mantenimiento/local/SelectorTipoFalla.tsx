"use client";

// NOT-IN-DS: select para asignar el tipo de falla de una OT. Guarda al elegir
// (PATCH /api/ots/[id]) — no hay botón aparte. Muestra solo los tipos activos,
// más el que la OT ya tenga aunque después se haya desactivado (así no se
// "pierde" en la pantalla). Sin permiso, muestra el nombre como texto.

import { useState } from "react";
import { useAppStore } from "@/lib/mantenimiento/store";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { nombreTipo } from "@/lib/mantenimiento/fallas";
import type { OrdenTrabajo, TipoFalla } from "@/lib/mantenimiento/types";

export function SelectorTipoFalla({
  ot,
  tipos,
  editable,
  compacto
}: {
  ot: OrdenTrabajo;
  tipos: TipoFalla[];
  editable: boolean;
  /** Versión chica para tablas (sin etiqueta). */
  compacto?: boolean;
}) {
  const { actualizarOt } = useAppStore();
  const toast = useToast();
  const [guardando, setGuardando] = useState(false);

  if (!editable) {
    return <span style={{ color: ot.tipoFallaId ? "var(--ds-text)" : "var(--ds-color-gray-400)" }}>{nombreTipo(ot.tipoFallaId, tipos)}</span>;
  }

  const opciones = tipos.filter((t) => t.activo || t.id === ot.tipoFallaId);

  async function cambiar(valor: string) {
    setGuardando(true);
    try {
      await actualizarOt(ot.id, { tipoFallaId: valor || null });
      toast.exito(valor ? `Clasificada como "${nombreTipo(valor, tipos)}".` : "Quedó sin clasificar.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const select = (
    <select
      className="ds-form-field__input"
      value={ot.tipoFallaId ?? ""}
      disabled={guardando}
      onChange={(e) => cambiar(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Tipo de falla de ${ot.numero}`}
      style={compacto ? { minHeight: 36, padding: "0 var(--ds-space-3)", fontSize: "var(--ds-font-size-label)", width: "100%", maxWidth: 260 } : undefined}
    >
      <option value="">Sin clasificar</option>
      {opciones.map((t) => (
        <option key={t.id} value={t.id}>
          {t.nombre}
          {!t.activo ? " (desactivado)" : ""}
        </option>
      ))}
    </select>
  );

  if (compacto) return select;
  return (
    <div className="ds-form-field ds-form-field--standard">
      <label className="ds-form-field__label">Tipo de falla</label>
      <div className="ds-form-field__input-wrap">{select}</div>
    </div>
  );
}
