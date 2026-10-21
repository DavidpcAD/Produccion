"use client";

// NOT-IN-DS: ficha del equipo (pantalla Equipos → detalle).
// - FichaEncabezado: código, estado, nombre, marca/modelo/año y una franja
//   con lo que se mira primero: horómetro, kilometraje, próximo
//   mantenimiento y fallas.
// - FichaTecnica: TODOS los datos del equipo agrupados en bloques (antes
//   iban en una línea gris y varios no se mostraban: serie, filtros, llantas).
// - FallasEquipo: últimas fallas del equipo + enlace al historial completo.

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { Pill } from "@/components/mantenimiento/local/Table";
import { nombreTipo } from "@/lib/mantenimiento/fallas";
import type { Equipo, EstadoEquipo, OrdenTrabajo, TipoFalla } from "@/lib/mantenimiento/types";
import "./FichaEquipo.css";

const ESTADO_TONO: Record<EstadoEquipo, "green" | "yellow" | "red"> = { operativo: "green", mantenimiento: "yellow", fuera_servicio: "red" };
const ESTADO_LABEL: Record<EstadoEquipo, string> = { operativo: "Operativo", mantenimiento: "Mantenimiento", fuera_servicio: "Fuera de servicio" };
const MAX_FALLAS = 5;

function texto(valor: string | number | null | undefined): ReactNode {
  const limpio = valor == null ? "" : String(valor).trim();
  return limpio ? limpio : <span className="mnt-ficha__vacio">—</span>;
}
const numero = (n: number | null | undefined, unidad: string) => (n == null || n === 0 ? null : `${n.toLocaleString("es-CR")} ${unidad}`);

export function FichaEncabezado({
  equipo,
  proximoMantenimiento,
  fallas12Meses,
  sinClasificar,
  onVolver
}: {
  equipo: Equipo;
  /** Etiquetas de "próximo mantenimiento" (horas / km / fecha), ya calculadas por la pantalla. */
  proximoMantenimiento: ReactNode;
  fallas12Meses: number;
  sinClasificar: number;
  onVolver: () => void;
}) {
  const detalle = [equipo.marca, equipo.modelo, equipo.anio ? String(equipo.anio) : ""].filter((v) => v && v.trim()).join(" · ");
  return (
    <section className="mnt-ficha">
      <div className="mnt-ficha__cabeza">
        <div className="mnt-ficha__id">
          <div className="mnt-ficha__etiquetas">
            <span className="mnt-ficha__codigo">{equipo.codigo}</span>
            <Pill tone={ESTADO_TONO[equipo.estado]}>{ESTADO_LABEL[equipo.estado]}</Pill>
            {equipo.tipo && <span className="mnt-ficha__tipo">{equipo.tipo}</span>}
          </div>
          <h1 className="mnt-ficha__nombre">{equipo.nombre}</h1>
          {(detalle || equipo.placa) && (
            <div className="mnt-ficha__detalle">
              {detalle}
              {detalle && equipo.placa ? " · " : ""}
              {equipo.placa ? `Placa ${equipo.placa}` : ""}
            </div>
          )}
        </div>
        <Button label="Volver a Equipos" color="white" onClick={onVolver} />
      </div>

      <dl className="mnt-ficha__resumen">
        <div className="mnt-ficha__dato">
          <dt>Horómetro</dt>
          <dd className="mnt-ficha__cifra">{equipo.horometroActual.toLocaleString("es-CR")} h</dd>
        </div>
        <div className="mnt-ficha__dato">
          <dt>Kilometraje</dt>
          <dd className="mnt-ficha__cifra">{equipo.kilometraje != null ? `${equipo.kilometraje.toLocaleString("es-CR")} km` : <span className="mnt-ficha__vacio">—</span>}</dd>
        </div>
        <div className="mnt-ficha__dato">
          <dt>Próximo mantenimiento</dt>
          <dd>{proximoMantenimiento}</dd>
        </div>
        <div className="mnt-ficha__dato">
          <dt>Fallas (12 meses)</dt>
          <dd>
            <span className="mnt-ficha__cifra">{fallas12Meses}</span>
            {sinClasificar > 0 && <span className="mnt-ficha__nota"> · {sinClasificar} sin clasificar</span>}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Bloque({ titulo, filas }: { titulo: string; filas: [string, ReactNode][] }) {
  return (
    <div className="mnt-ficha__bloque">
      <h3 className="mnt-ficha__bloque-titulo">{titulo}</h3>
      <dl className="mnt-ficha__lista">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="mnt-ficha__fila">
            <dt>{etiqueta}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function FichaTecnica({ equipo }: { equipo: Equipo }) {
  return (
    <section className="mnt-ficha mnt-ficha--tecnica" aria-label="Ficha técnica">
      <h2 className="mnt-ficha__seccion">Ficha técnica</h2>
      <div className="mnt-ficha__bloques">
        <Bloque
          titulo="Identificación"
          filas={[
            ["Código", texto(equipo.codigo)],
            ["Tipo", texto(equipo.tipo)],
            ["Marca", texto(equipo.marca)],
            ["Modelo", texto(equipo.modelo)],
            ["Año", texto(equipo.anio)],
            ["N.º de serie", texto(equipo.numeroSerie)],
            ["Placa", texto(equipo.placa)],
            ["Cilindraje", texto(equipo.cilindraje)]
          ]}
        />
        <Bloque
          titulo="Operación"
          filas={[
            ["Estado", <Pill key="estado" tone={ESTADO_TONO[equipo.estado]}>{ESTADO_LABEL[equipo.estado]}</Pill>],
            ["Ubicación", texto(equipo.ubicacion)],
            ["Ingreso", texto(equipo.fechaIngreso)],
            ["Combustible", texto(equipo.combustible)],
            ["Revisión técnica", texto(equipo.revisionTecnica)]
          ]}
        />
        <Bloque
          titulo="Mantenimiento"
          filas={[
            ["Intervalo preventivo", texto(numero(equipo.intervaloHorasPreventivo, "h"))],
            ["Intervalo por km", texto(numero(equipo.intervaloKilometrajePreventivo, "km"))],
            ["Último mantenimiento", texto(equipo.ultimaFechaMantenimiento)],
            ["Próximo (fecha)", texto(equipo.proximaFechaMantenimiento)]
          ]}
        />
        <Bloque
          titulo="Consumibles y llantas"
          filas={[
            ["Filtro de aceite", texto(equipo.filtroAceite)],
            ["Filtro diésel", texto(equipo.filtroDiesel)],
            ["Filtro A/C", texto(equipo.filtroAireAcondicionado)],
            ["Llantas delanteras", texto(equipo.llantasDelanteras)],
            ["Llantas traseras", texto(equipo.llantasTraseras)]
          ]}
        />
      </div>
      {equipo.notas?.trim() && (
        <div className="mnt-ficha__notas">
          <h3 className="mnt-ficha__bloque-titulo">Notas</h3>
          <p>{equipo.notas}</p>
        </div>
      )}
    </section>
  );
}

export function FallasEquipo({ equipoId, fallas, tipos }: { equipoId: string; fallas: OrdenTrabajo[]; tipos: TipoFalla[] }) {
  const recientes = [...fallas].sort((a, b) => new Date(b.fechaApertura).getTime() - new Date(a.fechaApertura).getTime()).slice(0, MAX_FALLAS);
  const porTipo = new Map<string, number>();
  for (const ot of fallas) {
    const nombre = nombreTipo(ot.tipoFallaId, tipos);
    porTipo.set(nombre, (porTipo.get(nombre) ?? 0) + 1);
  }
  return (
    <section className="mnt-ficha" aria-labelledby="fallas-equipo">
      <div className="mnt-ficha__cabeza">
        <div>
          <h2 id="fallas-equipo" className="mnt-ficha__seccion">Historial de fallas</h2>
          <div className="mnt-ficha__nota">Órdenes correctivas y las clasificadas como falla.</div>
        </div>
        <Link href={`/mantenimiento/fallas?equipo=${equipoId}`} className="mnt-ficha__enlace">
          Ver gráfico e historial completo
        </Link>
      </div>
      {fallas.length === 0 ? (
        <div className="mnt-ficha__vacio" style={{ marginTop: "var(--ds-space-3)" }}>
          Este equipo no tiene fallas registradas.
        </div>
      ) : (
        <>
          <ul className="mnt-ficha__chips" aria-label="Fallas por tipo">
            {[...porTipo.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([nombre, n]) => (
                <li key={nombre}>
                  {nombre} <strong>{n}</strong>
                </li>
              ))}
          </ul>
          <ol className="mnt-ficha__fallas">
            {recientes.map((ot) => (
              <li key={ot.id}>
                <Link href={`/mantenimiento/ordenes/${ot.id}`} className="mnt-ficha__falla">
                  <span className="mnt-ficha__falla-fecha">{new Date(ot.fechaApertura).toLocaleDateString("es-CR")}</span>
                  <span className="mnt-ficha__falla-texto">
                    <strong>{ot.numero}</strong> · {ot.titulo}
                  </span>
                  <span className={ot.tipoFallaId ? "mnt-ficha__falla-tipo" : "mnt-ficha__falla-tipo mnt-ficha__falla-tipo--sin"}>
                    {nombreTipo(ot.tipoFallaId, tipos)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {fallas.length > MAX_FALLAS && (
            <div className="mnt-ficha__nota" style={{ marginTop: "var(--ds-space-2)" }}>
              Mostrando las {MAX_FALLAS} más recientes de {fallas.length}.
            </div>
          )}
        </>
      )}
    </section>
  );
}
