"use client";

// NOT-IN-DS: builder de líneas para una solicitud de materiales (material +
// cantidad + unidad). Mismo motivo que RepuestosUsadosBox: QuantitySelector
// del DS es "tocar para ciclar un estado visual", no "escribir cuántas
// unidades hacen falta" — acá se necesita lo segundo, así que se compone con
// FormSelect/FormField/Button en su lugar.
//
// Si el repuesto elegido existe en el catálogo del equipo, la unidad se
// autocompleta desde ahí (litro, galón, unidad, etc. — ver Repuestos.unidad).
// Si no está en catálogo, "Otro material" deja escribir el nombre y elegir
// la unidad a mano.

import { useState } from "react";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormField } from "@/components/mantenimiento/ds/Form/Form";
import { FormSelect } from "@/components/mantenimiento/local/FormExtras";
import type { Repuesto, SolicitudItem } from "@/lib/mantenimiento/types";

const UNIDADES = ["unidad", "litro", "galón", "kilo", "metro", "caja", "juego", "par"];

export function SolicitudLineasBox({
  lineas,
  repuestosDisponibles,
  onAdd,
  onRemove
}: {
  lineas: SolicitudItem[];
  repuestosDisponibles: Repuesto[];
  onAdd: (linea: SolicitudItem) => void;
  onRemove: (indice: number) => void;
}) {
  const [repuestoId, setRepuestoId] = useState("");
  const [nombreLibre, setNombreLibre] = useState("");
  const [unidad, setUnidad] = useState("unidad");
  const [cantidad, setCantidad] = useState("1");

  const esOtro = repuestoId === "__otro__";

  function agregar() {
    const cant = Number(cantidad);
    if (!Number.isFinite(cant) || cant <= 0) return;

    if (esOtro) {
      if (!nombreLibre.trim()) return;
      onAdd({ repuestoId: null, nombre: nombreLibre.trim(), cantidad: cant, unidad });
    } else {
      const repuesto = repuestosDisponibles.find((r) => r.id === repuestoId);
      if (!repuesto) return;
      onAdd({ repuestoId: repuesto.id, nombre: repuesto.nombre, cantidad: cant, unidad: repuesto.unidad || "unidad" });
    }
    setRepuestoId("");
    setNombreLibre("");
    setUnidad("unidad");
    setCantidad("1");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
      {lineas.length === 0 && <div style={{ color: "var(--ds-color-gray-400)" }}>Todavía no agregaste materiales.</div>}
      {lineas.map((l, i) => (
        <div
          key={i}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--ds-space-3)", background: "var(--ds-color-gray-100)", borderRadius: "var(--ds-radius-md)" }}
        >
          <span>
            {l.nombre} — {l.cantidad} {l.unidad}
          </span>
          <Button ariaLabel="Quitar línea" layout="icon" size="sm" color="white" icon="delete" onClick={() => onRemove(i)} />
        </div>
      ))}

      <div style={{ display: "flex", gap: "var(--ds-space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <FormSelect
            label="Material"
            value={repuestoId}
            onChange={(e) => setRepuestoId(e.target.value)}
            placeholder="Seleccioná un material"
            options={[...repuestosDisponibles.map((r) => ({ value: r.id, label: `${r.nombre} (${r.unidad || "unidad"})` })), { value: "__otro__", label: "Otro material (escribir)" }]}
          />
        </div>
        {esOtro && (
          <>
            <div style={{ flex: 1, minWidth: 180 }}>
              <FormField label="Nombre del material" value={nombreLibre} onChange={(e) => setNombreLibre(e.target.value)} />
            </div>
            <div style={{ width: 140 }}>
              <FormSelect label="Unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} options={UNIDADES.map((u) => ({ value: u, label: u }))} />
            </div>
          </>
        )}
        <div style={{ width: 100 }}>
          <FormField label="Cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </div>
        <Button label="Agregar" color="black" onClick={agregar} />
      </div>
    </div>
  );
}
