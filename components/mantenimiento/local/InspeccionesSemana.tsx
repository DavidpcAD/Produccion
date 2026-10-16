"use client";

// NOT-IN-DS: columnas de inspecciones diarias por día hábil (lunes a viernes)
// para el Panel, con navegación por semana. Sin librería de charts, igual que
// MiniBarChart: divs posicionados. Cada día muestra su detalle al pasar el mouse
// o al enfocarlo con teclado, y "Ver tabla" deja todos los números a la vista.
//
// Las fechas se guardan en UTC; acá se agrupan por día LOCAL (Costa Rica), así
// una inspección de las 7 p. m. cuenta para su día y no para el siguiente.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";
import { apiGet, aplanarDocs } from "@/lib/mantenimiento/api";
import type { InspeccionDiaria } from "@/lib/mantenimiento/types";
import "./InspeccionesSemana.css";

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const DIA_MS = 86_400_000;
const REFRESCO_MS = 30_000;

interface Dia {
  fecha: Date;
  inspecciones: number;
  equipos: number;
  conFallas: number;
  futuro: boolean;
  hoy: boolean;
}

function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function lunesDe(fecha: Date): Date {
  const dia = inicioDelDia(fecha);
  dia.setDate(dia.getDate() - ((dia.getDay() + 6) % 7));
  return dia;
}

function sumarDias(fecha: Date, dias: number): Date {
  const otra = new Date(fecha);
  otra.setDate(otra.getDate() + dias);
  return otra;
}

// Tope "redondo" del eje y su paso, para 2-4 líneas de guía limpias.
function escala(maximo: number): { tope: number; paso: number } {
  const paso = [1, 2, 5, 10, 20, 25, 50, 100].find((p) => maximo / p <= 4) ?? Math.ceil(maximo / 4);
  return { tope: Math.max(paso * 2, Math.ceil(maximo / paso) * paso), paso };
}

function rangoTexto(lunes: Date): string {
  const viernes = sumarDias(lunes, 4);
  return lunes.getMonth() === viernes.getMonth()
    ? `${lunes.getDate()} al ${viernes.getDate()} de ${MESES[viernes.getMonth()]}`
    : `${lunes.getDate()} de ${MESES[lunes.getMonth()]} al ${viernes.getDate()} de ${MESES[viernes.getMonth()]}`;
}

export function InspeccionesSemana() {
  const [semanasAtras, setSemanasAtras] = useState(0);
  const [inspecciones, setInspecciones] = useState<InspeccionDiaria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verTabla, setVerTabla] = useState(false);

  const lunes = useMemo(() => sumarDias(lunesDe(new Date()), -7 * semanasAtras), [semanasAtras]);

  // Al cambiar de semana se atenúa el gráfico actual hasta que llegan los datos.
  function irASemana(atras: number) {
    if (atras === semanasAtras) return;
    setCargando(true);
    setSemanasAtras(atras);
  }

  useEffect(() => {
    // "vigente" descarta la respuesta de una semana que ya se dejó de mirar.
    let vigente = true;
    // Lunes 00:00 local hasta sábado 00:00 local, en ISO (UTC) para el backend.
    const desde = encodeURIComponent(lunes.toISOString());
    const hasta = encodeURIComponent(sumarDias(lunes, 5).toISOString());
    const traer = () =>
      apiGet(`/api/inspeccionesDiarias?desde=${desde}&hasta=${hasta}`)
        .then((r) => {
          if (!vigente) return;
          setInspecciones(aplanarDocs<InspeccionDiaria>(r));
          setError(null);
        })
        .catch((err) => vigente && setError((err as Error).message))
        .finally(() => vigente && setCargando(false));
    traer();
    // Solo la semana actual cambia mientras uno mira el Panel.
    const intervalo = semanasAtras === 0 ? setInterval(traer, REFRESCO_MS) : undefined;
    return () => {
      vigente = false;
      if (intervalo) clearInterval(intervalo);
    };
  }, [lunes, semanasAtras]);

  const dias: Dia[] = useMemo(() => {
    const hoy = inicioDelDia(new Date()).getTime();
    const base = DIAS_CORTOS.map((_, i) => {
      const fecha = sumarDias(lunes, i);
      return { fecha, inspecciones: 0, equipos: new Set<string>(), conFallas: 0, futuro: fecha.getTime() > hoy, hoy: fecha.getTime() === hoy };
    });
    for (const insp of inspecciones) {
      const indice = Math.round((inicioDelDia(new Date(insp.fecha)).getTime() - lunes.getTime()) / DIA_MS);
      const dia = base[indice];
      if (!dia) continue;
      dia.inspecciones += 1;
      dia.equipos.add(insp.equipoId);
      if (insp.checklist.some((c) => !c.hecho)) dia.conFallas += 1;
    }
    return base.map((d) => ({ ...d, equipos: d.equipos.size }));
  }, [inspecciones, lunes]);

  const total = dias.reduce((acc, d) => acc + d.inspecciones, 0);
  const { tope, paso } = escala(Math.max(...dias.map((d) => d.inspecciones)));
  const lineas = Array.from({ length: tope / paso + 1 }, (_, i) => i * paso);

  return (
    <section className={`mnt-sem${cargando ? " mnt-sem--cargando" : ""}`} aria-busy={cargando}>
      <header className="mnt-sem__head">
        <div>
          <h2 className="mnt-sem__title">Inspecciones diarias</h2>
          <p className="mnt-sem__sub">Semana del {rangoTexto(lunes)}</p>
        </div>
        <div className="mnt-sem__nav">
          <button type="button" className="mnt-sem__navbtn" onClick={() => irASemana(semanasAtras + 1)} aria-label="Semana anterior">
            <Icon name="back" size="sm" />
          </button>
          <button
            type="button"
            className="mnt-sem__navbtn mnt-sem__navbtn--texto"
            onClick={() => irASemana(0)}
            disabled={semanasAtras === 0}
          >
            Esta semana
          </button>
          <button
            type="button"
            className="mnt-sem__navbtn"
            onClick={() => irASemana(Math.max(0, semanasAtras - 1))}
            disabled={semanasAtras === 0}
            aria-label="Semana siguiente"
          >
            <Icon name="arrow-right" size="sm" />
          </button>
        </div>
      </header>

      <div className="mnt-sem__resumen">
        <span className="mnt-sem__total">{total}</span>
        <span className="mnt-sem__total-label">
          {total === 1 ? "inspección" : "inspecciones"} {semanasAtras === 0 ? "esta semana" : "en la semana"}
        </span>
        <button type="button" className="mnt-sem__vista" onClick={() => setVerTabla((v) => !v)}>
          {verTabla ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {error && <p className="mnt-sem__error">No se pudieron cargar las inspecciones: {error}</p>}

      {verTabla ? (
        <table className="mnt-sem__tabla">
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Inspecciones</th>
              <th scope="col">Equipos</th>
              <th scope="col">Con fallas</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d, i) => (
              <tr key={i}>
                <th scope="row">
                  {DIAS_LARGOS[i]} {d.fecha.getDate()}
                </th>
                <td>{d.futuro ? "—" : d.inspecciones}</td>
                <td>{d.futuro ? "—" : d.equipos}</td>
                <td>{d.futuro ? "—" : d.conFallas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mnt-sem__grafico">
          <div className="mnt-sem__plot">
            {lineas.map((valor) => (
              <div key={valor} className="mnt-sem__guia" style={{ bottom: `${(valor / tope) * 100}%` }}>
                <span className="mnt-sem__tick">{valor}</span>
              </div>
            ))}
            <div className="mnt-sem__columnas">
              {dias.map((d, i) => {
                const alto = (d.inspecciones / tope) * 100;
                const descripcion = d.futuro
                  ? `${DIAS_LARGOS[i]} ${d.fecha.getDate()}: todavía no llega`
                  : `${DIAS_LARGOS[i]} ${d.fecha.getDate()}: ${d.inspecciones} ${d.inspecciones === 1 ? "inspección" : "inspecciones"}`;
                return (
                  <div key={i} className="mnt-sem__col" tabIndex={0} aria-label={descripcion}>
                    {!d.futuro && d.inspecciones > 0 && <span className="mnt-sem__barra" style={{ height: `${alto}%` }} />}
                    {d.hoy && (
                      <span className="mnt-sem__valor" style={{ bottom: `${alto}%` }}>
                        {d.inspecciones}
                      </span>
                    )}
                    <div className="mnt-sem__tip" role="tooltip" style={{ bottom: `calc(${alto}% + 28px)` }}>
                      {d.futuro ? (
                        <span className="mnt-sem__tip-sub">Todavía no llega</span>
                      ) : (
                        <>
                          <strong>
                            {d.inspecciones} {d.inspecciones === 1 ? "inspección" : "inspecciones"}
                          </strong>
                          <span className="mnt-sem__tip-sub">
                            {d.equipos} {d.equipos === 1 ? "equipo" : "equipos"} · {d.conFallas} con fallas
                          </span>
                        </>
                      )}
                      <span className="mnt-sem__tip-dia">
                        {DIAS_LARGOS[i]} {d.fecha.getDate()} de {MESES[d.fecha.getMonth()]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mnt-sem__ejex">
            {dias.map((d, i) => (
              <span key={i} className={`mnt-sem__dia${d.hoy ? " mnt-sem__dia--hoy" : ""}${d.futuro ? " mnt-sem__dia--futuro" : ""}`}>
                {DIAS_CORTOS[i]} {d.fecha.getDate()}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
