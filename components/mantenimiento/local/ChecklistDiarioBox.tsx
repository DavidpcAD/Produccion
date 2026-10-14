"use client";

// NOT-IN-DS: lista editable de actividades del checklist diario de un
// equipo. Mismo espíritu que ManualesBox.tsx -- lista + formulario chico
// para agregar, con soloLectura para ocultar edit/borrar/agregar.

import { useState } from "react";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormField } from "@/components/mantenimiento/ds/Form/Form";
import type { ChecklistDiarioItem } from "@/lib/mantenimiento/types";

export function ChecklistDiarioBox({
  items,
  onAdd,
  onEditar,
  onQuitar,
  soloLectura
}: {
  items: ChecklistDiarioItem[];
  onAdd: (titulo: string, detalle: string) => Promise<void>;
  onEditar: (id: string, titulo: string, detalle: string) => Promise<void>;
  onQuitar: (id: string) => void;
  soloLectura?: boolean;
}) {
  const [agregando, setAgregando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [guardando, setGuardando] = useState(false);

  function abrirNuevo() {
    setEditandoId(null);
    setTitulo("");
    setDetalle("");
    setAgregando(true);
  }

  function abrirEdicion(item: ChecklistDiarioItem) {
    setEditandoId(item.id);
    setTitulo(item.titulo);
    setDetalle(item.detalle || "");
    setAgregando(true);
  }

  async function guardar() {
    if (!titulo.trim()) return;
    setGuardando(true);
    try {
      if (editandoId) await onEditar(editandoId, titulo.trim(), detalle.trim());
      else await onAdd(titulo.trim(), detalle.trim());
      setAgregando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)" }}>
      {items.length === 0 && !agregando && (
        <div style={{ color: "var(--ds-color-gray-400)" }}>Todavía no hay actividades cargadas para este equipo.</div>
      )}
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "var(--ds-space-3)",
            padding: "var(--ds-space-3)",
            background: "var(--ds-color-gray-100)",
            borderRadius: "var(--ds-radius-md)"
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: "var(--ds-font-weight-semibold)" }}>{item.titulo}</div>
            {item.detalle && <div style={{ color: "var(--ds-color-gray-500)", fontSize: "var(--ds-font-size-body-sm)" }}>{item.detalle}</div>}
          </div>
          {!soloLectura && (
            <div style={{ display: "flex", gap: "var(--ds-space-2)", flexShrink: 0 }}>
              <Button ariaLabel="Editar actividad" layout="icon" size="sm" color="white" icon="edit" onClick={() => abrirEdicion(item)} />
              <Button ariaLabel="Quitar actividad" layout="icon" size="sm" color="white" icon="delete" onClick={() => onQuitar(item.id)} />
            </div>
          )}
        </div>
      ))}

      {!soloLectura && !agregando && (
        <div>
          <Button label="Agregar actividad" color="white" layout="icon-left" icon="plus" onClick={abrirNuevo} />
        </div>
      )}

      {!soloLectura && agregando && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)", border: "1px solid var(--ds-color-gray-100)", borderRadius: "var(--ds-radius-md)", padding: "var(--ds-space-3)" }}>
          <FormField label="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <FormField label="Detalle (opcional)" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          <div style={{ display: "flex", gap: "var(--ds-space-2)" }}>
            <Button label={guardando ? "Guardando…" : "Guardar"} color="green" size="sm" onClick={guardar} state={guardando ? "disabled" : "standard"} />
            <Button label="Cancelar" color="white" size="sm" onClick={() => setAgregando(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
