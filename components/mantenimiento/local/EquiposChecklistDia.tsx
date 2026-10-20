"use client";

// NOT-IN-DS: líneas por día hábil (lunes a viernes) con cuántos equipos
// quedaron con el checklist COMPLETO (pueden iniciar), cuántos CON FALLA y
// cuántos SIN CHECKLIST. Rango 7 / 15 / 30 días o el mes en curso. SVG a mano,
// sin librería de charts (igual que MiniBarChart).
//
// Reglas de conteo (por equipo y por día LOCAL, Costa Rica):
// - Si un equipo tiene varias inspecciones el mismo día, cuenta la última.
// - Completo = todas las actividades en "Bien" (hecho: true). Si alguna quedó
//   en "Falla" (hecho: false), cuenta como Con falla.
// - Sin checklist = equipos en estado "operativo" sin inspección ese día. Se
//   usa el estado ACTUAL del equipo también para días pasados (no hay
//   historial de estados).

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useAppStore } from "@/lib/mantenimiento/store";
import { apiGet, aplanarDocs } from "@/lib/mantenimiento/api";
import type { InspeccionDiaria } from "@/lib/mantenimiento/types";
import "./EquiposChecklistDia.css";

type Rango = 7 | 15 | 30 | "mes";
const RANGOS: { valor: Rango; etiqueta: string }[] = [
  { valor: 7, etiqueta: "7 días" },
  { valor: 15, etiqueta: "15 días" },
  { valor: 30, etiqueta: "30 días" },
  { valor: "mes", etiqueta: "Mes" }
];

const SERIES = [
  { clave: "completo", etiqueta: "Completo (puede iniciar)", corta: "Completo" },
  { clave: "falla", etiqueta: "Con falla", corta: "Con falla" },
  { clave: "sin", etiqueta: "Sin checklist", corta: "Sin checklist" }
] as const;
type ClaveSerie = (typeof SERIES)[number]["clave"];

// Lunes = L, martes = K (convención en Costa Rica), miércoles = M ...
const LETRA_DIA = ["D", "L", "K", "M", "J", "V", "S"];
const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const REFRESCO_MS = 60_000;

interface Dia {
  fecha: Date;
  completo: number;
  falla: number;
  sin: number;
  inspecciones: number;
  hoy: boolean;
}

function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function sumarDias(fecha: Date, dias: number): Date {
  const otra = new Date(fecha);
  otra.setDate(otra.getDate() + dias);
  return otra;
}

function claveDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
}

function primerDia(rango: Rango, hoy: Date): Date {
  return rango === "mes" ? new Date(hoy.getFullYear(), hoy.getMonth(), 1) : sumarDias(hoy, -(rango - 1));
}

// Paso "redondo" del eje para 3-5 líneas de guía.
function escala(maximo: number): { tope: number; paso: number } {
  const paso = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find((p) => maximo / p <= 4) ?? Math.ceil(maximo / 4);
  return { tope: Math.max(paso * 2, Math.ceil(maximo / paso) * paso), paso };
}

const M = { arriba: 24, derecha: 40, abajo: 44, izquierda: 36 };
const ALTO = 300;

export function EquiposChecklistDia() {
  const { equipos } = useAppStore();
  const [rango, setRango] = useState<Rango>(15);
  const [inspecciones, setInspecciones] = useState<InspeccionDiaria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verTabla, setVerTabla] = useState(false);
  const [activo, setActivo] = useState<number | null>(null);
  const [ancho, setAncho] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const hoy = useMemo(() => inicioDelDia(new Date()), []);
  const desde = useMemo(() => primerDia(rango, hoy), [rango, hoy]);

  function cambiarRango(nuevo: Rango) {
    if (nuevo === rango) return;
    setCargando(true);
    setActivo(null);
    setRango(nuevo);
  }

  useEffect(() => {
    // "vigente" descarta la respuesta de un rango que ya se dejó de mirar.
    let vigente = true;
    const url =
      `/api/inspeccionesDiarias?desde=${encodeURIComponent(desde.toISOString())}` +
      `&hasta=${encodeURIComponent(sumarDias(hoy, 1).toISOString())}`;
    const traer = () =>
      apiGet(url)
        .then((r) => {
          if (!vigente) return;
          setInspecciones(aplanarDocs<InspeccionDiaria>(r));
          setError(null);
        })
        .catch((err) => vigente && setError((err as Error).message))
        .finally(() => vigente && setCargando(false));
    traer();
    const intervalo = setInterval(traer, REFRESCO_MS);
    return () => {
      vigente = false;
      clearInterval(intervalo);
    };
  }, [desde, hoy]);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => setAncho(entrada.contentRect.width));
    observador.observe(el);
    return () => observador.disconnect();
  }, [verTabla]);

  const operativos = useMemo(() => equipos.filter((e) => e.estado === "operativo").map((e) => e.id), [equipos]);

  const dias: Dia[] = useMemo(() => {
    // Última inspección de cada equipo por día.
    const porDia = new Map<string, Map<string, InspeccionDiaria>>();
    for (const insp of inspecciones) {
      const clave = claveDia(new Date(insp.fecha));
      const delDia = porDia.get(clave) ?? new Map<string, InspeccionDiaria>();
      const previa = delDia.get(insp.equipoId);
      if (!previa || new Date(insp.fecha) > new Date(previa.fecha)) delDia.set(insp.equipoId, insp);
      porDia.set(clave, delDia);
    }
    const conteoInspecciones = new Map<string, number>();
    for (const insp of inspecciones) {
      const clave = claveDia(new Date(insp.fecha));
      conteoInspecciones.set(clave, (conteoInspecciones.get(clave) ?? 0) + 1);
    }

    const lista: Dia[] = [];
    for (let fecha = desde; fecha <= hoy; fecha = sumarDias(fecha, 1)) {
      const diaSemana = fecha.getDay();
      if (diaSemana === 0 || diaSemana === 6) continue;
      const delDia = porDia.get(claveDia(fecha)) ?? new Map<string, InspeccionDiaria>();
      let completo = 0;
      let falla = 0;
      delDia.forEach((insp) => (insp.checklist.every((c) => c.hecho) ? completo++ : falla++));
      const sin = operativos.filter((id) => !delDia.has(id)).length;
      lista.push({
        fecha,
        completo,
        falla,
        sin,
        inspecciones: conteoInspecciones.get(claveDia(fecha)) ?? 0,
        hoy: fecha.getTime() === hoy.getTime()
      });
    }
    return lista;
  }, [inspecciones, desde, hoy, operativos]);

  // ── Geometría ──
  const anchoPlot = Math.max(0, ancho - M.izquierda - M.derecha);
  const altoPlot = ALTO - M.arriba - M.abajo;
  const { tope, paso } = escala(Math.max(1, ...dias.flatMap((d) => [d.completo, d.falla, d.sin])));
  const guias = Array.from({ length: tope / paso + 1 }, (_, i) => i * paso);
  const separacion = dias.length > 1 ? anchoPlot / (dias.length - 1) : 0;
  const x = (i: number) => M.izquierda + (dias.length > 1 ? i * separacion : anchoPlot / 2);
  const y = (valor: number) => M.arriba + altoPlot - (valor / tope) * altoPlot;
  const cadaCuanto = separacion < 26 ? 2 : 1; // en pantallas angostas, una etiqueta del eje sí y otra no

  const linea = (clave: ClaveSerie) => dias.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d[clave])}`).join(" ");
  const area =
    dias.length > 0 ? `${linea("completo")} L${x(dias.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : "";

  // Rótulo solo al final de cada línea. Si dos quedan encimados no se apilan:
  // se deja el de la serie más importante y el resto queda en tooltip y tabla.
  const ultimo = dias[dias.length - 1];
  const rotulosFinales = ultimo
    ? SERIES.reduce<{ clave: ClaveSerie; valor: number; y: number }[]>((acc, s) => {
        const yy = y(ultimo[s.clave]);
        if (acc.every((r) => Math.abs(r.y - yy) >= 14)) acc.push({ clave: s.clave, valor: ultimo[s.clave], y: yy });
        return acc;
      }, [])
    : [];

  function indiceCercano(e: PointerEvent<SVGRectElement>) {
    if (!dias.length) return null;
    const caja = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = e.clientX - caja.left;
    return Math.min(dias.length - 1, Math.max(0, Math.round((px - M.izquierda) / (separacion || 1))));
  }

  function teclado(e: KeyboardEvent<SVGRectElement>) {
    if (!dias.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const base = activo ?? (e.key === "ArrowRight" ? -1 : dias.length);
      setActivo(Math.min(dias.length - 1, Math.max(0, base + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Escape") {
      setActivo(null);
    }
  }

  const diaActivo = activo != null ? dias[activo] : null;
  const tipALaIzquierda = activo != null && x(activo) > ancho * 0.6;

  return (
    <section className={`mnt-hab${cargando ? " mnt-hab--cargando" : ""}`} aria-busy={cargando}>
      <header className="mnt-hab__head">
        <div>
          <h2 className="mnt-hab__title">Checklist por día</h2>
          <p className="mnt-hab__sub">
            Equipos que pueden iniciar · lunes a viernes · {operativos.length} equipos operativos
          </p>
        </div>
        <ul className="mnt-hab__leyenda" aria-label="Leyenda">
          {SERIES.map((s) => (
            <li key={s.clave}>
              <span className={`mnt-hab__clave mnt-hab__clave--${s.clave}`} aria-hidden="true" />
              {s.etiqueta}
            </li>
          ))}
        </ul>
      </header>

      <div className="mnt-hab__filtros">
        <div className="mnt-hab__rangos" role="group" aria-label="Rango de fechas">
          {RANGOS.map((r) => (
            <button
              key={r.etiqueta}
              type="button"
              className="mnt-hab__rango"
              aria-pressed={rango === r.valor}
              onClick={() => cambiarRango(r.valor)}
            >
              {r.etiqueta}
            </button>
          ))}
        </div>
        <button type="button" className="mnt-hab__vista" onClick={() => setVerTabla((v) => !v)}>
          {verTabla ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {error && <p className="mnt-hab__error">No se pudieron cargar las inspecciones: {error}</p>}

      {verTabla ? (
        <div className="mnt-hab__tabla-wrap">
          <table className="mnt-hab__tabla">
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Completo</th>
                <th scope="col">Con falla</th>
                <th scope="col">Sin checklist</th>
                <th scope="col">Inspecciones</th>
              </tr>
            </thead>
            <tbody>
              {[...dias].reverse().map((d) => (
                <tr key={d.fecha.getTime()} className={d.hoy ? "mnt-hab__fila-hoy" : undefined}>
                  <th scope="row">
                    {NOMBRE_DIA[d.fecha.getDay()]} {d.fecha.getDate()} {MESES[d.fecha.getMonth()]}
                  </th>
                  <td>{d.completo}</td>
                  <td>{d.falla}</td>
                  <td>{d.sin}</td>
                  <td>{d.inspecciones}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mnt-hab__grafico" ref={contenedor}>
          {ancho > 0 && (
            <svg width={ancho} height={ALTO} role="img" aria-label="Equipos con checklist completo, con falla y sin checklist por día">
              {/* Columna de hoy */}
              {dias.map((d, i) =>
                d.hoy ? (
                  <rect
                    key="hoy"
                    className="mnt-hab__hoy"
                    x={x(i) - Math.max(10, Math.min(separacion, 48)) / 2}
                    y={M.arriba}
                    width={Math.max(20, Math.min(separacion, 48))}
                    height={altoPlot}
                    rx={6}
                  />
                ) : null
              )}

              {guias.map((v) => (
                <g key={v}>
                  <line className="mnt-hab__guia" x1={M.izquierda} x2={ancho - M.derecha} y1={y(v)} y2={y(v)} />
                  <text className="mnt-hab__tick" x={M.izquierda - 8} y={y(v)} dy="0.32em" textAnchor="end">
                    {v}
                  </text>
                </g>
              ))}

              <path className="mnt-hab__area" d={area} />
              <path className="mnt-hab__linea mnt-hab__linea--sin" d={linea("sin")} />
              <path className="mnt-hab__linea mnt-hab__linea--falla" d={linea("falla")} />
              <path className="mnt-hab__linea mnt-hab__linea--completo" d={linea("completo")} />

              {(["sin", "falla", "completo"] as ClaveSerie[]).map((clave) =>
                dias.map((d, i) => (
                  <circle
                    key={`${clave}-${i}`}
                    className={`mnt-hab__punto mnt-hab__punto--${clave}`}
                    cx={x(i)}
                    cy={y(d[clave])}
                    r={activo === i ? 5.5 : 4}
                  />
                ))
              )}

              {rotulosFinales.map((r) => (
                <text key={r.clave} className="mnt-hab__rotulo" x={x(dias.length - 1) + 10} y={r.y} dy="0.32em">
                  {r.valor}
                </text>
              ))}

              {dias.map((d, i) =>
                i % cadaCuanto === (dias.length - 1) % cadaCuanto ? (
                  <text key={i} className={`mnt-hab__ejex${d.hoy ? " mnt-hab__ejex--hoy" : ""}`} x={x(i)} y={ALTO - M.abajo + 18} textAnchor="middle">
                    <tspan x={x(i)}>{LETRA_DIA[d.fecha.getDay()]}</tspan>
                    <tspan x={x(i)} dy="1.25em">
                      {d.fecha.getDate()}
                    </tspan>
                  </text>
                ) : null
              )}

              {activo != null && (
                <line className="mnt-hab__cruz" x1={x(activo)} x2={x(activo)} y1={M.arriba} y2={M.arriba + altoPlot} />
              )}

              {/* Capa de interacción: la cruz busca el día más cercano al puntero. */}
              <rect
                className="mnt-hab__captura"
                x={M.izquierda - separacion / 2}
                y={M.arriba}
                width={anchoPlot + separacion}
                height={altoPlot}
                tabIndex={0}
                aria-label="Detalle por día: usá las flechas izquierda y derecha"
                onPointerMove={(e) => setActivo(indiceCercano(e))}
                onPointerLeave={() => setActivo(null)}
                onKeyDown={teclado}
                onBlur={() => setActivo(null)}
              />
            </svg>
          )}

          {diaActivo && activo != null && (
            <div
              className="mnt-hab__tip"
              role="status"
              style={
                tipALaIzquierda
                  ? { right: ancho - x(activo) + 14, top: M.arriba }
                  : { left: x(activo) + 14, top: M.arriba }
              }
            >
              <div className="mnt-hab__tip-dia">
                {NOMBRE_DIA[diaActivo.fecha.getDay()]} {diaActivo.fecha.getDate()} de {MESES[diaActivo.fecha.getMonth()]}
                {diaActivo.hoy && " · hoy"}
              </div>
              {SERIES.map((s) => (
                <div key={s.clave} className="mnt-hab__tip-fila">
                  <span className={`mnt-hab__clave mnt-hab__clave--${s.clave}`} aria-hidden="true" />
                  <strong>{diaActivo[s.clave]}</strong>
                  <span>{s.corta}</span>
                </div>
              ))}
              <div className="mnt-hab__tip-pie">
                {diaActivo.inspecciones} {diaActivo.inspecciones === 1 ? "inspección" : "inspecciones"} registradas
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
