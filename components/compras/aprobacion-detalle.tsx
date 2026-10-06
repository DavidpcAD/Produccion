"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/compras/ui";
import { Icon, IconName } from "@/components/ds/Icon/Icon";
import { Timeline } from "@/components/compras/timeline";
import { AprobarControl } from "@/components/compras/aprobar-control";
import {
  InventarioBoton, InventarioLinea, codigosConInventario, useInventarioBc, useVerInventarioBc,
} from "@/components/compras/inventario-bc";
import { useStore } from "@/lib/compras/store";
import {
  bcEstadoBadge, formatDate, formatDateTime, money, num, numeroOrden, ordenAlmacenDestino, ordenBadge,
  ordenConsumoDirecto, ordenDevueltaPorBc, ordenEsDirecta, ordenLineaEsConsumoDirecto,
  numeroOrdenPlano, ordenLineaImporte, ordenMaquinas, ordenPedidos, ordenReabiertaTrasAprobar,
  ordenTotalConIva, ROL_LABEL,
} from "@/lib/compras/helpers";
import type { Orden, Pedido } from "@/lib/compras/types";

type Tab = "resumen" | "lineas" | "obra" | "historial";

// Riel de revisión de UNA orden, al lado de la lista (en celular, hoja de abajo).
// Existe para no tener que salir de la bandeja para decidir: aprobar es irreversible,
// así que lo que hay que mirar antes —proveedor, destino, consumo directo, monto— se
// lee acá mismo y la lista sigue a la vista. El detalle COMPLETO (facturas, imprimir,
// abrir en BC) sigue viviendo en su propia pantalla, enlazada abajo.
export function AprobacionDetalle({
  orden, aprobando = false, tabInicial = "resumen", onCerrar, onAprobar, onRechazar, onVerProveedor, onVerPedido,
}: {
  orden: Orden;
  aprobando?: boolean;
  /** Con qué pestaña abre. Desde la selección se entra por "lineas": lo que se quiere
   *  ver de una orden que está por aprobarse es qué se compra y en cuánto. */
  tabInicial?: Tab;
  onCerrar: () => void;
  /** Sin estos dos el riel es de consulta (Todas las órdenes): se ve todo, pero no
   *  se aprueba ni se rechaza desde ahí. */
  onAprobar?: () => void;
  onRechazar?: () => void;
  /** Abre el panel del proveedor (al lado del riel), con su historial de compras. */
  onVerProveedor: (codigo: string) => void;
  /** Abre el panel de UNA solicitud de origen (PED-…), en la misma columna que el
   *  del proveedor. Con varias solicitudes, la que se tocó. */
  onVerPedido: (numero: string) => void;
}) {
  const { proveedores, pedidos, movimientos, bcEstados, cargandoExtra, cargarMovimientos } = useStore();
  const [tab, setTab] = useState<Tab>(tabInicial);
  const marco = useRef<HTMLElement>(null);

  // Cuánto hay de cada material en BC. Es opcional —el mismo interruptor que en la
  // lista— y solo se consulta estando en "Líneas", que es donde se muestra.
  const [verInv] = useVerInventarioBc();
  const codigosInv = useMemo(() => codigosConInventario(orden.lineas), [orden.lineas]);
  const { stock, estado: estadoInv } = useInventarioBc(codigosInv, tab === "lineas" && verInv);

  useEffect(() => { void cargarMovimientos([{ entidad: "orden", id: orden.id }]); }, [orden.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Ya se aprobó una vez y fue PROVEEDURÍA la que la volvió a abrir, para cambiarle
  // algo antes de mandarla de nuevo. Lo que hay que leer antes de volver a firmarla es
  // qué le cambiaron desde aquella aprobación, así que el aviso lo trae.
  const reab = ordenReabiertaTrasAprobar(orden, movimientos);
  // Lo último que contestó BC. Si la orden ya dice "sin lanzar", repetirlo es ruido.
  const enBc = bcEstados[orden.id] && !(sinLanzarBc && bcEstados[orden.id] !== "lanzado")
    ? bcEstadoBadge(orden.estado, bcEstados[orden.id]) : null;


  const comentarios = useMemo(() => {
    const out: { quien: string; rol: string; fecha?: string; texto: string }[] = [];
    // 1) El que pidió el material: la nota de su solicitud.
    for (const n of ordenPedidos(orden)) {
      const ped = pedidos.find((x) => x.numero === n);
      if (ped?.notas?.trim()) out.push({ quien: ped.solicitante, rol: `Solicitó · ${n}`, fecha: ped.fecha, texto: ped.notas.trim() });
    }
    // 2) y 3) Lo que quedó escrito en la bitácora de la orden (proveeduría al armarla,
    // aprobación al devolverla o al fallar el lanzamiento).
    for (const m of movimientos) {
      if (m.entidad !== "orden" || m.idEntidad !== orden.id) continue;
      if (!m.detalle?.trim()) continue;
      out.push({ quien: m.usuario, rol: ROL_LABEL[m.rol] ?? m.rol, fecha: m.fecha, texto: m.detalle.trim() });
    }
    // El motivo del último rechazo puede vivir en la orden y no en la bitácora.
    const suelto = orden.motivoRechazo?.trim() || orden.notas?.trim();
    if (suelto && !out.some((c) => c.texto === suelto)) out.push({ quien: "Aprobación", rol: "Aprobación", texto: suelto });
    return out;
  }, [orden, pedidos, movimientos]);

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
            {reab && (
              <Badge tone="ink" title={`Se aprobó el ${formatDateTime(reab.fechaAprobacion)} y ${reab.reabiertaPor} la volvió a abrir el ${formatDateTime(reab.fechaReapertura)}.`}>
                Ya aprobada · reabierta
              </Badge>
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
            <button type="button" className="oc-det__prov" disabled={!provCodigo}
              onClick={() => provCodigo && onVerProveedor(provCodigo)}
              title={`Ver todas las órdenes de compra hechas a ${provNombre ?? provCodigo ?? "este proveedor"}`}>
              <span className="oc-det__ic"><Icon name="user" size="md" color="currentColor" /></span>
              <span className="oc-det__dato-txt">
                <span className="oc-det__rot">Proveedor</span>
                <span className="oc-det__prov-cod">{provCodigo ?? "—"}</span>
                <span className="oc-det__prov-nom ds-wrap">{provNombre ?? "Sin proveedor"}</span>
              </span>
              <span className="oc-det__prov-ir" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </button>

            {/* De dónde salió la compra. Vivía solo al fondo de "Obra y proyecto", y quien
                aprueba abre el riel en Resumen: desde ahí no había cómo llegar a la
                solicitud ni ver quién pidió el material sin salirse de la bandeja. */}
            {ordenEsDirecta(orden)
              ? <Dato icon="boleta" rotulo="Solicitud de origen" valor="Compra directa · sin solicitud" />
              : peds.map((n) => (
                <SolicitudOrigen key={n} numero={n} pedido={pedidos.find((x) => x.numero === n)}
                  cargando={cargandoExtra} onVer={() => onVerPedido(n)} />
              ))}

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

            {reab && (
              <div className="oc-aviso oc-aviso--amarillo">
                <span className="oc-aviso__ic"><Icon name="reloj" size="sm" color="currentColor" /></span>
                <span className="oc-aviso__txt">
                  <span className="oc-aviso__tit">
                    Esta orden ya se había aprobado{reab.veces > 1 ? ` ${reab.veces} veces` : ""} y la volvieron a abrir
                  </span>
                  Se aprobó y se lanzó el {formatDateTime(reab.fechaAprobacion)} ({reab.aprobadaPor}).
                  {" "}{reab.reabiertaPor}{reab.rolReabrio ? ` · ${reab.rolReabrio}` : ""} la volvió a abrir el{" "}
                  {formatDateTime(reab.fechaReapertura)} para cambiarle algo y la mandó de nuevo a aprobación.
                  {orden.bcNumber ? ` Al aprobar se vuelve a lanzar el mismo pedido ${orden.bcNumber} en Business Central: no se crea otro.` : ""}
                  <span className="ds-strong">
                    {reab.cambios.length === 0
                      ? "No quedó anotado ningún cambio: compará las líneas antes de volver a aprobarla."
                      : `Lo que le cambiaron desde aquella aprobación (${reab.cambios.length}):`}
                  </span>
                  {reab.cambios.map((c, i) => (
                    <span key={`${c.fecha}-${i}`} className="ds-wrap">
                      · {formatDateTime(c.fecha)} · {c.usuario}{c.detalle ? ` · ${c.detalle}` : " · editó la orden (sin detalle)"}
                    </span>
                  ))}
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

            {/* Solo donde se puede aprobar: en la consulta de Todas las órdenes, avisar
                de algo que no se puede hacer desde ahí es ruido. */}
            {pendiente && onAprobar && (
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

            {/* Lo que dejó dicho cada etapa: quien pidió el material, quien armó la
                compra y quien la aprueba. Es lo que hay que leer antes de decidir. */}
            <div className="oc-det__grupo">
              <span className="oc-det__rot">Comentarios</span>
              {comentarios.length === 0 ? (
                <span className="oc-det__linea-dest">
                  Nadie dejó comentarios en esta orden. Los de cada material se leen en la pestaña “Líneas”.
                </span>
              ) : (
                <ul className="oc-com">
                  {comentarios.map((c, i) => (
                    <li key={`${c.rol}-${i}`} className="oc-com__item">
                      <span className="oc-com__quien">
                        <span className="ds-strong">{c.quien}</span>
                        <span className="oc-com__rol">{c.rol}</span>
                        {c.fecha && <span className="oc-com__fecha">{formatDateTime(c.fecha)}</span>}
                      </span>
                      <span className="oc-com__txt ds-wrap">{c.texto}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {tab === "lineas" && (
          <div className="oc-det__lista">
            <div className="oc-det__total">
              <span className="oc-det__rot">Total de la orden · IVA incluido</span>
              <span className="oc-det__total-num">{money(ordenTotalConIva(orden), orden.currencyCode)}</span>
            </div>
            {codigosInv.length > 0 && <InventarioBoton estado={estadoInv} />}
            {orden.lineas.map((l, i) => (
              <div key={l.id} className="oc-det__linea">
                <div className="oc-det__linea-tit">
                  <span className="oc-det__linea-n" aria-hidden>{i + 1}</span>
                  <span className="oc-det__linea-nom">
                    <span className="ds-wrap ds-strong">{l.descripcion}</span>
                    {/* De qué solicitud salió la línea: en una orden que junta varios
                        pedidos es lo único que dice cuál material pidió quién. */}
                    {(l.articuloId || l.variantCode || lineaPedido(l)) && (
                      <span className="oc-det__linea-cod">
                        {[l.articuloId, l.variantCode && `Variante ${l.variantCode}`, lineaPedido(l)].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {l.tipo === "cargo" && <Badge tone="yellow">Cargo</Badge>}
                </div>
                {l.notaPedido && <span className="oc-det__linea-nota ds-wrap">“{l.notaPedido}”</span>}
                <div className="oc-det__linea-grid">
                  <span>
                    <span className="oc-det__rot">Cantidad</span>
                    <span className="oc-det__linea-val">{num.format(l.cantidad)} {l.unidad}</span>
                  </span>
                  <span>
                    <span className="oc-det__rot">Precio unitario</span>
                    <span className="oc-det__linea-val">{money(l.precioUnitario, orden.currencyCode)}</span>
                  </span>
                  <span>
                    <span className="oc-det__rot">Total</span>
                    <span className="oc-det__linea-val ds-strong">{money(ordenLineaImporte(l), orden.currencyCode)}</span>
                  </span>
                </div>
                {ordenLineaEsConsumoDirecto(l) ? (
                  <div className="oc-det__linea-cd">
                    <span className="oc-det__linea-cd-tit">
                      <Icon name="alert" size="sm" color="currentColor" /> Consumo directo
                    </span>
                    <span>Proyecto: {l.proyecto} · Tarea: {l.taskNo}{l.obra && l.obra !== l.proyecto ? ` · Obra: ${l.obra}` : ""}</span>
                  </div>
                ) : (
                  <div className="oc-det__linea-dest">
                    Almacén {l.almacen || "—"}{l.obra ? ` · la pidió la obra ${l.obra}` : ""}
                  </div>
                )}
                {verInv && <InventarioLinea linea={l} stock={stock} estado={estadoInv} />}
              </div>
            ))}
          </div>
        )}

        {tab === "obra" && (
          <div className="oc-det__lista">
            {articulos.length === 0 && (
              <span className="oc-det__linea-dest">Esta orden no tiene líneas de material: no hay obra ni proyecto que mostrar.</span>
            )}
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
          </div>
        )}

        {tab === "historial" && <Timeline entidad="orden" idEntidad={orden.id} />}
      </div>

      <footer className="oc-det__pie">
        {pendiente && onAprobar && onRechazar && (
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

/** N.º de solicitud de una línea. "Manual" es lo que Proveeduría le pone a lo que
 *  agregó a mano: no es una solicitud, así que no se muestra como si lo fuera. */
function lineaPedido(l: { pedidoNumero?: string }): string | null {
  return l.pedidoNumero && l.pedidoNumero !== "Manual" ? l.pedidoNumero : null;
}

// La solicitud de la que salió la orden, en el Resumen: el número, quién pidió el
// material y la fecha. Abre el panel de la solicitud AL LADO, no una pantalla nueva:
// quien aprueba la lee y sigue con la orden abierta, igual que con el proveedor.
function SolicitudOrigen({ numero, pedido, cargando, onVer }: {
  numero: string; pedido?: Pedido; cargando: boolean; onVer: () => void;
}) {
  return (
    <button type="button" className="oc-det__sol" onClick={onVer}
      title={`Ver la solicitud ${numero}: qué se pidió, para qué obra y quién la pidió`}>
      <span className="oc-det__ic"><Icon name="boleta" size="md" color="currentColor" /></span>
      <span className="oc-det__dato-txt">
        <span className="oc-det__rot">Solicitud de origen</span>
        <span className="oc-det__sol-num">{numero}</span>
        <span className="oc-det__sol-quien ds-wrap">
          {pedido
            ? [pedido.solicitante && `La pidió ${pedido.solicitante}`, formatDate(pedido.fecha)].filter(Boolean).join(" · ")
            : cargando ? "Cargando la solicitud…" : "Tocá para ver la solicitud"}
        </span>
      </span>
      <span className="oc-det__sol-ir" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </button>
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
