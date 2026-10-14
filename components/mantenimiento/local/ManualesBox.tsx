"use client";

// NOT-IN-DS: lista de manuales (PDF u otro archivo) por equipo. Reutiliza la
// misma tabla mant.Archivos que ya guarda fotos y firmas de OT (ver
// lib/api.ts: subirArchivo / POST /api/assets) — acá solo se guarda la lista
// de qué archivos le pertenecen al equipo, en Equipos.manuales (JSON).

import { useRef, useState, type ChangeEvent } from "react";
import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import type { ManualEquipo } from "@/lib/mantenimiento/types";

function formatoTamano(bytes?: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ManualesBox({
  manuales,
  onAdd,
  onRemove,
  soloLectura
}: {
  manuales: ManualEquipo[];
  onAdd: (archivo: File) => Promise<void>;
  onRemove: (indice: number) => void;
  soloLectura?: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function seleccionarArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSubiendo(true);
    try {
      await onAdd(archivo);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)" }}>
      {manuales.length === 0 && <div style={{ color: "var(--ds-color-gray-400)" }}>Todavía no hay manuales subidos para este equipo.</div>}
      {manuales.map((m, i) => (
        <div
          key={m.archivoId}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--ds-space-3)",
            background: "var(--ds-color-gray-100)",
            borderRadius: "var(--ds-radius-md)"
          }}
        >
          <a
            href={`/api/mantenimiento/blob/${m.archivoId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)", color: "inherit", textDecoration: "none", minWidth: 0 }}
          >
            <Icon name="folder" size="md" />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nombre}</span>
            <span style={{ color: "var(--ds-color-gray-400)", fontSize: "var(--ds-font-size-body-sm)", flexShrink: 0 }}>{formatoTamano(m.sizeBytes)}</span>
          </a>
          {!soloLectura && <Button ariaLabel="Quitar manual" layout="icon" size="sm" color="white" icon="delete" onClick={() => onRemove(i)} />}
        </div>
      ))}
      {!soloLectura && (
        <div>
          <Button
            label={subiendo ? "Subiendo..." : "Subir manual"}
            color="white"
            layout="icon-left"
            icon="plus"
            state={subiendo ? "disabled" : "standard"}
            onClick={() => inputRef.current?.click()}
          />
          <input ref={inputRef} type="file" disabled={subiendo} onChange={seleccionarArchivo} style={{ display: "none" }} />
        </div>
      )}
    </div>
  );
}
