"use client";

// Flujo guiado del operador: elegir uno de sus equipos (ya viene filtrado
// por lib/store.tsx según su rol -- ver equiposAutorizadosDe en el backend),
// ver sus datos y actualizar el horómetro, completar el checklist diario de
// ESE equipo, y subir una foto del estado -- todo junto en un solo envío
// transaccional (ver app/api/inspeccionesDiarias/route.ts).

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/mantenimiento/store";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { FormField, CheckBox } from "@/components/mantenimiento/ds/Form/Form";
import { FormSelect } from "@/components/mantenimiento/local/FormExtras";
import { PhotoGallery } from "@/components/mantenimiento/local/PhotoGallery";
import { apiGet, apiPost, aplanarDocs, subirArchivo } from "@/lib/mantenimiento/api";
import type { ChecklistDiarioItem } from "@/lib/mantenimiento/types";

interface RespuestaLocal {
  itemId: string;
  titulo: string;
  hecho: boolean;
  observacion: string;
}

export default function InspeccionDiariaPage() {
  const { equipos, cargando, errorCarga } = useAppStore();
  const toast = useToast();

  const [equipoId, setEquipoId] = useState("");
  const [horometro, setHorometro] = useState("");
  const [items, setItems] = useState<ChecklistDiarioItem[]>([]);
  const [respuestas, setRespuestas] = useState<RespuestaLocal[]>([]);
  const [fotos, setFotos] = useState<string[]>([]);
  const [cargandoChecklist, setCargandoChecklist] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const equipo = equipos.find((e) => e.id === equipoId);

  useEffect(() => {
    if (!equipoId) {
      setItems([]);
      setRespuestas([]);
      return;
    }
    const eq = equipos.find((e) => e.id === equipoId);
    setHorometro(eq ? String(eq.horometroActual) : "");
    setFotos([]);
    setCargandoChecklist(true);
    apiGet(`/api/checklistDiario?equipoId=${equipoId}`)
      .then((r) => {
        const lista = aplanarDocs<ChecklistDiarioItem>(r);
        setItems(lista);
        setRespuestas(lista.map((i) => ({ itemId: i.id, titulo: i.titulo, hecho: false, observacion: "" })));
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setCargandoChecklist(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  function marcarItem(itemId: string, hecho: boolean) {
    setRespuestas((actual) => actual.map((r) => (r.itemId === itemId ? { ...r, hecho } : r)));
  }

  function anotarObservacion(itemId: string, observacion: string) {
    setRespuestas((actual) => actual.map((r) => (r.itemId === itemId ? { ...r, observacion } : r)));
  }

  async function agregarFoto(archivo: File) {
    try {
      const { id } = await subirArchivo(archivo);
      setFotos((actual) => [...actual, id]);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function quitarFoto(indice: number) {
    setFotos((actual) => actual.filter((_, i) => i !== indice));
  }

  async function guardar() {
    if (!equipoId) {
      toast.error("Elegí un equipo.");
      return;
    }
    setEnviando(true);
    try {
      await apiPost("/api/inspeccionesDiarias", {
        equipoId,
        horometro: horometro === "" ? null : Number(horometro),
        checklist: respuestas,
        fotos
      });
      toast.exito("Inspección guardada.");
      setEquipoId("");
      setHorometro("");
      setItems([]);
      setRespuestas([]);
      setFotos([]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)", maxWidth: 720 }}>
      <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>Inspección diaria</h1>
      <EstadoCarga cargando={cargando} error={errorCarga} />

      <FormSelect
        label="Equipo"
        value={equipoId}
        onChange={(e) => setEquipoId(e.target.value)}
        placeholder="Seleccioná un equipo"
        options={equipos.map((e) => ({ value: e.id, label: `${e.codigo} — ${e.nombre}` }))}
      />

      {!equipoId && equipos.length === 0 && !cargando && (
        <div style={{ color: "var(--ds-color-gray-400)" }}>Todavía no tenés ningún equipo asignado -- pedile al administrador que te asigne uno desde Usuarios.</div>
      )}

      {equipo && (
        <>
          <div
            style={{
              background: "var(--ds-surface)",
              borderRadius: "var(--ds-radius-lg)",
              boxShadow: "var(--ds-shadow-01)",
              padding: "var(--ds-space-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--ds-space-3)"
            }}
          >
            <div style={{ fontWeight: "var(--ds-font-weight-semibold)" }}>{equipo.nombre}</div>
            <div style={{ color: "var(--ds-color-gray-500)", fontSize: "var(--ds-font-size-body-sm)" }}>
              {equipo.codigo} — {equipo.marca} {equipo.modelo} {equipo.placa && `— Placa ${equipo.placa}`}
            </div>
            <FormField label="Horómetro" type="number" value={horometro} onChange={(e) => setHorometro(e.target.value)} />
          </div>

          <div style={{ background: "var(--ds-surface)", borderRadius: "var(--ds-radius-lg)", boxShadow: "var(--ds-shadow-01)", padding: "var(--ds-space-5)" }}>
            <div style={{ fontWeight: "var(--ds-font-weight-semibold)", marginBottom: "var(--ds-space-3)" }}>Checklist diario (antes de arrancar)</div>
            {cargandoChecklist ? (
              <div style={{ color: "var(--ds-color-gray-400)" }}>Cargando…</div>
            ) : items.length === 0 ? (
              <div style={{ color: "var(--ds-color-gray-400)" }}>Este equipo todavía no tiene un checklist cargado -- pedile al administrador que lo complete desde la ficha del equipo.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
                {items.map((item) => {
                  const respuesta = respuestas.find((r) => r.itemId === item.id);
                  return (
                    <div key={item.id} style={{ borderBottom: "1px solid var(--ds-color-gray-100)", paddingBottom: "var(--ds-space-3)" }}>
                      <CheckBox label={item.titulo} checked={!!respuesta?.hecho} onChange={(v) => marcarItem(item.id, v)} />
                      {item.detalle && <div style={{ color: "var(--ds-color-gray-400)", fontSize: "var(--ds-font-size-body-sm)", margin: "4px 0 8px 28px" }}>{item.detalle}</div>}
                      <div style={{ marginLeft: 28 }}>
                        <FormField
                          label="Observación (opcional)"
                          value={respuesta?.observacion ?? ""}
                          onChange={(e) => anotarObservacion(item.id, e.target.value)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ background: "var(--ds-surface)", borderRadius: "var(--ds-radius-lg)", boxShadow: "var(--ds-shadow-01)", padding: "var(--ds-space-5)" }}>
            <div style={{ fontWeight: "var(--ds-font-weight-semibold)", marginBottom: "var(--ds-space-3)" }}>Foto del estado del equipo</div>
            <PhotoGallery fotos={fotos} onAdd={agregarFoto} onRemove={quitarFoto} />
          </div>

          <Button label={enviando ? "Guardando…" : "Guardar inspección"} color="green" onClick={guardar} state={enviando ? "disabled" : "standard"} />
        </>
      )}
    </div>
  );
}
