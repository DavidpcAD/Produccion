"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/compras/ui";
import { Icon } from "@/components/ds/Icon/Icon";
import { useStore } from "@/lib/compras/store";
import {
  destinoCodigo, destinoDeLinea, destinoLabel, formatDate, money, num, numeroOrdenPlano,
  ordenBadge, ordenTotalConIva, pedidoBadge, pedidoLineaDadaDeBaja, pedidoLineaPendiente,
  pedidoOrdenadoPct, tipoSolicitudBadge,
} from "@/lib/compras/helpers";
import type { Orden, Pedido } from "@/lib/compras/types";

type Tab = "lineas" | "ordenes";

/** Órdenes que salieron de ESTA solicitud. El enlace vive a nivel de LÍNEA
 *  (`pedidoLineaId`); el número es el respaldo para las órdenes viejas, igual que
 *  en `ordenesDeMisPedidos`. */
function ordenesDelPedido(ordenes: Orden[], p: Pedido): Orden[] {
  const lineas = new Set(p.lineas.map((l) => l.id));
  return ordenes
    .filter((o) => o.lineas.some((l) =>
      (l.pedidoLineaId && lineas.has(l.pedidoLineaId)) || l.pedidoNumero === p.numero))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// Panel de la solicitud de origen: se abre desde la orden que se está revisando y
// contesta lo que uno se pregunta antes de aprobarla —quién pidió esto, para qué
// obra, cuánto pidió y qué parte ya se compró—. Vive en el mismo lugar que el panel
// del proveedor, entre la lista y el riel de la orden, así que no hay que salir de
// la bandeja ni perder la orden abierta. El detalle completo sigue en su pantalla.
export function PedidoPanel({
  numero, ordenActualId, onVolver, onCerrar, onAbrirOrden,
}: {
  /** PED-000450. Se busca por número porque es lo único que trae la línea de la orden. */
  numero: string;
  /** La orden desde la que se abrió: se marca en la lista para no confundirla. */
  ordenActualId?: string;
  onVolver: () => void;
  onCerrar: () => void;
  onAbrirOrden: (id: string) => void;
}) {
  const { pedidos, ordenes, proveedores, cargandoExtra } = useStore();
  const [tab, setTab] = useState<Tab>("lineas");

  const pedido = pedidos.find((p) => p.numero === numero);
  const suyas = useMemo(() => (pedido ? ordenesDelPedido(ordenes, pedido) : []), [ordenes, pedido]);

  const marco = (cuerpo: React.ReactNode) => (
    <section className="oc-det oc-prov-panel" aria-label={`Solicitud ${numero}`}>
      <header className="oc-prov-panel__head">
        <button type="button" className="oc-prov-panel__volver" onClick={onVolver}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Volver
        </button>
        <button type="button" className="oc-det__cerrar" onClick={onCerrar} aria-label="Cerrar la solicitud">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      {cuerpo}
    </section>
  );

  // Sin la solicitud en memoria no hay nada que enseñar. Pasa mientras el bootstrap
  // completo todavía viene bajando (en Aprobación la cola pinta las órdenes antes).
  if (!pedido) {
    return marco(
      <div className="oc-det__cuerpo">
        <div className="oc-det__sol">
          <span className="oc-det__ic"><Icon name="boleta" size="md" color="currentColor" /></span>
          <span className="oc-det__dato-txt">
            <span className="oc-det__rot">Solicitud de origen</span>
            <span className="oc-det__sol-num">{numero}</span>
          </span>
        </div>
        <span className="oc-det__linea-dest">
          {cargandoExtra
            ? "Cargando las solicitudes… en cuanto bajen se ve acá."
            : "Esta solicitud no está entre las que bajó la pantalla. Probá recargar; si sigue igual, abrila desde Mis solicitudes."}
        </span>
      </div>,
    );
  }

  const t = tipoSolicitudBadge(pedido.tipoSolicitud);
  const b = pedidoBadge(pedido.estado);
  const tabs: { k: Tab; label: string }[] = [
    { k: "lineas", label: `Líneas (${pedido.lineas.length})` },
    { k: "ordenes", label: `Órdenes (${suyas.length})` },
  ];

  return marco(
    <>
      <div className="oc-prov-panel__id">
        <h2 className="oc-det__rotulo">Solicitud de origen</h2>
        <div className="oc-det__sol">
          <span className="oc-det__ic"><Icon name="boleta" size="md" color="currentColor" /></span>
          <span className="oc-det__dato-txt">
            <span className="oc-det__sol-num">{pedido.numero}</span>
            <span className="oc-det__sol-quien ds-wrap">La pidió {pedido.solicitante}</span>
            {/* Debajo del nombre y no al lado: en la columna del medio los dos
                distintivos le comían el ancho al número y lo partían en dos. */}
            <span className="oc-det__sol-chips">
              <Badge tone={t.tone}>{t.label}</Badge>
              <Badge tone={b.tone}>{b.label}</Badge>
            </span>
          </span>
        </div>

        <div className="oc-prov-panel__kpis">
          <Kpi icon="reloj" valor={formatDate(pedido.fecha)} rotulo="Fecha de la solicitud" />
          <Kpi icon="place" valor={destinoCodigo(pedido)} rotulo={destinoLabel(pedido)} />
          <Kpi icon="list" valor={String(pedido.lineas.length)} rotulo={pedido.lineas.length === 1 ? "Línea pedida" : "Líneas pedidas"} />
          <Kpi icon="completado" valor={`${pedidoOrdenadoPct(pedido)} %`} rotulo="Ya convertido en órdenes" />
        </div>
      </div>

      <div className="oc-det__tabs" role="tablist" aria-label="Datos de la solicitud">
        {tabs.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={tab === x.k}
            className={`oc-det__tab${tab === x.k ? " is-active" : ""}`} onClick={() => setTab(x.k)}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="oc-det__cuerpo">
        {/* Lo que el solicitante dejó escrito para toda la solicitud. Es lo que
            explica por qué se pidió, y por eso va arriba de las dos pestañas. */}
        {pedido.notas?.trim() && (
          <div className="oc-det__grupo">
            <span className="oc-det__rot">Comentario de quien la pidió</span>
            <span className="oc-det__linea-nota ds-wrap">“{pedido.notas.trim()}”</span>
          </div>
        )}

        {tab === "lineas" && (
          <div className="oc-det__lista">
            {pedido.lineas.map((l) => {
              // Solicitud archivada: lo que nunca entró en una orden se dio de baja,
              // no quedó "pendiente" — nadie lo va a comprar.
              const baja = pedidoLineaDadaDeBaja(l, pedido);
              const pend = pedidoLineaPendiente(l, pedido);
              return (
                <div key={l.id} className="oc-det__linea">
                  <div className="oc-det__linea-tit">
                    <span className="oc-det__linea-nom">
                      <span className="ds-wrap ds-strong">{l.descripcion}</span>
                      {(l.articuloId || l.variantCode) && (
                        <span className="oc-det__linea-cod">
                          {[l.articuloId, l.variantCode && `Variante ${l.variantCode}`].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    {l.devuelta && <Badge tone="yellow">Devuelta</Badge>}
                  </div>
                  {l.notas?.trim() && <span className="oc-det__linea-nota ds-wrap">“{l.notas.trim()}”</span>}
                  <div className="oc-det__linea-grid">
                    <span>
                      <span className="oc-det__rot">Pidió</span>
                      <span className="oc-det__linea-val">{num.format(l.cantidad)} {l.unidad}</span>
                    </span>
                    <span>
                      <span className="oc-det__rot">Ya ordenado</span>
                      <span className="oc-det__linea-val">{num.format(Math.min(l.cantidadOrdenada, l.cantidad))} {l.unidad}</span>
                    </span>
                    <span>
                      <span className="oc-det__rot">{baja ? "Dado de baja" : "Pendiente"}</span>
                      <span className="oc-det__linea-val ds-strong">{num.format(baja || pend)} {l.unidad}</span>
                    </span>
                  </div>
                  <div className="oc-det__linea-dest">Destino {destinoDeLinea(l, pedido) || "—"}{l.taskNo ? ` · tarea ${l.taskNo}` : ""}</div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "ordenes" && (
          <>
            {suyas.length === 0 && (
              <span className="oc-det__linea-dest">Todavía no hay ninguna orden de compra armada desde esta solicitud.</span>
            )}
            {suyas.map((o) => {
              const ob = ordenBadge(o.estado);
              return (
                <button key={o.id} type="button" onClick={() => onAbrirOrden(o.id)}
                  className={`oc-prov-orden${o.id === ordenActualId ? " is-esta" : ""}`}>
                  <span className="oc-prov-orden__top">
                    <span className="ds-strong">{numeroOrdenPlano(o)}</span>
                    <span className="oc-prov-orden__fecha">{formatDate(o.fecha)}</span>
                    <span className="oc-prov-orden__monto">{money(ordenTotalConIva(o), o.currencyCode)}</span>
                  </span>
                  <span className="oc-prov-orden__meta">
                    {/* Hay órdenes que traen el id del proveedor y no su nombre: el
                        catálogo es el respaldo, igual que en el riel de la orden. */}
                    <span>{o.proveedorNombre ?? proveedores.find((p) => p.id === o.proveedorId)?.nombre ?? o.proveedorNo ?? "Sin proveedor"}</span>
                  </span>
                  <span className="oc-prov-orden__chips">
                    <Badge tone={ob.tone}>{ob.label}</Badge>
                    {o.id === ordenActualId && <Badge tone="green">La que estás revisando</Badge>}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>

      <footer className="oc-det__pie">
        <Link href={`/compras/solicitud/${pedido.id}`} className="oc-det__completa">
          Ver la solicitud completa · entregas e historial ↗
        </Link>
      </footer>
    </>,
  );
}

function Kpi({ icon, valor, rotulo }: { icon: "reloj" | "place" | "list" | "completado"; valor: string; rotulo: string }) {
  return (
    <div className="oc-prov-panel__kpi">
      <span className="oc-det__ic oc-det__ic--sm"><Icon name={icon} size="sm" color="currentColor" /></span>
      <span className="oc-det__dato-txt">
        <span className="oc-prov-panel__kpi-val ds-wrap">{valor}</span>
        <span className="oc-det__rot ds-wrap">{rotulo}</span>
      </span>
    </div>
  );
}
