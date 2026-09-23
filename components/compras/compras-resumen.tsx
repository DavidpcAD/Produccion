"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sparkline, Donut, BarRanking, SerieMensual } from "@/components/compras/charts";
import { money, num, todayISO } from "@/lib/compras/helpers";
import { variacion, diasDesde, MESES_CORTOS } from "@/lib/compras/kpis";
import type { KpisCompras } from "@/lib/compras/kpis";
import { usePanoramaBc } from "@/lib/compras/use-panorama-bc";
import { loQueEstaEnTuCancha, DE_QUIEN_LABEL } from "@/lib/compras/cancha";
import { useStore } from "@/lib/compras/store";
import { useSession } from "@/hooks/useSession";
import type { FilaProv } from "@/lib/compras/proveedores-resumen";

// EL RESUMEN DE ÓRDENES DE COMPRA: el panorama en paneles. Cinco tarjetas KPI arriba
// (rótulo, número grande, chip de variación y chispa), y debajo cuatro paneles: lo que
// está detenido y esperando a alguien, dónde está trabada la plata (anillo), a quién
// hay que corretearle el material (ranking) y cómo viene el año (serie mensual).
//
// Portado de proveeduria.adelante.cr (`components/compras-resumen.tsx`), que es el
// original. Lo que cambia acá es a dónde lleva cada fila: allá el Resumen es una
// pestaña que filtra las otras pestañas de la misma pantalla; acá las listas son
// pantallas aparte del menú de Órdenes de Compra, así que cada fila navega a la suya.
//
// Lo que NO hace, a propósito: no es un tablero ejecutivo. Cada panel lleva a algún
// lado en vez de quedarse en la contemplación.

const compacto = (v: number, moneda: string) => {
  // ₡186 471 165,81 no cabe en una tarjeta KPI y tampoco se lee de un vistazo; lo que
  // se lee es "186,5 M". El monto exacto queda en el title y en las tablas.
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${moneda === "CRC" ? "₡" : "$"}${num.format(Math.round(v / 1e5) / 10)} M`;
  if (abs >= 1e3) return `${moneda === "CRC" ? "₡" : "$"}${num.format(Math.round(v / 100) / 10)} K`;
  return money(v, moneda);
};

// `k` llega hecho desde la pantalla a propósito: si el panel lo calculara por su cuenta
// y otra pantalla usara los mismos números, dos cálculos separados para el mismo rótulo
// es como se empieza a desconfiar de un tablero.
export function ComprasResumen({ k, filas }: { k: KpisCompras; filas: FilaProv[] }) {
  const { ordenes, pedidos } = useStore();
  const me = useSession();
  const router = useRouter();
  const bc = usePanoramaBc();
  const hoy = todayISO();
  const cancha = useMemo(() => loQueEstaEnTuCancha(ordenes, pedidos, k.moneda, me), [ordenes, pedidos, k.moneda, me]);

  const fmt = (v: number) => money(v, k.moneda);
  const corto = (v: number) => compacto(v, k.moneda);

  const topProveedores = useMemo(
    () => filas.filter((f) => f.pendiente > 0).slice(0, 8).map((f) => ({
      clave: f.proveedorId,
      nombre: f.nombre,
      valor: f.pendiente,
      texto: compacto(f.pendiente, k.moneda),
      // "hace N días" y no "N días tarde": la fecha de entrega de BC es la que rellena
      // el sistema, no una que el proveedor haya prometido. Solo sale si la orden más
      // vieja ya pasó la semana — antes de eso no dice nada.
      nota: [
        `${f.nOrdenes} ${f.nOrdenes === 1 ? "orden" : "órdenes"}`,
        `${f.pct}% entregado`,
        ...(() => { const d = diasDesde(f.desdeISO, hoy); return d && d > 7 ? [`hace ${num.format(d)} días`] : []; })(),
      ].join(" · "),
    })),
    [filas, k.moneda, hoy],
  );

  return (
    <div className="resumen">
      {/* Los montos son de UNA moneda. Mezclar colones con dólares da un total que no
          existe, así que las otras se declaran acá en vez de sumarse en silencio. */}
      {k.otrasMonedas.length > 0 && (
        <p className="ds-body-sm ds-muted resumen__aviso">
          Los montos son en {k.moneda === "CRC" ? "colones" : k.moneda}.
          {" "}Quedan fuera {k.otrasMonedas.map((m) => `${m.ordenes} ${m.ordenes === 1 ? "orden" : "órdenes"} en ${m.moneda}`).join(" y ")}:
          {" "}no hay tipo de cambio en la app para juntarlas en un solo número.
        </p>
      )}

      <div className="kpis">
        <TarjetaKpi
          rotulo={`Pedido ${k.anio}`} nota="sin IVA"
          valor={corto(k.total.pedido)} exacto={fmt(k.total.pedido)}
          delta={variacion(k.total.pedido, k.totalPrevio.pedido)} anioPrevio={k.anioPrevio}
          serie={k.meses.map((m) => m.pedido)} color="var(--ds-color-green-100)"
        />
        <TarjetaKpi
          rotulo={`Entregado ${k.anio}`} nota="de lo pedido este año"
          valor={corto(k.total.recibido)} exacto={fmt(k.total.recibido)}
          delta={variacion(k.total.recibido, k.totalPrevio.recibido)} anioPrevio={k.anioPrevio}
          serie={k.meses.map((m) => m.recibido)} color="var(--ds-color-green-200)"
        />
        <TarjetaKpi
          rotulo={`Órdenes ${k.anio}`} nota="emitidas"
          valor={num.format(k.total.ordenes)} exacto={`${num.format(k.total.ordenes)} órdenes`}
          delta={variacion(k.total.ordenes, k.totalPrevio.ordenes)} anioPrevio={k.anioPrevio}
          serie={k.meses.map((m) => m.ordenes)} color="var(--ds-color-yellow)"
        />
        {/* La cuarta no es del año: es el SALDO VIVO de toda la historia, y por eso no
            lleva chip de variación —no hay foto de ayer con qué compararlo— sino la
            barra de la parte entregada, que es lo que dice si va bien o mal. */}
        <TarjetaKpi
          rotulo="Pendiente por entregar" nota="de todas las órdenes abiertas"
          valor={corto(k.vivo.pendiente)} exacto={fmt(k.vivo.pendiente)}
          delta={null} anioPrevio={k.anioPrevio}
          barra={{ pct: k.vivo.pct, texto: `${k.vivo.pct}% ya entregado` }}
          acento="var(--ds-color-red-200)"
          // NO dice "vencido": en BC la fecha de entrega esperada es la que rellena el
          // sistema con la de la orden, no una que alguien haya prometido, así que no
          // hay contra qué medir un atraso. Lo que sí existe, y es lo que hay que ir a
          // preguntar, es cuánto de eso NADIE sabe cuándo llega. Mientras BC no
          // contesta se muestra la antigüedad, que sale de esta base y está de una.
          alerta={bc.datos
            ? (bc.datos.sinFecha.total > 0
              ? `${corto(bc.datos.sinFecha.total)} sin fecha de entrega · ${bc.datos.sinFecha.proveedores} proveedores a los que preguntarle`
              : null)
            : (() => { const d = diasDesde(k.vivo.masViejoISO, hoy); return d && d > 30 ? `lo más viejo lleva ${num.format(d)} días esperando` : null; })()}
          alertaTitulo={bc.datos && bc.datos.sinFecha.total > 0
            ? `${bc.datos.sinFecha.lineas} líneas en ${bc.datos.sinFecha.ordenes} órdenes con la fecha de entrega en blanco en Business Central. `
              + `Las demás traen la fecha de la orden, que BC rellena solo: tampoco es una fecha que alguien haya prometido.`
            : undefined}
        />
        <TarjetaSinFacturar datos={bc.datos?.sinFacturar ?? null} error={bc.error} cargando={bc.cargando}
          corto={corto} fmt={fmt} />
      </div>

      <div className="resumen__grid">
        <section className="ds-card panel">
          <header className="panel__head">
            <div>
              <h2 className="ds-subtitle">Lo que está detenido</h2>
              <p className="ds-body-sm ds-muted">Dónde se quedó quieto el trabajo. Tocá una fila para ir a la lista.</p>
            </div>
          </header>
          {cancha.length > 0 ? (
            <ul className="cancha">
              {cancha.map((i) => {
                const ajeno = DE_QUIEN_LABEL[i.deQuien];
                return (
                  <li key={i.clave}>
                    <button type="button" className="cancha__fila" onClick={() => router.push(i.href)}
                      title={i.monto !== null ? fmt(i.monto) : undefined}>
                      <i className="cancha__marca" style={{ background: i.color }} aria-hidden />
                      <span className="cancha__texto">
                        <span className="cancha__etiqueta">{i.etiqueta}</span>
                        <span className="ds-body-sm ds-muted">{i.detalle}</span>
                      </span>
                      <span className="cancha__cifras">
                        <span className="cancha__cuenta">{i.cuenta}</span>
                        {i.monto !== null && <span className="ds-body-sm ds-muted">{corto(i.monto)}</span>}
                      </span>
                      {/* Lo que NO depende de quien mira va marcado: sin esto se lee
                          como una tarea suya y se queda esperándola. */}
                      {ajeno && <span className="cancha__ajeno ds-body-sm">{ajeno}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ds-muted panel__vacio">Nada detenido: todo lo que se pidió ya está comprado y en camino.</p>
          )}
        </section>

        <section className="ds-card panel">
          <header className="panel__head">
            <div>
              <h2 className="ds-subtitle">Dónde está trabada la plata</h2>
              <p className="ds-body-sm ds-muted">Órdenes que todavía no se completan, por estado.</p>
            </div>
          </header>
          {k.enCurso > 0 ? (
            <div className="panel__anillo">
              <Donut
                segmentos={k.porEstado}
                etiqueta={`${fmt(k.enCurso)} en órdenes sin completar, repartido por estado`}
                centro={
                  <>
                    <span className="donut__monto" title={fmt(k.enCurso)}>{corto(k.enCurso)}</span>
                    <span className="donut__pie ds-body-sm ds-muted">en curso</span>
                  </>
                }
              />
              <ul className="leyenda">
                {k.porEstado.map((s) => (
                  <li key={s.clave} className="leyenda__fila">
                    <i className="leyenda__marca" style={{ background: s.color }} aria-hidden />
                    <span className="leyenda__texto">
                      <span className="ds-body-sm ds-muted">{s.etiqueta}</span>
                      <span className="leyenda__monto" title={fmt(s.monto)}>{corto(s.monto)}</span>
                    </span>
                    <span className="leyenda__pct ds-body-sm ds-muted">{Math.round((s.monto / k.enCurso) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="ds-muted panel__vacio">No hay órdenes en curso: todo lo pedido ya se completó.</p>
          )}
        </section>

        <section className="ds-card panel">
          <header className="panel__head">
            <div>
              <h2 className="ds-subtitle">A quién hay que corretearle</h2>
              <p className="ds-body-sm ds-muted">Proveedores con material pendiente, de mayor a menor.</p>
            </div>
          </header>
          {topProveedores.length > 0
            ? <BarRanking filas={topProveedores} color="var(--ds-color-red-100)" />
            : <p className="ds-muted panel__vacio">Ningún proveedor debe material.</p>}
        </section>

        <section className="ds-card panel panel--ancho">
          <header className="panel__head">
            <div>
              <h2 className="ds-subtitle">Cómo viene el año</h2>
              {/* El subtítulo dice qué se está viendo Y qué le falta. Con uno o dos
                  meses de movimiento son barras, y decirlo evita que alguien lea una
                  tendencia donde todavía no hay con qué trazarla. */}
              <p className="ds-body-sm ds-muted">
                {(() => {
                  const conDato = k.meses.filter((m) => m.pedido > 0).length;
                  if (conDato < 3) return `Pedido por mes. Con ${conDato === 0 ? "ningún mes" : conDato === 1 ? "un solo mes" : "dos meses"} de movimiento todavía no hay tendencia que trazar.`;
                  return `Pedido por mes${k.hayAnioPrevio ? `, ${k.anio} contra ${k.anioPrevio}.` : `. Todavía no hay ${k.anioPrevio} con qué comparar.`}`;
                })()}
              </p>
            </div>
            {k.hayAnioPrevio && (
              <div className="serie__leyenda ds-body-sm">
                <span className="serie__leg"><i className="serie__marca serie__marca--cy" aria-hidden />{k.anio}</span>
                <span className="serie__leg"><i className="serie__marca serie__marca--py" aria-hidden />{k.anioPrevio}</span>
              </div>
            )}
          </header>
          <SerieMensual
            actual={k.meses.map((m) => m.pedido)}
            previo={k.hayAnioPrevio ? k.mesesPrevio.map((m) => m.pedido) : null}
            etiquetasX={MESES_CORTOS}
            formato={fmt}
            etiqueta={`Pedido por mes en ${k.anio}${k.hayAnioPrevio ? `, comparado con ${k.anioPrevio}` : ""}`}
          />
        </section>
      </div>
    </div>
  );
}

// Una tarjeta KPI: rótulo, número grande, chip de variación y chispa al pie.
function TarjetaKpi({
  rotulo, nota, valor, exacto, delta, anioPrevio, serie, color, barra, acento, alerta, alertaTitulo,
}: {
  rotulo: string;
  nota: string;
  valor: string;
  exacto: string;
  delta: number | null;
  anioPrevio: number;
  serie?: number[];
  color?: string;
  barra?: { pct: number; texto: string };
  acento?: string;
  alerta?: string | null;
  alertaTitulo?: string;
}) {
  return (
    <article className="kpi" style={acento ? ({ "--kpi-acento": acento } as React.CSSProperties) : undefined}>
      <div className="kpi__rotulo">{rotulo}</div>
      <div className="kpi__fila">
        <div className="kpi__valor" title={exacto}>{valor}</div>
        {/* Sin año anterior no va chip: un "+100 %" porque el año pasado estaba en cero
            es una mentira con flecha verde, y acá se lee y se cree. */}
        {delta !== null && (
          <span className={`kpi__delta ${delta >= 0 ? "is-sube" : "is-baja"}`}
            title={`Contra el mismo período de ${anioPrevio}`}>
            <span aria-hidden>{delta >= 0 ? "▲" : "▼"}</span>
            {Math.abs(delta) >= 1000 ? ">999" : num.format(Math.abs(Math.round(delta * 10) / 10))}%
          </span>
        )}
      </div>
      <div className="kpi__nota ds-body-sm">{delta !== null ? `${nota} · vs ${anioPrevio}` : nota}</div>
      {serie && <Sparkline valores={serie} color={color} etiqueta={`${rotulo} mes a mes`} />}
      {barra && (
        <div className="kpi__barra" title={barra.texto}>
          <span className="kpi__barra-pista"><span className="kpi__barra-fill" style={{ width: `${barra.pct}%` }} /></span>
          <span className="ds-body-sm ds-muted">{barra.texto}</span>
        </div>
      )}
      {alerta && <div className="kpi__alerta ds-body-sm" title={alertaTitulo}>{alerta}</div>}
    </article>
  );
}

// "Llegó pero nadie lo facturó": material que Bodega ya recibió y que sigue sin factura
// registrada en BC. Es la única tarjeta que NO sale de la base de la app —viene de BC en
// vivo—, así que llega después y tiene sus tres estados: cargando, error y dato.
//
// El error se DICE. Un ₡0 en rojo porque BC no contestó manda a alguien a celebrar algo
// que no pasó, o peor, a dejar de revisarlo.
function TarjetaSinFacturar({ datos, error, cargando, corto, fmt }: {
  datos: import("@/lib/compras/bc").BcSinFacturar | null;
  error: string | null;
  cargando: boolean;
  corto: (v: number) => string;
  fmt: (v: number) => string;
}) {
  return (
    <article className={`kpi kpi--sinfac${error ? " kpi--error" : ""}`}>
      <div className="kpi__rotulo">Llegó pero nadie lo facturó</div>
      {cargando && <div className="kpi__valor kpi__valor--esperando" aria-busy>…</div>}
      {error && <div className="kpi__valor kpi__valor--error">—</div>}
      {datos && <div className="kpi__valor" title={fmt(datos.total)}>{corto(datos.total)}</div>}
      <div className="kpi__nota ds-body-sm" title={error ?? undefined}>
        {error ? "No se pudo consultar Business Central." : "Material recibido en bodega sin factura registrada en BC"}
      </div>
      {datos && datos.total > 0 && (
        <ul className="kpi__tramos">
          {/* Solo las franjas CON algo: dos franjas en cero permanente hacen que la
              tarjeta se lea como rota. Cuando limpien el atraso, aparecen solas. */}
          {datos.tramos.map((t) => (
            <li key={t.etiqueta} className="kpi__tramo">
              <span className="ds-muted">{t.etiqueta}</span>
              <span className="kpi__tramo-monto" title={fmt(t.monto)}>{corto(t.monto)}</span>
            </li>
          ))}
          {datos.masViejoDias !== null && (
            <li className="kpi__tramo kpi__tramo--viejo">
              <span>lo más viejo</span>
              <span className="kpi__tramo-monto">{num.format(datos.masViejoDias)} días</span>
            </li>
          )}
        </ul>
      )}
      {datos && datos.total > 0 && (
        <div className="kpi__pie ds-body-sm ds-muted">
          {datos.lineas} {datos.lineas === 1 ? "línea" : "líneas"} en {datos.ordenes} {datos.ordenes === 1 ? "orden" : "órdenes"} · {datos.proveedores} {datos.proveedores === 1 ? "proveedor" : "proveedores"}
        </div>
      )}
      {datos && datos.total === 0 && <div className="kpi__pie ds-body-sm ds-muted">Todo lo recibido está facturado.</div>}
    </article>
  );
}
