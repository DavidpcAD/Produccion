"use client";

// Flujo guiado del operador: elegir uno de sus equipos (ya viene filtrado
// por lib/store.tsx según su rol -- ver equiposAutorizadosDe en el backend),
// ver sus datos y actualizar el horómetro, completar el checklist diario de
// ESE equipo, y subir una foto del estado -- todo junto en un solo envío
// transaccional (ver app/api/inspeccionesDiarias/route.ts).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/mantenimiento/store";
import { puede } from "@/lib/mantenimiento/permisos";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";
import { FormSelect } from "@/components/mantenimiento/local/FormExtras";
import { PhotoGallery } from "@/components/mantenimiento/local/PhotoGallery";
import {
  ChecklistInspeccion,
  EquipoResumen,
  faltantesChecklist,
  type EstadoRespuesta,
  type RespuestaChecklist
} from "@/components/mantenimiento/local/ChecklistInspeccion";
import { apiGet, apiPost, aplanarDocs, subirArchivo } from "@/lib/mantenimiento/api";
import type { ChecklistDiarioItem } from "@/lib/mantenimiento/types";

export default function InspeccionDiariaPage() {
  const { equipos, cargando, errorCarga, usuario } = useAppStore();
  const puedeEditarChecklist = puede(usuario?.rol, "equipos.editar");
  const toast = useToast();

  const [equipoId, setEquipoId] = useState("");
  const [horometro, setHorometro] = useState("");
  const [items, setItems] = useState<ChecklistDiarioItem[]>([]);
  const [respuestas, setRespuestas] = useState<RespuestaChecklist[]>([]);
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
        setRespuestas(lista.map((i) => ({ itemId: i.id, titulo: i.titulo, estado: "pendiente", observacion: "" })));
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setCargandoChecklist(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipoId]);

  function marcarItem(itemId: string, estado: EstadoRespuesta) {
    setRespuestas((actual) => actual.map((r) => (r.itemId === itemId ? { ...r, estado } : r)));
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

  const { sinResponder, fallasSinDetalle } = faltantesChecklist(respuestas);
  const fallas = respuestas.filter((r) => r.estado === "falla").length;
  const listo = sinResponder === 0 && fallasSinDetalle === 0;

  async function guardar() {
    if (!equipoId) {
      toast.error("Elegí un equipo.");
      return;
    }
    if (!listo) return;
    setEnviando(true);
    try {
      await apiPost("/api/inspeccionesDiarias", {
        equipoId,
        horometro: horometro === "" ? null : Number(horometro),
        // Mismo formato de siempre para el backend y el historial del equipo:
        // Bien -> hecho; Falla -> no hecho + qué se encontró.
        checklist: respuestas.map((r) => ({
          itemId: r.itemId,
          titulo: r.titulo,
          hecho: r.estado === "bien",
          observacion: r.estado === "falla" ? r.observacion.trim() : ""
        })),
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
          <EquipoResumen equipo={equipo} horometro={horometro} onHorometro={setHorometro} />

          {cargandoChecklist ? (
            <div className="mnt-insp-card" style={{ color: "var(--ds-color-gray-400)" }}>Cargando checklist…</div>
          ) : items.length === 0 ? (
            <div className="mnt-insp-card" style={{ color: "var(--ds-color-gray-400)" }}>
              {puedeEditarChecklist ? (
                <>
                  Este equipo todavía no tiene un checklist cargado.{" "}
                  <Link href={`/mantenimiento/equipos/${equipo.id}#checklist`} style={{ color: "var(--ds-text)", textDecoration: "underline" }}>
                    Agregar actividades desde la ficha del equipo
                  </Link>
                </>
              ) : (
                "Este equipo todavía no tiene un checklist cargado -- pedile al administrador que lo complete desde la ficha del equipo."
              )}
            </div>
          ) : (
            <ChecklistInspeccion
              items={items}
              respuestas={respuestas}
              onEstado={marcarItem}
              onObservacion={anotarObservacion}
              enlaceEditar={puedeEditarChecklist ? `/mantenimiento/equipos/${equipo.id}#checklist` : undefined}
            />
          )}

          <section className="mnt-insp-card">
            <div style={{ fontWeight: "var(--ds-font-weight-semibold)", marginBottom: "var(--ds-space-3)" }}>Foto del estado del equipo</div>
            <PhotoGallery fotos={fotos} onAdd={agregarFoto} onRemove={quitarFoto} />
          </section>

          <div className="mnt-insp-guardar">
            <span className={`mnt-insp-guardar__estado${listo ? " mnt-insp-guardar__estado--listo" : ""}`} role="status">
              <Icon name={listo ? "completado" : "pendiente"} size="md" />
              {sinResponder > 0
                ? `Faltan ${sinResponder} ${sinResponder === 1 ? "punto" : "puntos"} por revisar`
                : fallasSinDetalle > 0
                  ? `Contá qué encontraste en ${fallasSinDetalle === 1 ? "la falla" : `las ${fallasSinDetalle} fallas`}`
                  : fallas > 0
                    ? `Listo para guardar · ${fallas} ${fallas === 1 ? "falla reportada" : "fallas reportadas"}`
                    : "Listo para guardar"}
            </span>
            <Button
              label={enviando ? "Guardando…" : "Guardar inspección"}
              color="green"
              onClick={guardar}
              state={enviando || !listo ? "disabled" : "standard"}
            />
          </div>
        </>
      )}
    </div>
  );
}
