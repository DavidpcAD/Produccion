"use client";

// NOT-IN-DS: piezas de la pantalla de Inspección diaria. Cada actividad se
// responde con dos botones grandes (Bien / Falla) en vez de una casilla y un
// campo de observación siempre abierto: se lee de un vistazo qué falta y se
// toca fácil con guantes desde el celular. "Falla" abre el campo para contar
// qué se encontró. Al guardar, Bien -> hecho: true; Falla -> hecho: false con
// observación (mismo formato que ya espera /api/inspeccionesDiarias).

import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";
import { FormField } from "@/components/mantenimiento/ds/Form/Form";
import type { ChecklistDiarioItem, Equipo } from "@/lib/mantenimiento/types";
import "./ChecklistInspeccion.css";

export type EstadoRespuesta = "pendiente" | "bien" | "falla";

export interface RespuestaChecklist {
  itemId: string;
  titulo: string;
  estado: EstadoRespuesta;
  observacion: string;
}

// Lo que falta para poder guardar: actividades sin responder y fallas sin
// describir. La pantalla lo usa para habilitar el botón y explicar por qué no.
export function faltantesChecklist(respuestas: RespuestaChecklist[]) {
  return {
    sinResponder: respuestas.filter((r) => r.estado === "pendiente").length,
    fallasSinDetalle: respuestas.filter((r) => r.estado === "falla" && !r.observacion.trim()).length
  };
}

export function EquipoResumen({
  equipo,
  horometro,
  onHorometro
}: {
  equipo: Equipo;
  horometro: string;
  onHorometro: (valor: string) => void;
}) {
  const detalle = [equipo.marca, equipo.modelo].filter(Boolean).join(" ");
  return (
    <section className="mnt-insp-card mnt-insp-equipo">
      <div className="mnt-insp-equipo__id">
        <span className="mnt-insp-equipo__codigo">{equipo.codigo}</span>
        <div className="mnt-insp-equipo__nombre">{equipo.nombre}</div>
        {(detalle || equipo.placa) && (
          <div className="mnt-insp-equipo__meta">
            {detalle}
            {detalle && equipo.placa && " · "}
            {equipo.placa && `Placa ${equipo.placa}`}
          </div>
        )}
      </div>
      <div className="mnt-insp-equipo__horometro">
        <FormField label="Horómetro" type="number" value={horometro} onChange={(e) => onHorometro(e.target.value)} />
      </div>
    </section>
  );
}

export function ChecklistInspeccion({
  items,
  respuestas,
  onEstado,
  onObservacion
}: {
  items: ChecklistDiarioItem[];
  respuestas: RespuestaChecklist[];
  onEstado: (itemId: string, estado: EstadoRespuesta) => void;
  onObservacion: (itemId: string, texto: string) => void;
}) {
  const total = items.length;
  const bien = respuestas.filter((r) => r.estado === "bien").length;
  const falla = respuestas.filter((r) => r.estado === "falla").length;
  const pendientes = total - bien - falla;

  return (
    <section className="mnt-insp-card mnt-chk">
      <header className="mnt-chk__head">
        <div>
          <h2 className="mnt-chk__title">Checklist antes de arrancar</h2>
          <p className="mnt-chk__sub">Revisá cada punto y marcalo como Bien o Falla.</p>
        </div>
        <div className="mnt-chk__count" aria-label={`${bien + falla} de ${total} revisadas`}>
          <strong>{bien + falla}</strong>/{total}
        </div>
      </header>

      <div
        className="mnt-chk__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={bien + falla}
        aria-label="Avance del checklist"
      >
        {bien > 0 && <span className="mnt-chk__progress-bien" style={{ flexGrow: bien }} />}
        {falla > 0 && <span className="mnt-chk__progress-falla" style={{ flexGrow: falla }} />}
        {pendientes > 0 && <span className="mnt-chk__progress-pendiente" style={{ flexGrow: pendientes }} />}
      </div>
      <p className="mnt-chk__resumen">
        <span>{bien} bien</span>
        <span aria-hidden="true">·</span>
        <span>{falla} con falla</span>
        <span aria-hidden="true">·</span>
        <span>{pendientes} por revisar</span>
      </p>

      <ol className="mnt-chk__lista">
        {items.map((item, indice) => {
          const respuesta = respuestas.find((r) => r.itemId === item.id);
          const estado = respuesta?.estado ?? "pendiente";
          return (
            <li key={item.id} className={`mnt-chk__item mnt-chk__item--${estado}`}>
              <span className="mnt-chk__marca" aria-hidden="true">
                {estado === "bien" ? (
                  <Icon name="check" size="sm" color="var(--ds-color-black)" />
                ) : estado === "falla" ? (
                  <Icon name="alert" size="sm" color="var(--ds-color-white)" />
                ) : (
                  indice + 1
                )}
              </span>
              <div className="mnt-chk__texto">
                <span className="mnt-chk__titulo">{item.titulo}</span>
                {item.detalle && <span className="mnt-chk__detalle">{item.detalle}</span>}
              </div>
              <div className="mnt-chk__opciones" role="group" aria-label={`Estado de ${item.titulo}`}>
                <button
                  type="button"
                  className="mnt-chk__btn mnt-chk__btn--bien"
                  aria-pressed={estado === "bien"}
                  onClick={() => onEstado(item.id, estado === "bien" ? "pendiente" : "bien")}
                >
                  <Icon name="check" size="sm" />
                  Bien
                </button>
                <button
                  type="button"
                  className="mnt-chk__btn mnt-chk__btn--falla"
                  aria-pressed={estado === "falla"}
                  onClick={() => onEstado(item.id, estado === "falla" ? "pendiente" : "falla")}
                >
                  <Icon name="alert" size="sm" />
                  Falla
                </button>
              </div>
              {estado === "falla" && (
                <div className="mnt-chk__obs">
                  <FormField
                    label="¿Qué encontraste?"
                    placeholder="Ej.: fuga de aceite en la manguera"
                    value={respuesta?.observacion ?? ""}
                    onChange={(e) => onObservacion(item.id, e.target.value)}
                    state={respuesta?.observacion.trim() ? "standard" : "ayuda"}
                    helperText={respuesta?.observacion.trim() ? undefined : "Obligatorio para guardar una falla"}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
