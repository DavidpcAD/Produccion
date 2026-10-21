"use client";

// NOT-IN-DS: líneas de FALLAS por día (todos los días, también fines de
// semana: una falla puede pasar un sábado). Una línea por tipo de falla
// (los 3 con más fallas en el histórico, ver seriesDeFallas), "Otras" y
// "Sin clasificar". Mismo diseño que EquiposChecklistDia (Panel): rangos
// 7 / 15 / 30 días o el mes, cruz con detalle por día, rótulos al final de
// cada línea, columna de hoy y vista de tabla. SVG a mano, sin librería.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { serieDe, type SerieFalla } from "@/lib/mantenimiento/fallas";
import type { Equipo, OrdenTrabajo } from "@/lib/mantenimiento/types";
import "./FallasPorDia.css";

export type RangoFallas = 7 | 15 | 30 | "mes";
export const RANGOS_FALLAS: { valor: RangoFallas; etiqueta: string }[] = [
  { valor: 7, etiqueta: "7 días" },
  { valor: 15, etiqueta: "15 días" },
  { valor: 30, etiqueta: "30 días" },
  { valor: "mes", etiqueta: "Mes" }
];

// Lunes = L, martes = K (convención en Costa Rica), miércoles = M ...
const LETRA_DIA = ["D", "L", "K", "M", "J", "V", "S"];
const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

const M = { arriba: 24, derecha: 40, abajo: 44, izquierda: 36 };
const ALTO = 300;
const MAX_OTS_EN_DETALLE = 4;

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
export function desdeDeRango(rango: RangoFallas, hoy: Date): Date {
  return rango === "mes" ? new Date(hoy.getFullYear(), hoy.getMonth(), 1) : sumarDias(hoy, -(rango - 1));
}
// Paso "redondo" del eje para 3-5 líneas de guía.
function escala(maximo: number): { tope: number; paso: number } {
  const paso = [1, 2, 5, 10, 20, 25, 50, 100].find((p) => maximo / p <= 4) ?? Math.ceil(maximo / 4);
  return { tope: Math.max(paso * 2, Math.ceil(maximo / paso) * paso), paso };
}

interface Dia {
  fecha: Date;
  hoy: boolean;
  porSerie: Record<string, number>;
  total: number;
  ots: OrdenTrabajo[];
}

export function FallasPorDia({
  fallas,
  series,
  equipos,
  rango,
  onRango,
  subtitulo
}: {
  fallas: OrdenTrabajo[];
  series: SerieFalla[];
  equipos: Equipo[];
  rango: RangoFallas;
  onRango: (r: RangoFallas) => void;
  subtitulo: string;
}) {
  const [verTabla, setVerTabla] = useState(false);
  const [activo, setActivo] = useState<number | null>(null);
  const [ancho, setAncho] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const hoy = useMemo(() => inicioDelDia(new Date()), []);
  const desde = useMemo(() => desdeDeRango(rango, hoy), [rango, hoy]);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => setAncho(entrada.contentRect.width));
    observador.observe(el);
    return () => observador.disconnect();
  }, [verTabla]);

  const dias: Dia[] = useMemo(() => {
    const porClave = new Map<string, OrdenTrabajo[]>();
    for (const ot of fallas) {
      const clave = claveDia(new Date(ot.fechaApertura));
      porClave.set(clave, [...(porClave.get(clave) ?? []), ot]);
    }
    const lista: Dia[] = [];
    for (let fecha = desde; fecha <= hoy; fecha = sumarDias(fecha, 1)) {
      const delDia = porClave.get(claveDia(fecha)) ?? [];
      const porSerie: Record<string, number> = Object.fromEntries(series.map((s) => [s.clave, 0]));
      for (const ot of delDia) porSerie[serieDe(ot, series)] = (porSerie[serieDe(ot, series)] ?? 0) + 1;
      lista.push({ fecha, hoy: fecha.getTime() === hoy.getTime(), porSerie, total: delDia.length, ots: delDia });
    }
    return lista;
  }, [fallas, series, desde, hoy]);

  const total = dias.reduce((acc, d) => acc + d.total, 0);

  // ── Geometría ──
  const anchoPlot = Math.max(0, ancho - M.izquierda - M.derecha);
  const altoPlot = ALTO - M.arriba - M.abajo;
  const { tope, paso } = escala(Math.max(1, ...dias.flatMap((d) => series.map((s) => d.porSerie[s.clave] ?? 0))));
  const guias = Array.from({ length: tope / paso + 1 }, (_, i) => i * paso);
  const separacion = dias.length > 1 ? anchoPlot / (dias.length - 1) : 0;
  const x = (i: number) => M.izquierda + (dias.length > 1 ? i * separacion : anchoPlot / 2);
  const y = (valor: number) => M.arriba + altoPlot - (valor / tope) * altoPlot;
  const cadaCuanto = separacion < 26 ? 2 : 1;
  const linea = (clave: string) => dias.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.porSerie[clave] ?? 0)}`).join(" ");

  // Rótulo solo al final de cada línea; si dos se enciman no se apilan: queda
  // el de la serie con más fallas en el rango y el resto va en detalle/tabla.
  const ultimo = dias[dias.length - 1];
  const totalesSerie = Object.fromEntries(series.map((s) => [s.clave, dias.reduce((a, d) => a + (d.porSerie[s.clave] ?? 0), 0)]));
  const rotulosFinales = ultimo
    ? [...series]
        .sort((a, b) => totalesSerie[b.clave] - totalesSerie[a.clave])
        .reduce<{ clave: string; valor: number; y: number }[]>((acc, s) => {
          const yy = y(ultimo.porSerie[s.clave] ?? 0);
          if (acc.every((r) => Math.abs(r.y - yy) >= 14)) acc.push({ clave: s.clave, valor: ultimo.porSerie[s.clave] ?? 0, y: yy });
          return acc;
        }, [])
    : [];

  function indiceCercano(e: PointerEvent<SVGRectElement>) {
    if (!dias.length) return null;
    const caja = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    return Math.min(dias.length - 1, Math.max(0, Math.round((e.clientX - caja.left - M.izquierda) / (separacion || 1))));
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
  const nombreEquipo = (id: string) => equipos.find((e) => e.id === id)?.codigo ?? "—";

  return (
    <section className="mnt-fal">
      <header className="mnt-fal__head">
        <div>
          <h2 className="mnt-fal__title">Fallas por día</h2>
          <p className="mnt-fal__sub">{subtitulo}</p>
        </div>
        <ul className="mnt-fal__leyenda" aria-label="Leyenda">
          {series.map((s) => (
            <li key={s.clave}>
              <span className={`mnt-fal__clave mnt-fal__clave--${s.clase}`} aria-hidden="true" />
              {s.etiqueta}
            </li>
          ))}
        </ul>
      </header>

      <div className="mnt-fal__filtros">
        <div className="mnt-fal__rangos" role="group" aria-label="Rango de fechas">
          {RANGOS_FALLAS.map((r) => (
            <button key={r.etiqueta} type="button" className="mnt-fal__rango" aria-pressed={rango === r.valor} onClick={() => { setActivo(null); onRango(r.valor); }}>
              {r.etiqueta}
            </button>
          ))}
        </div>
        <span className="mnt-fal__total">
          <strong>{total}</strong> {total === 1 ? "falla" : "fallas"} en el rango
        </span>
        <button type="button" className="mnt-fal__vista" onClick={() => setVerTabla((v) => !v)}>
          {verTabla ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {verTabla ? (
        <div className="mnt-fal__tabla-wrap">
          <table className="mnt-fal__tabla">
            <thead>
              <tr>
                <th scope="col">Día</th>
                {series.map((s) => (
                  <th key={s.clave} scope="col">{s.etiqueta}</th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...dias].reverse().map((d) => (
                <tr key={d.fecha.getTime()} className={d.hoy ? "mnt-fal__fila-hoy" : undefined}>
                  <th scope="row">
                    {NOMBRE_DIA[d.fecha.getDay()]} {d.fecha.getDate()} {MESES[d.fecha.getMonth()]}
                  </th>
                  {series.map((s) => (
                    <td key={s.clave}>{d.porSerie[s.clave] ?? 0}</td>
                  ))}
                  <td>{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mnt-fal__grafico" ref={contenedor}>
          {ancho > 0 && (
            <svg width={ancho} height={ALTO} role="img" aria-label="Fallas por día y tipo de falla">
              {dias.map((d, i) =>
                d.hoy ? (
                  <rect
                    key="hoy"
                    className="mnt-fal__hoy"
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
                  <line className="mnt-fal__guia" x1={M.izquierda} x2={ancho - M.derecha} y1={y(v)} y2={y(v)} />
                  <text className="mnt-fal__tick" x={M.izquierda - 8} y={y(v)} dy="0.32em" textAnchor="end">
                    {v}
                  </text>
                </g>
              ))}

              {/* "Sin clasificar" y "Otras" abajo; los tipos con color, encima. */}
              {[...series].reverse().map((s) => (
                <path key={s.clave} className={`mnt-fal__linea mnt-fal__linea--${s.clase}`} d={linea(s.clave)} />
              ))}
              {[...series].reverse().map((s) =>
                dias.map((d, i) => (
                  <circle
                    key={`${s.clave}-${i}`}
                    className={`mnt-fal__punto mnt-fal__punto--${s.clase}`}
                    cx={x(i)}
                    cy={y(d.porSerie[s.clave] ?? 0)}
                    r={activo === i ? 5.5 : 4}
                  />
                ))
              )}

              {rotulosFinales.map((r) => (
                <text key={r.clave} className="mnt-fal__rotulo" x={x(dias.length - 1) + 10} y={r.y} dy="0.32em">
                  {r.valor}
                </text>
              ))}

              {dias.map((d, i) =>
                i % cadaCuanto === (dias.length - 1) % cadaCuanto ? (
                  <text key={i} className={`mnt-fal__ejex${d.hoy ? " mnt-fal__ejex--hoy" : ""}`} x={x(i)} y={ALTO - M.abajo + 18} textAnchor="middle">
                    <tspan x={x(i)}>{LETRA_DIA[d.fecha.getDay()]}</tspan>
                    <tspan x={x(i)} dy="1.25em">
                      {d.fecha.getDate()}
                    </tspan>
                  </text>
                ) : null
              )}

              {activo != null && <line className="mnt-fal__cruz" x1={x(activo)} x2={x(activo)} y1={M.arriba} y2={M.arriba + altoPlot} />}

              {/* Capa de interacción: la cruz busca el día más cercano al puntero. */}
              <rect
                className="mnt-fal__captura"
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
              className="mnt-fal__tip"
              role="status"
              style={tipALaIzquierda ? { right: ancho - x(activo) + 14, top: M.arriba } : { left: x(activo) + 14, top: M.arriba }}
            >
              <div className="mnt-fal__tip-dia">
                {NOMBRE_DIA[diaActivo.fecha.getDay()]} {diaActivo.fecha.getDate()} de {MESES[diaActivo.fecha.getMonth()]}
                {diaActivo.hoy && " · hoy"}
              </div>
              {series.map((s) => (
                <div key={s.clave} className="mnt-fal__tip-fila">
                  <span className={`mnt-fal__clave mnt-fal__clave--${s.clase}`} aria-hidden="true" />
                  <strong>{diaActivo.porSerie[s.clave] ?? 0}</strong>
                  <span>{s.etiqueta}</span>
                </div>
              ))}
              <div className="mnt-fal__tip-pie">
                {diaActivo.total === 0 ? (
                  "Sin fallas este día"
                ) : (
                  <>
                    {diaActivo.ots.slice(0, MAX_OTS_EN_DETALLE).map((ot) => (
                      <div key={ot.id}>
                        {ot.numero} · {nombreEquipo(ot.equipoId)}
                      </div>
                    ))}
                    {diaActivo.ots.length > MAX_OTS_EN_DETALLE && <div>y {diaActivo.ots.length - MAX_OTS_EN_DETALLE} más</div>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
