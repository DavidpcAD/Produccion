"use client";

import { useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/lib/mantenimiento/store";
import { useToast } from "@/components/mantenimiento/local/Toast";
import { Pill } from "@/components/mantenimiento/local/Table";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { SlideButton } from "@/components/mantenimiento/ds/SlideButton/SlideButton";
import { FormField } from "@/components/mantenimiento/ds/Form/Form";
import { FormTextarea } from "@/components/mantenimiento/local/FormExtras";
import { ChecklistBox, RepuestosUsadosBox } from "@/components/mantenimiento/local/OtDetalleWidgets";
import { PhotoGallery } from "@/components/mantenimiento/local/PhotoGallery";
import { SignaturePad } from "@/components/mantenimiento/local/SignaturePad";
import { puede } from "@/lib/mantenimiento/permisos";
import type { EstadoOt, RepuestoUsado, TipoOt } from "@/lib/mantenimiento/types";
import type { TonoPill } from "@/lib/mantenimiento/planUtils";

const ESTADO_LABEL: Record<EstadoOt, string> = { abierta: "Abierta", en_proceso: "En proceso", finalizada: "Finalizada", cancelada: "Cancelada" };
const ESTADO_TONO: Record<EstadoOt, TonoPill> = { abierta: "yellow", en_proceso: "black", finalizada: "green", cancelada: "red" };
const TIPO_LABEL: Record<TipoOt, string> = { preventivo: "Preventivo", correctivo: "Correctivo", predictivo: "Predictivo" };

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{ background: "var(--ds-surface)", borderRadius: "var(--ds-radius-lg)", boxShadow: "var(--ds-shadow-01)", padding: "var(--ds-space-5)" }}>
      <div style={{ fontWeight: "var(--ds-font-weight-semibold)", marginBottom: "var(--ds-space-3)" }}>{titulo}</div>
      {children}
    </div>
  );
}

// Convierte el data URL PNG del canvas de firma en un File para subirlo con
// el mismo subirArchivo() que usan las fotos.
function dataUrlAFile(dataUrl: string, nombre: string): File {
  const [cabecera, base64] = dataUrl.split(",");
  const contentType = cabecera.match(/data:(.*);base64/)![1];
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], nombre, { type: contentType });
}

export default function OtDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { ots, equipos, repuestos, cargando, errorCarga, actualizarOt, iniciarOt, cancelarOt, finalizarOt, subirArchivo, usuario } = useAppStore();
  const toast = useToast();
  const puedeEjecutar = puede(usuario?.rol, "ots.ejecutar");

  const ot = ots.find((o) => o.id === params.id);

  const [mostrandoCancelar, setMostrandoCancelar] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Repuestos usados y fotos no tienen PATCH propio en el backend — solo se
  // graban de una vez al finalizar (POST /api/ots/[id]/finalizar). Por eso
  // viven acá como estado local mientras la OT está en_proceso, sembrado UNA
  // sola vez con lo que ya traía la OT (el inicializador de useState no se
  // vuelve a correr aunque el store refresque `ots` cada 5s).
  const [repuestosUsados, setRepuestosUsados] = useState<RepuestoUsado[]>(() => ot?.repuestosUsados ?? []);
  const [fotos, setFotos] = useState<string[]>(() => ot?.fotos ?? []);

  const [trabajoRealizado, setTrabajoRealizado] = useState(() => ot?.trabajoRealizado ?? "");
  const [horometroCierre, setHorometroCierre] = useState(() => (ot ? String(ot.horometroCierre ?? ot.horometroApertura) : ""));
  const [costoManoObra, setCostoManoObra] = useState(() => (ot ? String(ot.costoManoObra) : "0"));
  const [firmaResponsable, setFirmaResponsable] = useState(() => ot?.responsable ?? "");
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);

  if (!ot) {
    return (
      <div>
        <EstadoCarga cargando={cargando} error={errorCarga} />
        {!cargando && (
          <>
            <p>No se encontró esa orden de trabajo.</p>
            <Button label="Volver" color="white" onClick={() => router.push("/mantenimiento/ordenes")} />
          </>
        )}
      </div>
    );
  }

  const equipo = equipos.find((e) => e.id === ot.equipoId);
  // Un operador puede reportar (crear) una OT, pero no ejecutarla -- para su
  // rol, la ficha completa (checklist, repuestos, fotos, cierre) es de
  // solo lectura sin importar el estado real de la OT.
  const soloLectura = ot.estado === "finalizada" || ot.estado === "cancelada" || !puedeEjecutar;

  async function toggleChecklistItem(indice: number, hecho: boolean) {
    const checklist = ot!.checklist.map((item, i) => (i === indice ? { ...item, hecho } : item));
    try {
      await actualizarOt(ot!.id, { checklist });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function agregarRepuesto(linea: RepuestoUsado) {
    setRepuestosUsados((actual) => [...actual, linea]);
  }

  function quitarRepuesto(indice: number) {
    setRepuestosUsados((actual) => actual.filter((_, i) => i !== indice));
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

  async function confirmarInicio() {
    try {
      await iniciarOt(ot!.id);
      toast.exito("OT iniciada.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function confirmarCancelacion() {
    if (!motivoCancelacion.trim()) {
      toast.error("Ingresá el motivo de la cancelación.");
      return;
    }
    try {
      await cancelarOt(ot!.id, motivoCancelacion.trim());
      toast.exito("OT cancelada.");
      setMostrandoCancelar(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const puedeFinalizar =
    horometroCierre !== "" &&
    Number(horometroCierre) >= ot.horometroApertura &&
    trabajoRealizado.trim().length > 0 &&
    firmaResponsable.trim().length > 0 &&
    !!firmaDataUrl;

  async function confirmarFinalizacion() {
    setEnviando(true);
    try {
      let firmaId: string | null = null;
      if (firmaDataUrl) {
        const archivoFirma = dataUrlAFile(firmaDataUrl, `firma-${ot!.numero}.png`);
        const subida = await subirArchivo(archivoFirma);
        firmaId = subida.id;
      }
      await finalizarOt(ot!.id, {
        trabajoRealizado: trabajoRealizado.trim(),
        horometroCierre: Number(horometroCierre),
        costoManoObra: Number(costoManoObra) || 0,
        checklist: ot!.checklist,
        fotos,
        repuestosUsados,
        firmaId,
        firmaResponsable: firmaResponsable.trim()
      });
      toast.exito(`${ot!.numero} finalizada.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)", maxWidth: 720 }}>
      <EstadoCarga cargando={false} error={errorCarga} />
      {/* flexWrap: en celular el botón Volver baja y las etiquetas pasan bajo el título. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--ds-space-3)" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "var(--ds-space-2) var(--ds-space-3)" }}>
            <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0, whiteSpace: "nowrap" }}>{ot.numero}</h1>
            <Pill tone={ESTADO_TONO[ot.estado]}>{ESTADO_LABEL[ot.estado]}</Pill>
            <Pill tone="gray">{TIPO_LABEL[ot.tipo]}</Pill>
          </div>
          <div style={{ color: "var(--ds-color-gray-500)", marginTop: 4 }}>
            {ot.titulo} — {equipo?.nombre}
          </div>
        </div>
        <Button label="Volver" color="white" onClick={() => router.push("/mantenimiento/ordenes")} />
      </div>

      <Seccion titulo="Información general">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--ds-space-3)", fontSize: "var(--ds-font-size-body-md)" }}>
          <div>
            <strong>Prioridad:</strong> {ot.prioridad}
          </div>
          <div>
            <strong>Responsable:</strong> {ot.responsable || "—"}
          </div>
          <div>
            <strong>Horómetro apertura:</strong> {ot.horometroApertura} h
          </div>
          <div>
            <strong>Fecha apertura:</strong> {new Date(ot.fechaApertura).toLocaleString("es-CR")}
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <strong>Descripción:</strong> {ot.descripcion || "—"}
          </div>
          {ot.estado === "cancelada" && (
            <div style={{ gridColumn: "1 / -1", color: "var(--ds-color-red-200)" }}>
              <strong>Motivo de cancelación:</strong> {ot.motivoCancelacion}
            </div>
          )}
        </div>
      </Seccion>

      {puedeEjecutar && (ot.estado === "abierta" || ot.estado === "en_proceso") && (
        <Seccion titulo="Acciones">
          <div style={{ display: "flex", gap: "var(--ds-space-3)", flexWrap: "wrap", alignItems: "center" }}>
            {ot.estado === "abierta" && <Button label="Iniciar OT" color="green" onClick={confirmarInicio} />}
            {!mostrandoCancelar ? (
              <Button label="Cancelar OT" color="red" onClick={() => setMostrandoCancelar(true)} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)", width: "100%" }}>
                <FormTextarea label="Motivo de la cancelación" value={motivoCancelacion} onChange={(e) => setMotivoCancelacion(e.target.value)} rows={2} />
                <div style={{ display: "flex", gap: "var(--ds-space-2)" }}>
                  <Button label="Confirmar cancelación" color="red" onClick={confirmarCancelacion} />
                  <Button label="Volver" color="white" onClick={() => setMostrandoCancelar(false)} />
                </div>
              </div>
            )}
          </div>
        </Seccion>
      )}

      {(ot.estado === "en_proceso" || soloLectura) && (
        <>
          <Seccion titulo="Checklist">
            <ChecklistBox checklist={ot.checklist} onToggle={toggleChecklistItem} readOnly={soloLectura} />
          </Seccion>

          <Seccion titulo="Repuestos usados">
            {!soloLectura && (
              <div style={{ color: "var(--ds-color-gray-400)", fontSize: "var(--ds-font-size-body-sm)", marginBottom: "var(--ds-space-3)" }}>
                Estas líneas se descuentan de bodega recién al finalizar la OT.
              </div>
            )}
            <RepuestosUsadosBox lineas={repuestosUsados} repuestosDisponibles={repuestos} onAdd={agregarRepuesto} onRemove={quitarRepuesto} readOnly={soloLectura} />
          </Seccion>

          <Seccion titulo="Evidencia fotográfica">
            <PhotoGallery fotos={fotos} onAdd={agregarFoto} onRemove={quitarFoto} readOnly={soloLectura} />
          </Seccion>

          {soloLectura ? (
            <Seccion titulo="Cierre">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)" }}>
                <div>
                  <strong>Trabajo realizado:</strong> {ot.trabajoRealizado || "—"}
                </div>
                <div>
                  <strong>Horómetro de cierre:</strong> {ot.horometroCierre ?? "—"} h
                </div>
                <div>
                  <strong>Costo de mano de obra:</strong> ₡{ot.costoManoObra.toLocaleString("es-CR")}
                </div>
                {ot.firmaResponsable && (
                  <div>
                    <strong>Firmado por:</strong> {ot.firmaResponsable}
                    {ot.firmaFecha && ` — ${new Date(ot.firmaFecha).toLocaleString("es-CR")}`}
                    {ot.firmaId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/mantenimiento/blob/${ot.firmaId}`} alt="Firma" style={{ display: "block", marginTop: 8, maxWidth: 240, background: "var(--ds-color-white)", borderRadius: "var(--ds-radius-md)" }} />
                    )}
                  </div>
                )}
              </div>
            </Seccion>
          ) : (
            <Seccion titulo="Cierre de la OT">
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-4)" }}>
                <FormTextarea label="Trabajo realizado" value={trabajoRealizado} onChange={(e) => setTrabajoRealizado(e.target.value)} />
                <FormField label="Horómetro de cierre" type="number" value={horometroCierre} onChange={(e) => setHorometroCierre(e.target.value)} />
                <FormField label="Costo de mano de obra" type="number" value={costoManoObra} onChange={(e) => setCostoManoObra(e.target.value)} />
                <FormField label="Nombre de quien firma" value={firmaResponsable} onChange={(e) => setFirmaResponsable(e.target.value)} />
                <div>
                  <label style={{ fontSize: "var(--ds-font-size-label)", display: "block", marginBottom: "var(--ds-space-2)" }}>Firma</label>
                  <SignaturePad onChange={setFirmaDataUrl} />
                </div>
                <div>
                  <SlideButton
                    label={enviando ? "Guardando..." : "Deslizar para finalizar"}
                    confirmedLabel="Finalizada"
                    mode="guardar"
                    onConfirm={confirmarFinalizacion}
                    disabled={!puedeFinalizar || enviando}
                  />
                  {!puedeFinalizar && (
                    <div style={{ color: "var(--ds-color-gray-400)", fontSize: "var(--ds-font-size-body-sm)", marginTop: "var(--ds-space-2)" }}>
                      Completá trabajo realizado, horómetro de cierre y firma para poder finalizar.
                    </div>
                  )}
                </div>
              </div>
            </Seccion>
          )}
        </>
      )}
    </div>
  );
}
