"use client";

// NOT-IN-DS: dos widgets propios del detalle de una Orden de Trabajo.
// - ChecklistBox solo compone CheckBox del DS repetido por cada tarea.
// - RepuestosUsadosBox es un builder de líneas (repuesto + cantidad) con
//   subtotales. El DS trae Card/MaterialList/QuantitySelector, pero esos
//   componentes muestran una cantidad fija y su interacción es "tocar para
//   ciclar un estado visual" (pendiente→incompleto→completo→sin-stock), no
//   "escribir cuántas unidades se usaron" — no calzan con este caso de uso,
//   así que este stub usa FormSelect/FormField/Button en su lugar.

import { useState } from "react";
import { CheckBox, FormField } from "@/components/mantenimiento/ds/Form/Form";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormSelect } from "@/components/mantenimiento/local/FormExtras";
import type { ChecklistItem, RepuestoUsado, Repuesto } from "@/lib/mantenimiento/types";

export function ChecklistBox({
  checklist,
  onToggle,
  readOnly
}: {
  checklist: ChecklistItem[];
  onToggle: (indice: number, hecho: boolean) => void;
  readOnly?: boolean;
}) {
  if (!checklist.length) {
    return <div style={{ color: "var(--ds-color-gray-400)" }}>Sin checklist para esta OT.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)" }}>
      {checklist.map((item, i) => (
        <CheckBox
          key={i}
          label={item.texto}
          checked={item.hecho}
          onChange={readOnly ? undefined : (v: boolean) => onToggle(i, v)}
          state={readOnly ? "disabled" : item.hecho ? "checked" : "standard"}
        />
      ))}
    </div>
  );
}

export function RepuestosUsadosBox({
  lineas,
  repuestosDisponibles,
  onAdd,
  onRemove,
  readOnly
}: {
  lineas: RepuestoUsado[];
  repuestosDisponibles: Repuesto[];
  onAdd: (linea: RepuestoUsado) => void;
  onRemove: (indice: number) => void;
  readOnly?: boolean;
}) {
  const [repuestoId, setRepuestoId] = useState("");
  const [cantidad, setCantidad] = useState("1");

  const total = lineas.reduce((acc, l) => acc + l.cantidad * l.costoUnitario, 0);

  function agregar() {
    const repuesto = repuestosDisponibles.find((r) => r.id === repuestoId);
    const cant = Number(cantidad);
    if (!repuesto || !Number.isFinite(cant) || cant <= 0) return;
    onAdd({ repuestoId: repuesto.id, nombre: repuesto.nombre, cantidad: cant, costoUnitario: repuesto.costoUnitario });
    setRepuestoId("");
    setCantidad("1");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
      {lineas.length === 0 && <div style={{ color: "var(--ds-color-gray-400)" }}>Sin repuestos registrados todavía.</div>}
      {lineas.map((l, i) => (
        <div
          key={i}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--ds-space-3)", background: "var(--ds-color-gray-100)", borderRadius: "var(--ds-radius-md)" }}
        >
          <span>
            {l.nombre} × {l.cantidad}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-3)" }}>
            <span>₡{(l.cantidad * l.costoUnitario).toLocaleString("es-CR")}</span>
            {!readOnly && <Button ariaLabel="Quitar línea" layout="icon" size="sm" color="white" icon="delete" onClick={() => onRemove(i)} />}
          </span>
        </div>
      ))}
      {lineas.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", fontWeight: "var(--ds-font-weight-semibold)" }}>Total: ₡{total.toLocaleString("es-CR")}</div>
      )}
      {!readOnly && (
        <div style={{ display: "flex", gap: "var(--ds-space-2)", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FormSelect
              label="Repuesto"
              value={repuestoId}
              onChange={(e) => setRepuestoId(e.target.value)}
              placeholder="Seleccioná un repuesto"
              options={repuestosDisponibles.map((r) => ({ value: r.id, label: `${r.nombre} (stock: ${r.stockActual})` }))}
            />
          </div>
          <div style={{ width: 110 }}>
            <FormField label="Cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <Button label="Agregar" color="black" onClick={agregar} />
        </div>
      )}
    </div>
  );
}
