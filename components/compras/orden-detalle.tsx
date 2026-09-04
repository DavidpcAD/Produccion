"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, useToast } from "@/components/compras/ui";
import { IconChevronDown } from "@/components/compras/icons";
import { OrderLinesTable } from "@/components/compras/order-lines";
import { Timeline } from "@/components/compras/timeline";
import { useStore } from "@/lib/compras/store";
import { bcEstadoBadge, money, num, formatDate, numeroOrden, ordenAlmacenDestino, ordenBadge, ordenConsumoDirecto, ordenDevueltaPorBc, ordenLineaImporte, ordenTotalConIva, ordenRecibidoPct, ordenPedidos, ordenMaquinas, ordenEsDirecta, ordenLineasSinObra } from "@/lib/compras/helpers";
import type { Orden, Pedido } from "@/lib/compras/types";
import type { EstadoBcOrden } from "@/lib/compras/api";

// Vista de detalle de una orden, reutilizada por Proveeduría, Aprobación y Bodega.
// `acciones` son los botones específicos de cada rol (aprobar, recibir, etc.).
export function OrdenDetalle({
  orden,
  volverHref,
  volverLabel = "Volver",
  acciones,
  pedidoHref,
}: {
  orden: Orden;
  volverHref: string;
  volverLabel?: string;
  acciones?: React.ReactNode;
  // A dónde lleva una solicitud de origen. Por defecto, a la vista de solo lectura
  // compartida; Proveeduría la manda a la suya, donde además puede ordenarla.
  pedidoHref?: (p: Pedido) => string;
}) {
  const { proveedores, recepciones, pedidos, movimientos, bcEstados, sincronizarBc, setOrdenEstado } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [verFactura, setVerFactura] = useState<string | null>(null);
  const [relanzando, setRelanzando] = useState(false);
  // Totales calculados por BC (fuente de verdad). Se leen si la orden ya está en BC.
  const [bcTot, setBcTot] = useState<{ subtotal: number; iva: number; total: number; currencyCode: string } | null>(null);
  useEffect(() => {
    if (!orden.bcNumber) { setBcTot(null); return; }
    let vivo = true;
    fetch(`/api/compras/bc/orden-totales?orderNo=${encodeURIComponent(orden.bcNumber)}`)
      .then((r) => (r.ok ? r.json() : { totales: null }))
      .then((d) => { if (vivo && d?.totales) setBcTot(d.totales); })
      .catch(() => { /* sin BC: se muestran los totales locales */ });
    return () => { vivo = false; };
  }, [orden.bcNumber]);

  // Le pregunta a BC cómo está el pedido al abrir la orden (y cada vez que cambia su
  // estado). Si el estado de acá no calza con el de allá, el servidor lo corrige (ver
  // /api/compras/ordenes/sincronizar-bc) y el store se recarga; acá solo se muestra lo
  // que BC dijo y se avisa del cambio, para que nadie se quede mirando un "Lanzado"
  // que en BC no existe.
  const [bcEstadoLeido, setBcEstado] = useState<EstadoBcOrden | null>(null);
  // Mientras llega la lectura fresca se muestra lo que el store ya sabe de la última
  // sincronización. Sin pedido en BC no hay estado que mostrar (se deriva, no se
  // resetea el state dentro del efecto).
  const bcEstado = orden.bcNumber ? (bcEstadoLeido ?? bcEstados[orden.id] ?? null) : null;
  useEffect(() => {
    if (!orden.bcNumber) return;
    let vivo = true;
    sincronizarBc([orden.id]).then((r) => {
      if (!vivo || !r) return;
      setBcEstado(r.estados[orden.id] ?? (r.desconocido ? "desconocido" : null));
      const c = r.corregidas.find((x) => x.id === orden.id);
      if (!c) return;
      toast(c.a === "lanzado"
        ? `${orden.bcNumber} ya estaba lanzado en Business Central: la orden pasó a Lanzado.`
        : `${orden.bcNumber} NO está lanzado en Business Central (está ${c.bcEstado === "abierto" ? "Abierto" : "Pendiente de aprobación"}): la orden volvió a Pendiente de aprobación para volver a lanzarla.`, "info");
    }).catch(() => { /* sin BC no se afirma nada */ });
    return () => { vivo = false; };
  }, [orden.id, orden.bcNumber, orden.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reintenta el LANZAMIENTO en BC de un pedido ya creado (no duplica). No reescribe
  // las líneas: las escribe Proveeduría, que es la dueña del contenido, y pisarlas
  // desde acá le borraba el almacén que acababa de poner. La única corrección que sí
  // se hace es quitarle la OBRA a las líneas que van a inventario (ver `sinObra`).
  async function reintentarLanzar() {
    if (!orden.bcNumber) return;
    setRelanzando(true);
    try {
      const r = await fetch("/api/compras/bc/relanzar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // `sinObra` sí viaja: son las líneas que van a inventario, a las que hay que
        // quitarles la obra que Proveeduría le copió al Job No. del pedido en BC (con
        // el proyecto puesto, BC le carga el gasto al centro de costo de la obra).
        body: JSON.stringify({ orderNo: orden.bcNumber, sinObra: ordenLineasSinObra(orden) }),
      });
      const d = await r.json().catch(() => ({}));
      // `r.ok` solo no alcanza: con la sesión vencida el proxy redirige a /login y el
      // fetch termina en un 200 de HTML sin JSON — y este botón decía "lanzado" sin
      // haber tocado BC (caso del 26/08/2026). El éxito lo declara el body (`d.ok`).
      const avisoObra = d.obraQuitada ? ` · se le quitó la obra a ${d.obraQuitada} línea(s) de almacén` : "";
      if (r.ok && d.ok) {
        toast(`BC ${orden.bcNumber}: ${d.status ?? (d.yaLanzado ? "ya estaba lanzado" : "lanzado")}${avisoObra}`, "success");
        if (orden.estado !== "lanzado") {
          // BC lo dejó lanzado: la orden pasa a "lanzado" acá también. Antes quedaba
          // pendiente con el pedido lanzado en BC hasta que la sincronización la alcanzara.
          try { await setOrdenEstado(orden.id, "lanzado", { bcNumber: orden.bcNumber }); }
          catch (e: any) { toast(`Se lanzó en BC, pero no se pudo marcar acá: ${String(e?.message ?? e)}`, "error"); }
        } else {
          // Ya figuraba lanzada acá (era BC el que no la tenía lanzada): solo se relee
          // BC para que el aviso rojo y el badge se pongan al día.
          const s = await sincronizarBc([orden.id]);
          if (s) setBcEstado(s.estados[orden.id] ?? null);
        }
      }
      else if (r.ok && !("ok" in d)) toast("No se pudo lanzar en BC: la sesión parece vencida. Recargá la página y volvé a entrar.", "error");
      else toast(`No se pudo lanzar en BC: ${d.error ?? `HTTP ${r.status}`}`, "error");
    } catch (e: any) {
      toast(`No se pudo lanzar en BC: ${String(e?.message ?? e)}`, "error");
    } finally {
      setRelanzando(false);
    }
  }

  const prov = proveedores.find((p) => p.id === orden.proveedorId);
  const b = ordenBadge(orden.estado);
  const peds = ordenPedidos(orden);
  // Solicitud de origen (por número, o por la línea exacta cuando se sabe cuál es).
  const hrefSolicitud = (numero?: string | null, lineaId?: string | null) => {
    const p = (lineaId ? pedidos.find((x) => x.lineas.some((ln) => ln.id === lineaId)) : undefined)
      ?? (numero ? pedidos.find((x) => x.numero === numero) : undefined);
    if (!p) return null;
    return pedidoHref ? pedidoHref(p) : `/compras/solicitud/${p.id}`;
  };
  const maquinas = ordenMaquinas(orden, pedidos);
  const alm = ordenAlmacenDestino(orden);
  const esDirecta = ordenEsDirecta(orden);
  // Consumo directo: el material NO entra a inventario, el costo se carga a la obra
  // (proyecto + tarea). Va arriba porque cambia qué significa recibir esta orden.
  const cd = ordenConsumoDirecto(orden);
  const recs = recepciones.filter((r) => r.ordenId === orden.id);
  // "Reintentar lanzar en BC" es para DESATASCAR un lanzamiento que falló, no un
  // atajo para lanzar sin aprobar. Solo aparece si el último movimiento de la orden
  // es el intento fallido que deja aprobar.ts ("lanzamiento_fallido") y la orden
  // sigue sin lanzarse: si después la editaron, la reabrieron o la reenviaron, el
  // camino vuelve a ser "Aprobar y lanzar".
  const falloAlLanzar = (() => {
    if (!orden.bcNumber || orden.estado === "lanzado" || orden.estado === "completado") return false;
    const movs = movimientos.filter((m) => m.entidad === "orden" && m.idEntidad === orden.id);
    const fallo = movs.filter((m) => m.tipoMovimiento === "lanzamiento_fallido").sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1);
    return !!fallo && !movs.some((m) => m.fecha > fallo.fecha);
  })();
  // Ya se había aprobado y BC la devolvió a pendiente porque el pedido allá no quedó
  // lanzado: se dice arriba, en rojo, porque cambia lo que hay que hacer con ella.
  const devueltaPorBc = ordenDevueltaPorBc(orden, movimientos);
  // La app dice "lanzado" y BC, leído al abrir, dice que el pedido está Abierto o
  // Pendiente de aprobación. El servidor ya está devolviendo la orden a pendiente,
  // pero la opción de lanzar tiene que estar ACÁ, en el momento en que se ve la
  // contradicción, sin depender de que esa corrección alcance a escribirse.
  const lanzadaSinLanzarEnBc = !!orden.bcNumber && orden.estado === "lanzado" && (bcEstado === "abierto" || bcEstado === "pendiente_aprobacion");
  const sinLanzarEnBc = devueltaPorBc || lanzadaSinLanzarEnBc;
  const subtotal = orden.lineas.filter((l) => l.tipo === "articulo").reduce((s, l) => s + ordenLineaImporte(l), 0);
  const iva = orden.lineas.filter((l) => l.tipo === "articulo").reduce((s, l) => s + ordenLineaImporte(l) * ((l.ivaPct || 0) / 100), 0);
  const flete = orden.lineas.filter((l) => l.tipo === "cargo").reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);

  return (
    <main className="page">
      <div className="back-link" onClick={() => router.push(volverHref)}>{volverLabel}</div>
      <div className="page__head">
        <div className="page__title">
          {/* Con tres badges (estado, BC, CD) en tablet el número se partía letra por
              letra: el número no se encoge y los badges bajan de línea. */}
          <div className="row gap-3 wrap">
            <h1 className="ds-heading" style={{ whiteSpace: "nowrap" }}>{numeroOrden(orden)}</h1>
            <Badge tone={b.tone}>{b.label}</Badge>
            {bcEstado && (() => {
              const bb = bcEstadoBadge(orden.estado, bcEstado);
              return <Badge tone={bb.tone} title="Estado real del pedido en Business Central, leído al abrir la orden.">{bb.label}</Badge>;
            })()}
            {esDirecta && <Badge tone="yellow">Directa</Badge>}
            {cd.hay && (
              <Badge tone="ink" title={`Se consume contra ${cd.destinos.join(" · ")}. El material NO entra a inventario: el costo va a la obra.`}>
                CD · consumo directo{cd.parcial ? " (parcial)" : ""}
              </Badge>
            )}
          </div>
          <p className="ds-muted">{orden.proveedorNo ?? prov?.code} · {orden.proveedorNombre ?? prov?.nombre} · emitida {formatDate(orden.fecha)} · recibido {ordenRecibidoPct(orden)}%</p>
          {sinLanzarEnBc && (
            <div className="ds-body-sm mt-2" style={{ padding: "8px 12px", borderRadius: 12, background: "color-mix(in srgb, var(--ds-color-red-100) 8%, var(--ds-tint-base))", border: "1.5px solid color-mix(in srgb, var(--ds-color-red-100) 30%, var(--ds-tint-base))", color: "var(--ds-color-red-200)" }}>
              <span className="ds-strong">Sin lanzar en Business Central.</span>{" "}
              {lanzadaSinLanzarEnBc
                ? <>La orden figura lanzada acá, pero el pedido {orden.bcNumber} está {bcEstado === "abierto" ? "Abierto" : "Pendiente de aprobación"} en BC y Bodega no puede recibir contra él. Dale «Volver a lanzar en BC».</>
                : <>La orden ya se había aprobado, pero el pedido {orden.bcNumber} quedó sin lanzar en BC y Bodega no puede recibir contra él. Aprobación tiene que darle «Volver a lanzar en BC».</>}
            </div>
          )}
          {cd.hay && (
            <p className="ds-body-sm" style={{ color: "var(--ds-color-green-200)" }}>
              {cd.parcial ? `${cd.lineas} de sus líneas se consumen` : "Se consume"} contra <span className="ds-strong">{cd.destinos.join(" · ")}</span> · no entra a inventario
            </p>
          )}
          {maquinas.length > 0 && <p className="ds-body-sm ds-muted">Máquina: <span className="ds-strong">{maquinas.join(", ")}</span></p>}
          {/* Almacén al que entra el material (lo que no es consumo directo). Único →
              se dice acá arriba; mezcla → se lee por línea en la tabla. */}
          {(alm.codigo || alm.mixto || orden.almacenRecepcion) && (
            <p className="ds-body-sm ds-muted">Almacén destino: <span className="ds-strong">{alm.codigo ?? (alm.mixto ? "varios (ver líneas)" : orden.almacenRecepcion)}</span></p>
          )}
          <div className="row gap-2 wrap mt-2">
            {esDirecta ? (
              <span className="ds-muted ds-body-sm">Compra directa · sin solicitud de origen</span>
            ) : (
              <>
                <span className="ds-muted ds-body-sm">Solicitudes origen:</span>
                {peds.map((n) => {
                  const href = hrefSolicitud(n);
                  return href
                    ? <Link key={n} href={href} className="badge-link" title={`Abrir la solicitud ${n}`}><Badge tone="gray">{n}</Badge></Link>
                    : <Badge key={n} tone="gray">{n}</Badge>;
                })}
              </>
            )}
          </div>
        </div>
        <div className="row gap-3">
          <Button variant="outline" size="sm" title="Imprimir / Guardar PDF para el proveedor"
            onClick={() => router.push(`/compras/proveeduria/ordenes/${orden.id}/imprimir`)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="7" rx="1" /></svg>
            Imprimir
          </Button>
          {orden.bcDeepLink && (
            <button className="link-btn" title="Abrir el Pedido en Business Central (editar · vista previa de registro · registrar)"
              onClick={() => window.open(orden.bcDeepLink!, "_blank")}>↗ Abrir en BC</button>
          )}
          {/* Con la orden "sin lanzar en BC" el camino es el botón «Volver a lanzar en BC»
              (el de Aprobación, o el de abajo): este link repetía la misma acción al lado. */}
          {falloAlLanzar && !sinLanzarEnBc && (
            <button className="link-btn" disabled={relanzando} title={`El último intento de lanzar ${orden.bcNumber} en BC falló. Reintentar el Release del pedido ya creado.`}
              onClick={reintentarLanzar}>{relanzando ? "Lanzando…" : "↻ Reintentar lanzar en BC"}</button>
          )}
          {/* "Lanzado" acá y sin lanzar en BC: la opción de lanzar va como botón, no
              como link, porque es LO que hay que hacer con esta orden. Lanza el pedido
              que ya existe en BC (no crea otro). */}
          {lanzadaSinLanzarEnBc && (
            <Button size="sm" disabled={relanzando}
              title={`La orden figura lanzada acá, pero el pedido ${orden.bcNumber} está sin lanzar en Business Central. Lanzar el pedido que ya existe (no se crea otro).`}
              onClick={reintentarLanzar}>{relanzando ? "Lanzando…" : "↻ Volver a lanzar en BC"}</Button>
          )}
          {acciones}
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <OrderLinesTable orden={orden} solicitudHref={(l) => hrefSolicitud(l.pedidoNumero, l.pedidoLineaId)} />
      </Card>

      <div className="row mt-6" style={{ justifyContent: "flex-end" }}>
        <div className="totals" style={{ minWidth: 320 }}>
          {bcTot ? (
            <>
              <div className="totals__row"><span>Subtotal (excl. IVA)</span><span>{money(bcTot.subtotal, bcTot.currencyCode || orden.currencyCode)}</span></div>
              <div className="totals__row"><span>IVA</span><span>{money(bcTot.iva, bcTot.currencyCode || orden.currencyCode)}</span></div>
              <div className="totals__row totals__row--grand" style={{ gridColumn: "1 / -1" }}><span>Total (con IVA)</span><span>{money(bcTot.total, bcTot.currencyCode || orden.currencyCode)}</span></div>
              <div style={{ gridColumn: "1 / -1" }} className="ds-body-sm ds-muted">Totales calculados por Business Central ✓</div>
            </>
          ) : (
            <>
              <div className="totals__row"><span>Subtotal artículos</span><span>{money(subtotal, orden.currencyCode)}</span></div>
              <div className="totals__row"><span>Flete</span><span>{money(flete, orden.currencyCode)}</span></div>
              <div className="totals__row"><span>IVA (materiales)</span><span>{money(iva, orden.currencyCode)}</span></div>
              <div className="totals__row totals__row--grand" style={{ gridColumn: "1 / -1" }}><span>Total orden</span><span>{money(ordenTotalConIva(orden), orden.currencyCode)}</span></div>
              {orden.bcNumber && <div style={{ gridColumn: "1 / -1" }} className="ds-body-sm ds-muted">Estimado local · los totales definitivos los calcula BC.</div>}
            </>
          )}
        </div>
      </div>

      <h3 className="ds-subtitle mt-6" style={{ marginBottom: 12 }}>Recepciones / facturas</h3>
      {recs.length === 0 ? (
        <Card flat><div className="ds-muted">Sin recepciones registradas todavía.</div></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div className="ds-table-wrap" style={{ boxShadow: "none" }}>
            <table className="ds-table">
              <thead><tr><th>Factura</th><th>Fecha factura</th><th>Fecha registro</th><th className="ds-num">Total</th><th>Tipo</th><th></th></tr></thead>
              <tbody>
                {recs.map((r) => {
                  const abierto = verFactura === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="is-clickable" onClick={() => setVerFactura(abierto ? null : r.id)}>
                        <td className="ds-strong">{r.numeroFactura}</td>
                        <td>{formatDate(r.fechaFactura)}</td>
                        <td>{formatDate(r.fechaRegistro)}</td>
                        <td className="ds-num">{money(r.total, orden.currencyCode)}</td>
                        <td>{r.parcial ? <Badge tone="yellow">Parcial</Badge> : <Badge tone="green">Completa</Badge>}</td>
                        <td className="ds-num ds-muted">
                          <span className="row gap-1" style={{ justifyContent: "flex-end", alignItems: "center" }}>
                            {abierto ? "ocultar" : "ver"}
                            <IconChevronDown size={16} style={{ transform: abierto ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
                          </span>
                        </td>
                      </tr>
                      {abierto && (
                        <tr>
                          <td colSpan={6} style={{ background: "var(--ds-color-surface)", padding: "6px 12px 14px" }}>
                            <div className="fac-det">
                              <div className="fac-det__head">
                                <span className="ds-strong">Factura {r.numeroFactura}</span>
                                <span className="ds-body-sm ds-muted">Registrada {formatDate(r.fechaRegistro)} · {r.parcial ? "entrega parcial" : "entrega completa"}</span>
                              </div>
                              <div className="fac-det__grid fac-det__colhead">
                                <span>Artículo</span>
                                <span className="fac-det__num">Cantidad</span>
                                <span className="fac-det__num">Precio factura</span>
                                <span className="fac-det__num">Importe</span>
                              </div>
                              {r.lineas.map((rl, i) => {
                                const ol = orden.lineas.find((x) => x.id === rl.ordenLineaId);
                                const precio = rl.precioFactura ?? ol?.precioUnitario ?? 0;
                                const distinto = ol != null && rl.precioFactura != null && rl.precioFactura !== ol.precioUnitario;
                                return (
                                  <div className="fac-det__grid" key={i}>
                                    <div>
                                      <div className="ds-strong">{ol?.descripcion ?? `Línea ${rl.ordenLineaId}`}</div>
                                      {ol?.articuloId && <div className="ds-body-sm ds-muted">{ol.articuloId}</div>}
                                    </div>
                                    <div className="fac-det__num">{num.format(rl.cantidadRecibida)} {ol?.unidad ?? ""}</div>
                                    <div className="fac-det__num">
                                      {money(precio, orden.currencyCode)}
                                      {distinto && <div className="ds-body-sm ds-pending-text">orden: {money(ol!.precioUnitario, orden.currencyCode)}</div>}
                                    </div>
                                    <div className="fac-det__num ds-strong">{money(precio * rl.cantidadRecibida, orden.currencyCode)}</div>
                                  </div>
                                );
                              })}
                              <div className="fac-det__total">
                                <span>Total factura</span>
                                <span className="fac-det__num">{money(r.total, orden.currencyCode)}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <h3 className="ds-subtitle mt-6" style={{ marginBottom: 12 }}>Historial</h3>
      <Card><Timeline entidad="orden" idEntidad={orden.id} /></Card>
    </main>
  );
}
