"use client";

// NOT-IN-DS: documentos por equipo, en dos grupos: fichas técnicas y manuales
// (PDF u otro archivo). Reutiliza la misma tabla mant.Archivos que ya guarda
// fotos y firmas de OT (ver lib/api.ts: subirArchivo / POST /api/assets) —
// acá solo se guarda la lista de qué archivos le pertenecen al equipo, en
// Equipos.manuales (JSON), cada uno con su `tipo`. Los subidos antes de que
// existiera el tipo no lo tienen y se muestran como manuales.

import { useRef, useState, type ChangeEvent } from "react";
import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import type { ManualEquipo } from "@/lib/mantenimiento/types";

type TipoDocumento = "manual" | "ficha";

const GRUPOS: { tipo: TipoDocumento; titulo: string; vacio: string; boton: string }[] = [
  { tipo: "ficha", titulo: "Fichas técnicas", vacio: "Todavía no hay fichas técnicas para este equipo.", boton: "Subir ficha técnica" },
  { tipo: "manual", titulo: "Manuales", vacio: "Todavía no hay manuales subidos para este equipo.", boton: "Subir manual" }
];

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
  onAdd: (archivo: File, tipo: TipoDocumento) => Promise<void>;
  onRemove: (archivoId: string) => void;
  soloLectura?: boolean;
}) {
  const [subiendo, setSubiendo] = useState<TipoDocumento | null>(null);
  const [tipoElegido, setTipoElegido] = useState<TipoDocumento>("manual");
  const inputRef = useRef<HTMLInputElement>(null);

  function elegirArchivo(tipo: TipoDocumento) {
    setTipoElegido(tipo);
    inputRef.current?.click();
  }

  async function seleccionarArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setSubiendo(tipoElegido);
    try {
      await onAdd(archivo, tipoElegido);
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)" }}>
      {GRUPOS.map((grupo) => {
        const docs = manuales.filter((m) => (m.tipo ?? "manual") === grupo.tipo);
        return (
          <div key={grupo.tipo} style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)" }}>
            <div style={{ color: "var(--ds-color-gray-500)", fontSize: "var(--ds-font-size-body-sm)", fontWeight: "var(--ds-font-weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--ds-letter-spacing-wide)" }}>
              {grupo.titulo}
            </div>
            {docs.length === 0 && <div style={{ color: "var(--ds-color-gray-400)" }}>{grupo.vacio}</div>}
            {docs.map((m) => (
              <div
                key={m.archivoId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--ds-space-2)",
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
                  <Icon name={grupo.tipo === "ficha" ? "boleta" : "folder"} size="md" />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nombre}</span>
                  <span style={{ color: "var(--ds-color-gray-400)", fontSize: "var(--ds-font-size-body-sm)", flexShrink: 0 }}>{formatoTamano(m.sizeBytes)}</span>
                </a>
                {!soloLectura && (
                  <Button ariaLabel={`Quitar ${m.nombre}`} layout="icon" size="sm" color="white" icon="delete" onClick={() => onRemove(m.archivoId)} />
                )}
              </div>
            ))}
            {!soloLectura && (
              <div>
                <Button
                  label={subiendo === grupo.tipo ? "Subiendo..." : grupo.boton}
                  color="white"
                  layout="icon-left"
                  icon="plus"
                  state={subiendo ? "disabled" : "standard"}
                  onClick={() => elegirArchivo(grupo.tipo)}
                />
              </div>
            )}
          </div>
        );
      })}
      <input ref={inputRef} type="file" disabled={!!subiendo} onChange={seleccionarArchivo} style={{ display: "none" }} />
    </div>
  );
}
