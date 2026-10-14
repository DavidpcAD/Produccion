"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/lib/mantenimiento/store";
import { Table, Pill, type ColumnaTabla } from "@/components/mantenimiento/local/Table";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { ManualesBox } from "@/components/mantenimiento/local/ManualesBox";
import { ChecklistDiarioBox } from "@/components/mantenimiento/local/ChecklistDiarioBox";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { horasRestantesSimple, kilometrosRestantesSimple, toneRestante, diasHastaProximoMantenimiento, toneFechaProxima, type TonoPill } from "@/lib/mantenimiento/planUtils";
import { puede } from "@/lib/mantenimiento/permisos";
import { apiGet, apiPost, apiPatch, apiDelete, aplanarDocs } from "@/lib/mantenimiento/api";
import type { ChecklistDiarioItem, Equipo, EstadoEquipo, InspeccionDiaria, MovimientoRepuesto, OrdenTrabajo, Repuesto } from "@/lib/mantenimiento/types";

const ESTADO_TONO: Record<EstadoEquipo, "green" | "yellow" | "red"> = { operativo: "green", mantenimiento: "yellow", fuera_servicio: "red" };
const ESTADO_LABEL: Record<EstadoEquipo, string> = { operativo: "Operativo", mantenimiento: "Mantenimiento", fuera_servicio: "Fuera de servicio" };

function Seccion({ titulo, subtitulo, children, id }: { titulo: string; subtitulo?: string; children: ReactNode; id?: string }) {
  return (
    <div
      id={id}
      style={{ background: "var(--ds-surface)", borderRadius: "var(--ds-radius-lg)", boxShadow: "var(--ds-shadow-01)", padding: "var(--ds-space-5)", scrollMarginTop: 90 }}
    >
      <div style={{ fontWeight: "var(--ds-font-weight-semibold)" }}>{titulo}</div>
      {subtitulo && <div style={{ color: "var(--ds-color-gray-400)", fontSize: "var(--ds-font-size-body-sm)", marginBottom: "var(--ds-space-3)" }}>{subtitulo}</div>}
      {!subtitulo && <div style={{ marginBottom: "var(--ds-space-3)" }} />}
      {children}
    </div>
  );
}

// Tono del indicador de vida útil: no hay un intervalo esperado por
// repuesto todavía (habría que sumarlo al esquema), así que por ahora esto
// solo avisa cuando ya pasaron más horas desde el cambio que el intervalo
// preventivo estándar del propio equipo — una referencia razonable mientras
// no exista algo más fino.
function toneVidaUtil(horasUso: number | null, intervaloReferencia: number): TonoPill {
  if (horasUso == null || !intervaloReferencia) return "gray";
  if (horasUso >= intervaloReferencia) return "red";
  if (horasUso >= intervaloReferencia * 0.75) return "yellow";
  return "green";
}

interface LineaHistorial extends MovimientoRepuesto {
  ot: OrdenTrabajo;
  repuesto?: Repuesto;
  horometro: number | null;
}
interface LineaResumen extends LineaHistorial {
  horasUso: number | null;
}

export default function EquipoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { equipos, ots, repuestos, movimientos, guardarEquipo, subirArchivo, cargando, errorCarga, usuario } = useAppStore();
  const toast = useToast();
  const puedeSubirManual = puede(usuario?.rol, "equipos.subirManual");
  const puedeEditarChecklist = puede(usuario?.rol, "equipos.editar");

  const equipo = equipos.find((e) => e.id === params.id);

  const [checklistItems, setChecklistItems] = useState<ChecklistDiarioItem[]>([]);
  const [inspecciones, setInspecciones] = useState<InspeccionDiaria[]>([]);

  useEffect(() => {
    if (!equipo) return;
    apiGet(`/api/checklistDiario?equipoId=${equipo.id}`)
      .then((r) => setChecklistItems(aplanarDocs<ChecklistDiarioItem>(r)))
      .catch((err) => toast.error((err as Error).message));
    apiGet(`/api/inspeccionesDiarias?equipoId=${equipo.id}`)
      .then((r) => setInspecciones(aplanarDocs<InspeccionDiaria>(r)))
      .catch((err) => toast.error((err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipo?.id]);

  async function agregarActividad(titulo: string, detalle: string) {
    if (!equipo) return;
    try {
      await apiPost("/api/checklistDiario", { equipoId: equipo.id, titulo, detalle });
      const r = await apiGet(`/api/checklistDiario?equipoId=${equipo.id}`);
      setChecklistItems(aplanarDocs<ChecklistDiarioItem>(r));
      toast.exito("Actividad agregada.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function editarActividad(id: string, titulo: string, detalle: string) {
    try {
      await apiPatch(`/api/checklistDiario/${id}`, { titulo, detalle });
      setChecklistItems((actual) => actual.map((i) => (i.id === id ? { ...i, titulo, detalle } : i)));
      toast.exito("Actividad actualizada.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function quitarActividad(id: string) {
    try {
      await apiDelete(`/api/checklistDiario/${id}`);
      setChecklistItems((actual) => actual.filter((i) => i.id !== id));
      toast.exito("Actividad eliminada.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  const horasRestantes = equipo ? horasRestantesSimple(equipo) : null;
  const kmRestantes = equipo ? kilometrosRestantesSimple(equipo) : null;
  const diasProxima = equipo ? diasHastaProximoMantenimiento(equipo) : null;

  async function agregarManual(archivo: File) {
    if (!equipo) return;
    try {
      const subida = await subirArchivo(archivo);
      const entrada = { archivoId: subida.id, nombre: archivo.name, contentType: subida.contentType, sizeBytes: subida.sizeBytes, subidoEn: new Date().toISOString() };
      await guardarEquipo({ manuales: [...(equipo.manuales || []), entrada] }, equipo.id);
      toast.exito("Manual subido.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function quitarManual(indice: number) {
    if (!equipo) return;
    try {
      await guardarEquipo({ manuales: (equipo.manuales || []).filter((_, i) => i !== indice) }, equipo.id);
      toast.exito("Manual quitado.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const repertorio = useMemo(() => (equipo ? repuestos.filter((r) => r.equipoId === equipo.id) : []), [equipo, repuestos]);

  const historial = useMemo<LineaHistorial[]>(() => {
    if (!equipo) return [];
    return movimientos
      .filter((m) => m.tipo === "salida" && m.otId)
      .map((m): LineaHistorial | null => {
        const ot = ots.find((o) => o.id === m.otId);
        return ot && ot.equipoId === equipo.id
          ? { ...m, ot, repuesto: repuestos.find((r) => r.id === m.repuestoId), horometro: ot.horometroCierre ?? null }
          : null;
      })
      .filter((l): l is LineaHistorial => l !== null)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [equipo, movimientos, ots, repuestos]);

  const resumenPorRepuesto = useMemo<LineaResumen[]>(() => {
    const porRepuesto = new Map<string, LineaHistorial>();
    for (const linea of historial) {
      const clave = linea.repuestoId;
      const existente = porRepuesto.get(clave);
      if (!existente || new Date(linea.fecha) > new Date(existente.fecha)) {
        porRepuesto.set(clave, linea);
      }
    }
    return [...porRepuesto.values()]
      .map((linea): LineaResumen => {
        const horasUso = equipo && linea.horometro != null ? equipo.horometroActual - linea.horometro : null;
        return { ...linea, horasUso };
      })
      .sort((a, b) => (b.horasUso ?? -1) - (a.horasUso ?? -1));
  }, [historial, equipo]);

  if (!equipo) {
    return (
      <div>
        <EstadoCarga cargando={cargando} error={errorCarga} />
        {!cargando && (
          <>
            <p>No se encontró ese equipo.</p>
            <Button label="Volver" color="white" onClick={() => router.push("/mantenimiento/equipos")} />
          </>
        )}
      </div>
    );
  }

  const columnasResumen: ColumnaTabla<LineaResumen>[] = [
    { key: "repuesto", header: "Repuesto", render: (l) => l.repuesto?.nombre ?? "—" },
    { key: "fecha", header: "Último cambio", render: (l) => new Date(l.fecha).toLocaleDateString("es-CR") },
    { key: "ot", header: "OT", render: (l) => l.ot?.numero ?? "—" },
    { key: "horometro", header: "Horómetro del cambio", render: (l) => (l.horometro != null ? `${l.horometro.toLocaleString("es-CR")} h` : "—") },
    {
      key: "horasUso",
      header: "En uso desde el cambio",
      render: (l) => {
        if (l.horasUso == null) return "—";
        const tono = toneVidaUtil(l.horasUso, equipo.intervaloHorasPreventivo);
        return <Pill tone={tono}>{l.horasUso.toLocaleString("es-CR")} h</Pill>;
      }
    }
  ];

  const columnasRepertorio: ColumnaTabla<Repuesto>[] = [
    { key: "codigo", header: "Código" },
    { key: "nombre", header: "Nombre" },
    { key: "categoria", header: "Categoría" },
    { key: "stockActual", header: "Stock", render: (r) => `${r.stockActual} / mín. ${r.stockMinimo} ${r.unidad ?? ""}` },
    { key: "estado", header: "Estado", render: (r) => <Pill tone={r.stockActual <= r.stockMinimo ? "red" : "green"}>{r.stockActual <= r.stockMinimo ? "Bajo mínimo" : "OK"}</Pill> }
  ];

  const columnasHistorial: ColumnaTabla<LineaHistorial>[] = [
    { key: "fecha", header: "Fecha", render: (m) => new Date(m.fecha).toLocaleString("es-CR") },
    { key: "repuesto", header: "Repuesto", render: (m) => m.repuesto?.nombre ?? "—" },
    { key: "cantidad", header: "Cantidad" },
    { key: "ot", header: "OT de origen", render: (m) => m.ot?.numero ?? "—" },
    { key: "horometro", header: "Horómetro", render: (m) => (m.horometro != null ? `${m.horometro.toLocaleString("es-CR")} h` : "—") },
    { key: "responsable", header: "Responsable", render: (m) => m.responsable || m.ot?.responsable || "—" }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)", maxWidth: 900 }}>
      <EstadoCarga cargando={false} error={errorCarga} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-3)" }}>
            <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>{equipo.nombre}</h1>
            <Pill tone={ESTADO_TONO[equipo.estado]}>{ESTADO_LABEL[equipo.estado]}</Pill>
            {horasRestantes != null && <Pill tone={toneRestante(horasRestantes, equipo.intervaloHorasPreventivo)}>{horasRestantes.toFixed(0)} h para el próx. MTO</Pill>}
            {kmRestantes != null && <Pill tone={toneRestante(kmRestantes, equipo.intervaloKilometrajePreventivo ?? 0)}>{kmRestantes.toFixed(0)} km para el próx. MTO</Pill>}
            {diasProxima != null && (
              <Pill tone={toneFechaProxima(diasProxima)}>
                {diasProxima <= 0 ? `MTO vencido desde ${equipo.proximaFechaMantenimiento}` : `Próx. MTO: ${equipo.proximaFechaMantenimiento} (${diasProxima}d)`}
              </Pill>
            )}
          </div>
          <div style={{ color: "var(--ds-color-gray-500)", marginTop: 4 }}>
            {equipo.codigo} — {equipo.marca} {equipo.modelo} — {equipo.horometroActual.toLocaleString("es-CR")} h — {equipo.kilometraje != null ? `${equipo.kilometraje.toLocaleString("es-CR")} km` : "sin kilometraje"}
          </div>
          <div style={{ color: "var(--ds-color-gray-400)", fontSize: "var(--ds-font-size-body-sm)", marginTop: 4, display: "flex", gap: "var(--ds-space-3)", flexWrap: "wrap" }}>
            {equipo.placa && <span>Placa: {equipo.placa}</span>}
            {equipo.combustible && <span>Combustible: {equipo.combustible}</span>}
            {equipo.kilometraje != null && <span>Kilometraje: {equipo.kilometraje.toLocaleString("es-CR")} km</span>}
            {equipo.revisionTecnica && <span>Revisión técnica: {equipo.revisionTecnica}</span>}
            {equipo.fechaIngreso && <span>Ingreso: {equipo.fechaIngreso}</span>}
            {equipo.ultimaFechaMantenimiento && <span>Último MTO: {equipo.ultimaFechaMantenimiento}</span>}
          </div>
        </div>
        <Button label="Volver a Equipos" color="white" onClick={() => router.push("/mantenimiento/equipos")} />
      </div>

      <Seccion titulo="Manuales">
        <ManualesBox manuales={equipo.manuales || []} onAdd={agregarManual} onRemove={quitarManual} soloLectura={!puedeSubirManual} />
      </Seccion>

      <Seccion id="checklist" titulo="Checklist diario" subtitulo="Lo que el operador completa antes de usar el equipo, desde Inspección diaria.">
        <ChecklistDiarioBox
          items={checklistItems}
          onAdd={agregarActividad}
          onEditar={editarActividad}
          onQuitar={quitarActividad}
          soloLectura={!puedeEditarChecklist}
        />
      </Seccion>

      <Seccion titulo="Historial de inspecciones diarias" subtitulo="Horómetro, checklist y fotos que fue reportando cada operador, por fecha.">
        {inspecciones.length === 0 ? (
          <div style={{ color: "var(--ds-color-gray-400)" }}>Todavía no hay inspecciones registradas para este equipo.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
            {inspecciones.map((insp) => {
              const hechos = insp.checklist.filter((c) => c.hecho).length;
              return (
                <div key={insp.id} style={{ padding: "var(--ds-space-3)", background: "var(--ds-color-gray-100)", borderRadius: "var(--ds-radius-md)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ds-space-3)", alignItems: "center" }}>
                    <strong>{insp.fecha ? new Date(insp.fecha).toLocaleString("es-CR") : "—"}</strong>
                    <span>{insp.usuarioNombre || "—"}</span>
                    {insp.horometro != null && <span>{insp.horometro.toLocaleString("es-CR")} h</span>}
                    <Pill tone={hechos === insp.checklist.length ? "green" : "yellow"}>
                      {hechos}/{insp.checklist.length} completados
                    </Pill>
                  </div>
                  {insp.fotos.length > 0 && (
                    <div style={{ display: "flex", gap: "var(--ds-space-2)", marginTop: "var(--ds-space-2)" }}>
                      {insp.fotos.map((fotoId) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={fotoId}
                          src={`/api/mantenimiento/blob/${fotoId}`}
                          alt="Estado del equipo"
                          style={{ width: 72, height: 72, objectFit: "cover", borderRadius: "var(--ds-radius-md)" }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Repuestos de este equipo">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--ds-space-3)" }}>
          <Button label="Administrar en Repuestos" color="white" size="sm" onClick={() => router.push(`/mantenimiento/repuestos?equipo=${equipo.id}`)} />
        </div>
        <Table columns={columnasRepertorio} rows={repertorio} getRowKey={(r) => r.id} emptyMessage="Este equipo todavía no tiene repuestos asignados." />
      </Seccion>

      <Seccion
        titulo="Vida útil por repuesto"
        subtitulo="Horas de uso del equipo desde el último cambio de cada repuesto. En rojo: ya superó el intervalo preventivo estándar del equipo; en amarillo: va por más de 3/4 de ese intervalo — es una referencia mientras no haya un intervalo propio por repuesto."
      >
        <Table
          columns={columnasResumen}
          rows={resumenPorRepuesto}
          getRowKey={(l) => l.repuestoId}
          emptyMessage="Todavía no hay repuestos registrados para este equipo — quedan registrados automáticamente al finalizar una OT que use repuestos."
        />
      </Seccion>

      <Seccion titulo="Historial completo de repuestos cambiados">
        <Table columns={columnasHistorial} rows={historial} getRowKey={(m) => m.id} emptyMessage="Sin movimientos de repuestos todavía." />
      </Seccion>
    </div>
  );
}
