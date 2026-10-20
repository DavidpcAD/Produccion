"use client";

// NOT-IN-DS: lista editable de actividades del checklist diario de un
// equipo. Mismo espíritu que ManualesBox.tsx -- lista + formulario chico
// para agregar, con soloLectura para ocultar edit/borrar/agregar/ordenar.
// Quitar pide confirmación en la misma fila (un toque de más en el celular
// no borra nada) y las flechas cambian el orden en que lo ve el operador.

import { useState, type CSSProperties } from "react";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormField } from "@/components/mantenimiento/ds/Form/Form";
import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";
import type { ChecklistDiarioItem } from "@/lib/mantenimiento/types";

const BOTON_FLECHA: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  border: "1px solid var(--ds-color-gray-200)",
  borderRadius: "var(--ds-radius-md)",
  background: "var(--ds-surface)",
  color: "var(--ds-text)",
  cursor: "pointer"
};

export function ChecklistDiarioBox({
  items,
  onAdd,
  onEditar,
  onQuitar,
  onMover,
  soloLectura
}: {
  items: ChecklistDiarioItem[];
  onAdd: (titulo: string, detalle: string) => Promise<void>;
  onEditar: (id: string, titulo: string, detalle: string) => Promise<void>;
  onQuitar: (id: string) => void;
  onMover?: (id: string, direccion: -1 | 1) => void;
  soloLectura?: boolean;
}) {
  const [agregando, setAgregando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
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
      {items.map((item, indice) => (
        <div
          key={item.id}
          className="mnt-actividad"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            // Solo se parte en dos renglones mientras pide confirmar el borrado.
            flexWrap: confirmandoId === item.id ? "wrap" : "nowrap",
            gap: "var(--ds-space-3)",
            padding: "var(--ds-space-3)",
            background: "var(--ds-color-gray-100)",
            borderRadius: "var(--ds-radius-md)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-3)", minWidth: 0, flex: "1 1 auto" }}>
            {!soloLectura && onMover && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label={`Subir "${item.titulo}"`}
                  style={{ ...BOTON_FLECHA, opacity: indice === 0 ? 0.35 : 1, cursor: indice === 0 ? "default" : "pointer" }}
                  disabled={indice === 0}
                  onClick={() => onMover(item.id, -1)}
                >
                  {/* "back" es la flecha a la izquierda: girada 90° apunta arriba. */}
                  <span style={{ display: "flex", transform: "rotate(90deg)" }}>
                    <Icon name="back" size="sm" />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Bajar "${item.titulo}"`}
                  style={{ ...BOTON_FLECHA, opacity: indice === items.length - 1 ? 0.35 : 1, cursor: indice === items.length - 1 ? "default" : "pointer" }}
                  disabled={indice === items.length - 1}
                  onClick={() => onMover(item.id, 1)}
                >
                  <span style={{ display: "flex", transform: "rotate(-90deg)" }}>
                    <Icon name="back" size="sm" />
                  </span>
                </button>
              </div>
            )}
            <span style={{ color: "var(--ds-color-gray-400)", fontSize: "var(--ds-font-size-body-sm)", fontWeight: "var(--ds-font-weight-semibold)", minWidth: 16 }}>
              {indice + 1}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: "var(--ds-font-weight-semibold)" }}>{item.titulo}</div>
              {item.detalle && <div style={{ color: "var(--ds-color-gray-500)", fontSize: "var(--ds-font-size-body-sm)" }}>{item.detalle}</div>}
            </div>
          </div>
          {!soloLectura &&
            (confirmandoId === item.id ? (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)", flexShrink: 0 }}>
                <span style={{ fontSize: "var(--ds-font-size-label)" }}>¿Quitar del checklist?</span>
                <Button
                  label="Quitar"
                  color="red"
                  size="sm"
                  onClick={() => {
                    setConfirmandoId(null);
                    onQuitar(item.id);
                  }}
                />
                <Button label="No" color="white" size="sm" onClick={() => setConfirmandoId(null)} />
              </div>
            ) : (
              <div className="mnt-actividad__acciones" style={{ display: "flex", gap: "var(--ds-space-2)", flexShrink: 0 }}>
                <Button ariaLabel="Editar actividad" layout="icon" size="sm" color="white" icon="edit" onClick={() => abrirEdicion(item)} />
                <Button ariaLabel="Quitar actividad" layout="icon" size="sm" color="white" icon="delete" onClick={() => setConfirmandoId(item.id)} />
              </div>
            ))}
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
