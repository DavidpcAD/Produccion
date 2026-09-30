"use client";

import { useState } from "react";
import { IconChevronDown } from "@/components/compras/icons";
import { Icon } from "@/components/ds/Icon/Icon";
import { useStore } from "@/lib/compras/store";
import {
  formatDate, money, num, numeroOrdenPlano, ordenAlmacenDestino, ordenConsumoDirecto,
  ordenDevueltaPorBc, ordenLineaEsConsumoDirecto, ordenLineaImporte, ordenMaquinas, ordenTotalConIva,
} from "@/lib/compras/helpers";
import type { Orden } from "@/lib/compras/types";

// La orden en la lista. Vive aparte porque la usan las DOS bandejas —Aprobación y
// Todas las órdenes— y tienen que verse igual: si una cambia, cambian las dos.
// El desplegado de líneas es asunto suyo; afuera nadie lo administra.
export function OrdenFila({
  orden, abierta, marcada, onAbrir, onMarcar,
}: {
  orden: Orden;
  /** Es la que se está revisando en el riel: se marca para no perderla de vista. */
  abierta: boolean;
  /** Solo donde se puede aprobar en lote. `undefined` = sin casilla. */
  marcada?: boolean;
  onAbrir: () => void;
  onMarcar?: () => void;
}) {
  const { proveedores, pedidos, movimientos } = useStore();
  const [verLineas, setVerLineas] = useState(false);

  const articulos = orden.lineas.filter((l) => l.tipo === "articulo");
  const cd = ordenConsumoDirecto(orden);
  const alm = ordenAlmacenDestino(orden);
  const maquinas = ordenMaquinas(orden, pedidos);
  const sinLanzarBc = ordenDevueltaPorBc(orden, movimientos);
  const prov = proveedores.find((p) => p.id === orden.proveedorId);
  // La fecha NO va acá: ya se muestra arriba, al lado del número. Repetirla en esta
  // línea la sacaba dos veces en la misma tarjeta.
  const datos = [
    `${articulos.length} ${articulos.length === 1 ? "línea" : "líneas"}`,
    alm.codigo ?? (alm.mixto ? "Varios almacenes" : null),
    maquinas.length > 0 ? maquinas.join(", ") : null,
  ].filter(Boolean) as string[];

  return (
    <article className={`oc-fila${abierta ? " is-abierta" : ""}`}>
      <div className="oc-fila__top">
        {onMarcar && (
          <input type="checkbox" className="ds-cbx oc-fila__cbx" checked={!!marcada} onChange={onMarcar}
            aria-label={`Seleccionar ${numeroOrdenPlano(orden)} para aprobar en lote`} />
        )}
        <button type="button" className="oc-fila__abrir" onClick={onAbrir} aria-pressed={abierta}>
          <span className="oc-fila__id">
            <span className="oc-fila__linea1">
              <span className="oc-fila__num">{numeroOrdenPlano(orden)}</span>
              <span className="oc-fila__fecha">{formatDate(orden.fecha)}</span>
            </span>
            <span className="oc-fila__prov">
              <span className="oc-fila__prov-nom">{orden.proveedorNombre ?? prov?.nombre}</span>
              <span className="oc-fila__prov-cod">{orden.proveedorNo ?? prov?.code}</span>
            </span>
            <span className="oc-fila__datos">
              {datos.map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
          <span className="oc-fila__marcas">
            {cd.hay && (
              <span className="ds-badge ds-badge--yellow oc-marca"
                title={`Se consume contra ${cd.destinos.join(" · ")}. El material NO entra a inventario: el costo va a la obra.`}>
                <Icon name="alert" size="sm" color="currentColor" />
                Consumo directo{cd.parcial ? " (parcial)" : ""}
              </span>
            )}
            {sinLanzarBc && (
              <span className="ds-badge ds-badge--red oc-marca"
                title={`El pedido ${orden.bcNumber} quedó sin lanzar en Business Central.`}>
                <Icon name="traslado" size="sm" color="currentColor" />
                Sin lanzar en BC
              </span>
            )}
          </span>
          <span className="oc-fila__total">{money(ordenTotalConIva(orden), orden.currencyCode)}</span>
        </button>
        <button type="button" className={`oc-fila__chev${verLineas ? " is-open" : ""}`} onClick={() => setVerLineas((v) => !v)}
          aria-expanded={verLineas}
          aria-label={verLineas ? `Ocultar las líneas de ${numeroOrdenPlano(orden)}` : `Ver las líneas de ${numeroOrdenPlano(orden)}`}>
          <span className="oc-fila__chev-txt">
            {verLineas ? "Ocultar las líneas" : `Ver ${articulos.length === 1 ? "la línea" : `las ${articulos.length} líneas`}`}
          </span>
          <IconChevronDown size={18} />
        </button>
        {/* Solo en celular: la tabla de líneas no cabe en 375px, así que el chevron de
            arriba se esconde y este dice que la tarjeta abre la hoja. aria-hidden +
            tabIndex -1: `oc-fila__abrir` ya expone la acción, y anunciarla dos veces
            solo ensucia el lector de pantalla. */}
        <button type="button" className="oc-fila__ir" onClick={onAbrir} aria-hidden tabIndex={-1}>
          <IconChevronDown size={18} />
        </button>
      </div>

      {/* Las mismas líneas en dos formas: apiladas en celular, tabla en PC. */}
      {verLineas && (
        <div className="oc-fila__lista">
          {orden.lineas.map((l) => (
            <div key={l.id} className="oc-det__linea">
              <div className="oc-det__linea-tit">
                <span className="ds-wrap ds-strong">{l.descripcion}</span>
                {l.tipo === "cargo" && <span className="ds-badge ds-badge--yellow">Cargo</span>}
              </div>
              {l.pedidoNumero && <span className="oc-det__linea-cod">{l.pedidoNumero}</span>}
              <div className="oc-det__linea-nums">
                <span className="ds-nowrap">{num.format(l.cantidad)} {l.unidad} × {money(l.precioUnitario, orden.currencyCode)}</span>
                <span className="ds-strong ds-nowrap">{money(ordenLineaImporte(l), orden.currencyCode)}</span>
              </div>
              {/* El destino Y la obra. Antes era `almacen || obra`, así que en cuanto
                  la línea tenía almacén la obra desaparecía — y es justo lo que hay que
                  mirar para decidir si la compra tiene sentido. Con almacén el costo lo
                  paga el almacén y la obra NO viaja a BC, pero igual se pidió PARA una
                  obra: por eso va "la pidió". */}
              <div className="oc-det__linea-dest">
                {ordenLineaEsConsumoDirecto(l)
                  ? `${l.obra || l.proyecto} · tarea ${l.taskNo} · consumo directo`
                  : `${l.almacen || "Sin almacén"}${l.obra ? ` · la pidió la obra ${l.obra}` : ""}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {verLineas && (
        <div className="ds-table-wrap oc-fila__lineas">
          <table className="ds-table">
            <thead>
              <tr><th>Descripción</th><th>Destino</th><th>Obra</th><th className="ds-num">Cantidad</th><th className="ds-num">Precio</th><th className="ds-num">Importe</th></tr>
            </thead>
            <tbody>
              {orden.lineas.map((l) => (
                <tr key={l.id}>
                  <td className="ds-cell-texto">{l.descripcion}{l.pedidoNumero && <div className="ds-body-sm ds-muted">{l.pedidoNumero}</div>}</td>
                  <td className="ds-muted ds-body-sm">
                    {ordenLineaEsConsumoDirecto(l)
                      ? <span title={`Consumo directo contra ${l.proyecto} · tarea ${l.taskNo}: no entra a inventario`}>Consumo directo · {l.taskNo}</span>
                      : (l.almacen || "—")}
                  </td>
                  {/* La obra en su propia columna: distintas líneas de una misma orden
                      pueden ir a obras distintas, y en columna la diferencia se ve de
                      un vistazo. Antes la obra se perdía en cuanto había almacén. */}
                  <td className="ds-muted ds-body-sm">{l.obra || l.proyecto || "—"}</td>
                  <td className="ds-num">{num.format(l.cantidad)} {l.unidad}</td>
                  <td className="ds-num">{money(l.precioUnitario, orden.currencyCode)}</td>
                  <td className="ds-num ds-strong">{money(ordenLineaImporte(l), orden.currencyCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
