"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Modal } from "@/components/compras/ui";
import { Icon, IconName } from "@/components/ds/Icon/Icon";
import { Timeline } from "@/components/compras/timeline";
import { AprobarControl } from "@/components/compras/aprobar-control";
import { useStore } from "@/lib/compras/store";
import {
  bcEstadoBadge, formatDate, money, num, numeroOrden, ordenAlmacenDestino, ordenBadge,
  ordenConsumoDirecto, ordenDevueltaPorBc, ordenEsDirecta, ordenLineaEsConsumoDirecto,
  numeroOrdenPlano, ordenLineaImporte, ordenMaquinas, ordenPedidos, ordenTotalConIva,
} from "@/lib/compras/helpers";
import type { Orden } from "@/lib/compras/types";

type Tab = "resumen" | "lineas" | "obra" | "historial";

// Riel de revisión de UNA orden, al lado de la lista (en celular, hoja de abajo).
// Existe para no tener que salir de la bandeja para decidir: aprobar es irreversible,
// así que lo que hay que mirar antes —proveedor, destino, consumo directo, monto— se
// lee acá mismo y la lista sigue a la vista. El detalle COMPLETO (facturas, imprimir,
// abrir en BC) sigue viviendo en su propia pantalla, enlazada abajo.
export function AprobacionDetalle({
  orden, aprobando, onCerrar, onAprobar, onRechazar,
}: {
  orden: Orden;
  aprobando: boolean;
  onCerrar: () => void;
  onAprobar: () => void;
  onRechazar: () => void;
}) {
  const { proveedores, pedidos, movimientos, bcEstados, ordenes, recepciones } = useStore();
  const [tab, setTab] = useState<Tab>("resumen");
  const [verProveedor, setVerProveedor] = useState(false);
  const marco = useRef<HTMLElement>(null);

  // En pantallas donde el riel no llega a lo alto de la ventana, al abrir una orden los
  // botones de aprobar/rechazar quedaban abajo del pliegue. `nearest` mueve lo mínimo
  // para que el riel entero se vea (y no mueve nada si ya cabía).
  useEffect(() => { marco.current?.scrollIntoView({ block: "nearest" }); }, []);

  // Escape cierra el riel: en celular tapa la pantalla entera y el botón de cerrar
  // queda arriba del todo, lejos del pulgar.
  useEffect(() => {
    const salir = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Con un diálogo encima (el de rechazo), Escape es de él: cerrar los dos de un
      // solo golpe le borra a la persona el motivo que estaba escribiendo.
      if (document.querySelector(".modal-overlay")) return;
      onCerrar();
    };
    window.addEventListener("keydown", salir);
    return () => window.removeEventListener("keydown", salir);
  }, [onCerrar]);

  const prov = proveedores.find((p) => p.id === orden.proveedorId);
  const provCodigo = orden.proveedorNo ?? prov?.code;
  const provNombre = orden.proveedorNombre ?? prov?.nombre;
  const articulos = orden.lineas.filter((l) => l.tipo === "articulo");
  const b = ordenBadge(orden.estado);
  const cd = ordenConsumoDirecto(orden);
  const alm = ordenAlmacenDestino(orden);
  const maquinas = ordenMaquinas(orden, pedidos);
  const peds = ordenPedidos(orden);
  const pendiente = orden.estado === "pendiente_aprobacion";
  // Ya se aprobó una vez y BC devolvió la orden: el pedido allá quedó sin lanzar.
  const sinLanzarBc = ordenDevueltaPorBc(orden, movimientos);
  // Lo último que contestó BC. Si la orden ya dice "sin lanzar", repetirlo es ruido.
  const enBc = bcEstados[orden.id] && !(sinLanzarBc && bcEstados[orden.id] !== "lanzado")
    ? bcEstadoBadge(orden.estado, bcEstados[orden.id]) : null;

  const delProveedor = useMemo(() => {
    // Manda el CÓDIGO del proveedor (PROV-…), no el id: hay órdenes que traen el
    // código y el nombre pero no el id —lo dejan vacío—, y comparar ids vacíos
    // hacía que TODAS esas órdenes parecieran del mismo proveedor.
    const codigoDe = (o: Orden) => o.proveedorNo ?? proveedores.find((p) => p.id === o.proveedorId)?.code;
    const cod = codigoDe(orden);
    const suyas = ordenes.filter((o) => {
      const c = codigoDe(o);
      if (cod && c) return c === cod;
      return !!orden.proveedorId && o.proveedorId === orden.proveedorId;
    });
    return [...suyas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [ordenes, proveedores, orden]);
  const conFactura = delProveedor.filter((o) => recepciones.some((r) => r.ordenId === o.id && r.numeroFactura)).length;

  const tabs: { k: Tab; label: string }[] = [
    { k: "resumen", label: "Resumen" },
    { k: "lineas", label: `Líneas (${articulos.length})` },
    { k: "obra", label: "Obra y proyecto" },
    { k: "historial", label: "Historial" },
  ];

  return (
    <section ref={marco} className="oc-det" aria-label={`Detalle de la orden ${numeroOrden(orden)}`}>
      {/* Agarre de la hoja (solo en celular, donde el riel sube desde abajo): la
          barrita de arriba es el gesto que la gente ya espera para cerrarla, y el
          botón de cerrar queda en la esquina, lejos del pulgar. */}
      <button type="button" className="oc-det__agarre" onClick={onCerrar} aria-label="Cerrar el detalle" />
      <header className="oc-det__head">
        <div className="oc-det__id">
          <span className="oc-det__rotulo">Orden de compra</span>
          <div className="oc-det__num-fila">
            <h2 className="oc-det__num">{numeroOrdenPlano(orden)}</h2>
            <Badge tone={b.tone}>{b.label}</Badge>
            {sinLanzarBc && (
              <Badge tone="red" title={`El pedido ${orden.bcNumber} quedó sin lanzar en Business Central.`}>Sin lanzar en BC</Badge>
            )}
            {enBc && <Badge tone={enBc.tone} title="Estado real del pedido en Business Central (última sincronización)">{enBc.label}</Badge>}
          </div>
        </div>
        <button type="button" className="oc-det__cerrar" onClick={onCerrar} aria-label="Cerrar el detalle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="oc-det__tabs" role="tablist" aria-label="Secciones de la orden">
        {tabs.map((t) => (
          <button key={t.k} type="button" role="tab" id={`oc-det-tab-${t.k}`} aria-controls="oc-det-panel" aria-selected={tab === t.k}
            className={`oc-det__tab${tab === t.k ? " is-active" : ""}`} onClick={() => setTab(t.k)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="oc-det__cuerpo" role="tabpanel" id="oc-det-panel" aria-labelledby={`oc-det-tab-${tab}`}>
        {tab === "resumen" && (
          <>
            <button type="button" className="oc-det__prov" onClick={() => setVerProveedor(true)}
              title={`Ver todas las órdenes de compra hechas a ${provNombre ?? provCodigo ?? "este proveedor"}`}>
              <span className="oc-det__ic"><Icon name="user" size="md" color="currentColor" /></span>
              <span className="oc-det__dato-txt">
                <span className="oc-det__rot">Proveedor</span>
                <span className="oc-det__prov-cod">{provCodigo ?? "—"}</span>
                <span className="oc-det__prov-nom ds-wrap">{provNombre ?? "Sin proveedor"}</span>
                <span className="oc-det__prov-ver">{delProveedor.length === 1 ? "Ver su orden" : `Ver sus ${delProveedor.length} órdenes`} ↗</span>
              </span>
            </button>

            <div className="oc-det__datos">
              <Dato icon="reloj" rotulo="Fecha" valor={formatDate(orden.fecha)} />
              <Dato icon="list" rotulo="Cantidad de líneas" valor={String(articulos.length)} />
              <Dato icon="entrega" rotulo="Almacén destino"
                valor={alm.codigo ?? (alm.mixto ? "Varios almacenes" : cd.hay && !cd.parcial ? "No entra a inventario" : "—")} />
              {maquinas.length > 0 && <Dato icon="options" rotulo="Máquina" valor={maquinas.join(", ")} />}
            </div>

            {sinLanzarBc && (
              <div className="oc-aviso oc-aviso--rojo">
                <span className="oc-aviso__ic"><Icon name="alert" size="sm" color="currentColor" /></span>
                <span className="oc-aviso__txt">
                  <span className="oc-aviso__tit">Sin lanzar en Business Central</span>
                  La orden ya se había aprobado, pero el pedido {orden.bcNumber} quedó sin lanzar y Bodega no
                  puede recibir contra él. Volvé a lanzarlo: no se crea otro pedido.
                </span>
              </div>
            )}

            {cd.hay && (
              <div className="oc-aviso oc-aviso--amarillo">
                <span className="oc-aviso__ic"><Icon name="alert" size="sm" color="currentColor" /></span>
                <span className="oc-aviso__txt">
                  <span className="oc-aviso__tit">Consumo directo</span>
                  {cd.parcial ? `${cd.lineas} de ${articulos.length} líneas no entran` : `${articulos.length} de ${articulos.length} líneas no entran`} a inventario.
                  El costo va directo a la obra contra {cd.destinos.join(" · ")}.
                </span>
              </div>
            )}

            {pendiente && (
              <div className="oc-aviso oc-aviso--info">
                <span className="oc-aviso__ic"><Icon name="info" size="sm" color="currentColor" /></span>
                <span className="oc-aviso__txt">
                  <span className="oc-aviso__tit">Aprobación irreversible</span>
                  Al aprobar, se enviará el pedido a Business Central (ERP) y le llegará al proveedor.
                  Desde acá no se puede revertir.
                </span>
              </div>
            )}

            <div className="oc-det__total">
              <span className="oc-det__rot">Total de la orden · IVA incluido</span>
              <span className="oc-det__total-num">{money(ordenTotalConIva(orden), orden.currencyCode)}</span>
            </div>
          </>
        )}

        {tab === "lineas" && (
          <div className="oc-det__lista">
            {orden.lineas.map((l) => (
              <div key={l.id} className="oc-det__linea">
                <div className="oc-det__linea-tit">
                  <span className="ds-wrap ds-strong">{l.descripcion}</span>
                  {l.tipo === "cargo" && <Badge tone="yellow">Cargo</Badge>}
                </div>
                {(l.articuloId || l.variantCode) && (
                  <span className="oc-det__linea-cod">
                    {[l.articuloId, l.variantCode && `Variante ${l.variantCode}`].filter(Boolean).join(" · ")}
                  </span>
                )}
                {l.notaPedido && <span className="oc-det__linea-nota ds-wrap">“{l.notaPedido}”</span>}
                <div className="oc-det__linea-nums">
                  <span className="ds-nowrap">{num.format(l.cantidad)} {l.unidad} × {money(l.precioUnitario, orden.currencyCode)}</span>
                  <span className="ds-strong ds-nowrap">{money(ordenLineaImporte(l), orden.currencyCode)}</span>
                </div>
                <div className="oc-det__linea-dest">
                  {ordenLineaEsConsumoDirecto(l)
                    ? <>{l.obra || l.proyecto} · tarea {l.taskNo} <Badge tone="ink">Consumo directo</Badge></>
                    : <>{l.almacen || "Sin almacén"}{l.obra ? ` · obra ${l.obra}` : ""}</>}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "obra" && (
          <div className="oc-det__lista">
            {cd.hay && (
              <div className="oc-det__grupo">
                <span className="oc-det__rot">Consumo directo · el costo va a la obra</span>
                {articulos.filter(ordenLineaEsConsumoDirecto).map((l) => (
                  <div key={l.id} className="oc-det__obra-fila">
                    <span className="ds-wrap">{l.descripcion}</span>
                    <span className="oc-det__linea-dest">Proyecto {l.proyecto} · tarea {l.taskNo}{l.obra && l.obra !== l.proyecto ? ` · obra ${l.obra}` : ""}</span>
                  </div>
                ))}
              </div>
            )}
            {articulos.some((l) => !ordenLineaEsConsumoDirecto(l)) && (
              <div className="oc-det__grupo">
                <span className="oc-det__rot">A inventario · el costo lo paga el almacén</span>
                {articulos.filter((l) => !ordenLineaEsConsumoDirecto(l)).map((l) => (
                  <div key={l.id} className="oc-det__obra-fila">
                    <span className="ds-wrap">{l.descripcion}</span>
                    <span className="oc-det__linea-dest">
                      Almacén {l.almacen || "—"}{l.obra ? ` · la pidió la obra ${l.obra}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="oc-det__grupo">
              <span className="oc-det__rot">Solicitudes de origen</span>
              {ordenEsDirecta(orden) ? (
                <span className="oc-det__linea-dest">Compra directa · sin solicitud de origen.</span>
              ) : (
                <div className="oc-det__chips">
                  {peds.map((n) => {
                    const p = pedidos.find((x) => x.numero === n);
                    return p
                      ? <Link key={n} href={`/compras/solicitud/${p.id}`} className="badge-link" title={`Abrir la solicitud ${n}`}><Badge tone="gray">{n}</Badge></Link>
                      : <Badge key={n} tone="gray">{n}</Badge>;
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "historial" && <Timeline entidad="orden" idEntidad={orden.id} />}
      </div>

      {verProveedor && (
        <Modal wide title={provNombre ?? provCodigo ?? "Proveedor"} onClose={() => setVerProveedor(false)}>
          <div className="oc-prov">
            <p className="oc-prov__resumen">
              {delProveedor.length} {delProveedor.length === 1 ? "orden de compra" : "órdenes de compra"} a este proveedor ·{" "}
              {conFactura} con factura registrada.
            </p>
            <div className="oc-prov__lista">
              {delProveedor.map((o) => {
                const recs = recepciones.filter((r) => r.ordenId === o.id);
                const eb = ordenBadge(o.estado);
                return (
                  <div key={o.id} className={`oc-prov__item${o.id === orden.id ? " is-esta" : ""}`}>
                    <div className="oc-prov__top">
                      <Link href={`/compras/aprobacion/${o.id}`} className="oc-prov__num">{numeroOrdenPlano(o)}</Link>
                      <Badge tone={eb.tone}>{eb.label}</Badge>
                      {o.id === orden.id && <Badge tone="ink">La que estás viendo</Badge>}
                      <span className="oc-prov__fecha">{formatDate(o.fecha)}</span>
                      <span className="oc-prov__monto">{money(ordenTotalConIva(o), o.currencyCode)}</span>
                    </div>
                    {recs.length === 0 ? (
                      <span className="oc-prov__sin">Sin recibir todavía · no tiene factura registrada.</span>
                    ) : (
                      <ul className="oc-prov__facturas">
                        {recs.map((r) => (
                          <li key={r.id}>
                            <span className="oc-prov__fac-no">
                              {r.numeroFactura || "Recibido · factura en revisión"}
                            </span>
                            {r.fechaFactura && <span className="oc-prov__fecha">{formatDate(r.fechaFactura)}</span>}
                            <Badge tone={r.parcial ? "yellow" : "green"}>{r.parcial ? "Entrega parcial" : "Entrega completa"}</Badge>
                            <span className="oc-prov__monto">{money(r.total, o.currencyCode)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      <footer className="oc-det__pie">
        {pendiente && (
          <AprobarControl
            busy={aprobando}
            approveLabel={sinLanzarBc ? "Volver a lanzar en BC" : "Aprobar y enviar a BC"}
            slideLabel={sinLanzarBc ? "RELANZAR" : "APROBAR"}
            onApprove={onAprobar}
            onReject={onRechazar}
          />
        )}
        <Link href={`/compras/aprobacion/${orden.id}`} className="oc-det__completa">
          Ver la orden completa · facturas, imprimir y BC ↗
        </Link>
      </footer>
    </section>
  );
}

function Dato({ icon, rotulo, valor }: { icon: IconName; rotulo: string; valor: string }) {
  return (
    <div className="oc-det__dato">
      <span className="oc-det__ic oc-det__ic--sm"><Icon name={icon} size="sm" color="currentColor" /></span>
      <span className="oc-det__dato-txt">
        <span className="oc-det__rot">{rotulo}</span>
        <span className="oc-det__dato-val ds-wrap">{valor}</span>
      </span>
    </div>
  );
}
