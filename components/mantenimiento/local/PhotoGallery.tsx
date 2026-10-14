"use client";

// NOT-IN-DS: galería de fotos de evidencia (subida + miniaturas). `fotos` es
// un array de ids de mant.Archivos (así los guarda el finalizar de la OT,
// ver sql/schema2.sql); cada miniatura se sirve desde /api/mantenimiento/blob/<id>. La subida
// real pasa por POST /api/assets (ver lib/api.ts: subirArchivo) antes de
// avisarle al padre que agregue el id a la lista.

import { useState, type ChangeEvent } from "react";
import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";

export function PhotoGallery({
  fotos,
  onAdd,
  onRemove,
  readOnly
}: {
  fotos: string[];
  onAdd: (archivo: File) => Promise<void>;
  onRemove: (indice: number) => void;
  readOnly?: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);

  async function seleccionarArchivos(e: ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files || []);
    e.target.value = "";
    if (!archivos.length) return;
    setSubiendo(true);
    try {
      for (const archivo of archivos) {
        await onAdd(archivo);
      }
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ds-space-3)" }}>
      {fotos.map((id, i) => (
        <div
          key={id}
          style={{
            position: "relative",
            width: 96,
            height: 96,
            borderRadius: "var(--ds-radius-md)",
            overflow: "hidden",
            boxShadow: "var(--ds-shadow-01)"
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/mantenimiento/blob/${id}`} alt="Evidencia" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {!readOnly && (
            <button
              onClick={() => onRemove(i)}
              aria-label="Quitar foto"
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                background: "rgba(0,0,0,0.6)",
                border: "none",
                borderRadius: "50%",
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer"
              }}
            >
              <Icon name="close" size="sm" color="var(--ds-color-white)" />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <label
          style={{
            width: 96,
            height: 96,
            borderRadius: "var(--ds-radius-md)",
            border: "2px dashed var(--ds-color-gray-300)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: subiendo ? "wait" : "pointer",
            color: "var(--ds-color-gray-400)"
          }}
        >
          <Icon name={subiendo ? "info" : "plus"} size="lg" color="var(--ds-color-gray-400)" />
          <input type="file" accept="image/*" capture="environment" multiple disabled={subiendo} onChange={seleccionarArchivos} style={{ display: "none" }} />
        </label>
      )}
    </div>
  );
}
