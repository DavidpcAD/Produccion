"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/compras/shell";
import { Badge, Button, Card, Modal, Textarea, Tile, useToast } from "@/components/compras/ui";
import { useStore } from "@/lib/compras/store";
import { aprobarYLanzar } from "@/lib/compras/aprobar";
import { AprobarControl } from "@/components/compras/aprobar-control";
import { bcEstadoBadge, money, formatDate, num, numeroOrden, ordenAlmacenDestino, ordenBadge, ordenConsumoDirecto, ordenDevueltaPorBc, ordenLineaEsConsumoDirecto, ordenLineaImporte, ordenMaquinas, ordenTotalConIva } from "@/lib/compras/helpers";
import type { Orden } from "@/lib/compras/types";

// Los KPI de arriba son el filtro de la lista: cada uno muestra las órdenes de ese
// estado. "Abierto" = todavía en proveeduría (aún no la mandaron a aprobación).
type Filtro = Orden["estado"];
const TILES: { f: Filtro; label: string; accent: string; vacio: string }[] = [
  { f: "pendiente_aprobacion", label: "Pendientes de aprobación", accent: "var(--ds-color-yellow)", vacio: "No hay órdenes pendientes de aprobación." },
  { f: "lanzado", label: "Lanzadas", accent: "var(--ds-color-green-100)", vacio: "Todavía no hay órdenes lanzadas." },
  { f: "abierto", label: "Abiertas en proveeduría", accent: "var(--ds-color-gray-300)", vacio: "No hay órdenes abiertas en proveeduría." },
  { f: "completado", label: "Completadas", accent: "var(--ds-color-green-200)", vacio: "Todavía no hay órdenes completadas." },
];

export default function AprobacionPage() {
  const { ordenes, proveedores, pedidos, movimientos, bcEstados, setOrdenEstado, devolverOrden } = useStore();
  const toast = useToast();
  const prov = (id: string) => proveedores.find((p) => p.id === id);
  const [rechObj, setRechObj] = useState<{ id: string; numero: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState(false);
  const [abierto, setAbierto] = useState<Set<string>>(new Set());
  const [ordenMonto, setOrdenMonto] = useState<"desc" | "asc">("desc");
  const [filtro, setFiltro] = useState<Filtro>("pendiente_aprobacion");

  const totalDe = (o: Orden) => ordenTotalConIva(o);
  const cuenta = (f: Filtro) => ordenes.filter((o) => o.estado === f).length;
  const lista = [...ordenes.filter((o) => o.estado === filtro)]
    .sort((a, b) => (ordenMonto === "desc" ? totalDe(b) - totalDe(a) : totalDe(a) - totalDe(b)));
  // Aprobar/rechazar (y el lote) solo aplican a las pendientes; en los demás filtros
  // la lista es de consulta y cada tarjeta abre el detalle.
  const esPendientes = filtro === "pendiente_aprobacion";
  const tile = TILES.find((t) => t.f === filtro)!;
  const cambiarFiltro = (f: Filtro) => { setFiltro(f); setSel(new Set()); setAbierto(new Set()); };
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAbierto = (id: string) => setAbierto((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const todasAbiertas = lista.length > 0 && lista.every((o) => abierto.has(o.id));
  const seleccionadas = esPendientes ? lista.filter((o) => sel.has(o.id)) : [];

  // Crea y lanza en BC; solo pasa a "lanzado" si BC de verdad lo hizo (lib/aprobar.ts).
  async function aprobar(o: Orden) {
    if (lote || aprobandoId) return; // ya hay una aprobación en vuelo
    setAprobandoId(o.id);
    const r = await aprobarYLanzar(o, setOrdenEstado);
    toast(r.message, r.tone);
    setAprobandoId(null);
    // Sale de la selección: ya no está en la lista y el contador del lote mentiría.
    setSel((s) => { const n = new Set(s); n.delete(o.id); return n; });
  }
  // Aprobar y lanzar en LOTE: una por una (BC no debe recibir todo en paralelo).
  async function aprobarSeleccionadas() {
    if (!seleccionadas.length || lote || aprobandoId) return;
    setLote(true);
    let ok = 0; const fallos: string[] = [];
    for (const o of seleccionadas) {
      const r = await aprobarYLanzar(o, setOrdenEstado);
      if (r.ok) ok++; else fallos.push(numeroOrden(o));
    }
    setLote(false); setSel(new Set());
    toast(`Aprobadas y lanzadas: ${ok}${fallos.length ? ` · con problema: ${fallos.join(", ")} (revisá cada una)` : ""}`, fallos.length ? "info" : "success");
  }
  // Rechazar/denegar: motivo OBLIGATORIO; vuelve a Proveeduría con la nota.
  async function confirmarRechazo() {
    if (!rechObj) return;
    if (!motivo.trim()) { toast("Escribí el motivo del rechazo.", "error"); return; }
    const r = await devolverOrden(rechObj.id, motivo.trim());
    // Si BC no se pudo poner al día (reabrir + cancelar la solicitud del workflow), se
    // dice: si no, el pedido queda "Pendiente de aprobación" en BC y nadie sabría por qué.
    if (r?.bcAviso) toast(`Orden ${rechObj.numero} devuelta a proveeduría · ⚠️ ${r.bcAviso}`, "error");
    else toast(`Orden ${rechObj.numero} devuelta a proveeduría`, "info");
    setSel((s) => { const n = new Set(s); n.delete(rechObj.id); return n; });
    setRechObj(null); setMotivo("");
  }

  return (
    <AppShell role="aprobacion">
      <main className="page">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Órdenes por aprobar</h1>
            <p className="ds-muted">Revisá las órdenes que proveeduría envió a aprobación. Al aprobar pasan a “Lanzado” y se envían al proveedor.</p>
            <p className="ds-muted ds-body-sm">Tocá un panel para ver esas órdenes, y la orden para abrirla completa: líneas, obra, facturas e historial. La flecha muestra las líneas sin salir de acá.</p>
          </div>
        </div>

        <div className="tiles mt-2">
          {TILES.map((t) => (
            <Tile key={t.f} value={cuenta(t.f)} label={t.label} accent={t.accent}
              onClick={() => cambiarFiltro(t.f)} active={filtro === t.f} />
          ))}
        </div>

        {lista.length > 0 && (
          <div className="row row--between wrap gap-3 mt-6" style={{ alignItems: "center", padding: "10px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--ds-color-green-100) 8%, var(--ds-tint-base))", border: "1.5px solid var(--ds-color-gray-100)" }}>
            <div className="row gap-4 wrap" style={{ alignItems: "center" }}>
              {esPendientes ? (
                <label className="row gap-2" style={{ alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" className="ds-cbx" checked={seleccionadas.length > 0 && seleccionadas.length === lista.length}
                    ref={(el) => { if (el) el.indeterminate = seleccionadas.length > 0 && seleccionadas.length < lista.length; }}
                    onChange={(e) => setSel(e.target.checked ? new Set(lista.map((o) => o.id)) : new Set())} />
                  <span className="ds-body-sm ds-strong">Seleccionar todas ({lista.length})</span>
                </label>
              ) : (
                <span className="ds-body-sm ds-strong">{tile.label} ({lista.length})</span>
              )}
              <button type="button" className="ds-body-sm ds-strong"
                onClick={() => setAbierto(todasAbiertas ? new Set() : new Set(lista.map((o) => o.id)))}
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--ds-color-green-200)", textDecoration: "underline" }}>
                {todasAbiertas ? "Colapsar todas" : "Expandir todas"}
              </button>
              {/* Ordenar por monto (mayor↔menor) */}
              <div className="row gap-0" style={{ alignItems: "center", border: "1.5px solid var(--ds-color-gray-100)", borderRadius: 8, overflow: "hidden" }}>
                {([["desc", "Mayor $"], ["asc", "Menor $"]] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setOrdenMonto(v)}
                    className="ds-body-sm ds-strong"
                    style={{ padding: "5px 10px", cursor: "pointer", border: 0,
                      background: ordenMonto === v ? "var(--ds-color-black)" : "transparent",
                      color: ordenMonto === v ? "var(--ds-color-white)" : "var(--ds-color-gray-400)" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {!esPendientes ? (
              <span className="ds-muted ds-body-sm">Solo lectura: estas órdenes ya no se aprueban acá. Tocá una para ver su detalle e historial.</span>
            ) : seleccionadas.length > 0 ? (
              <div style={{ flex: "1 1 300px", minWidth: 240, maxWidth: 420 }}>
                <AprobarControl oneWay busy={lote || aprobandoId !== null}
                  approveLabel={`Aprobar y lanzar (${seleccionadas.length})`} onApprove={aprobarSeleccionadas} />
              </div>
            ) : (
              <span className="ds-muted ds-body-sm">Seleccioná órdenes para aprobar y lanzar en lote.</span>
            )}
          </div>
        )}

        <div className="col gap-4 mt-4">
          {lista.length === 0 && <Card><div className="empty" style={{ lineHeight: 1.6 }}>{tile.vacio}<br /><span className="ds-muted ds-body-sm">Tocá otro panel de arriba para ver las de otro estado, o abrí la pestaña <strong>“Todas las órdenes”</strong> para buscarlas todas juntas.</span></div></Card>}
          {lista.map((o) => {
            const articulos = o.lineas.filter((l) => l.tipo === "articulo");
            const maquinas = ordenMaquinas(o, pedidos);
            const total = ordenTotalConIva(o);
            const open = abierto.has(o.id);
            const b = ordenBadge(o.estado);
            // Consumo directo: el costo se carga a la obra y el material NO entra a
            // inventario. Quien aprueba tiene que verlo ANTES de lanzar.
            const cd = ordenConsumoDirecto(o);
            // Un solo almacén destino → va en el encabezado y la tabla muestra la
            // OBRA por línea (compacto, se lee en teléfono). Mezcla → columna Almacén.
            const alm = ordenAlmacenDestino(o);
            // Ya estaba aprobada y BC la devolvió: el pedido allá no quedó lanzado. Se
            // dice en la tarjeta y el botón pasa a "Volver a lanzar en BC".
            const sinLanzarBc = ordenDevueltaPorBc(o, movimientos);
            // Lo que BC contestó del pedido (última sincronización). Si la tarjeta ya dice
            // "Sin lanzar en BC", el mismo dato en amarillo sería repetirlo.
            const enBc = bcEstados[o.id] && !(sinLanzarBc && bcEstados[o.id] !== "lanzado") ? bcEstadoBadge(o.estado, bcEstados[o.id]) : null;
            return (
              <Card key={o.id}>
                <div className="row wrap gap-3" style={{ alignItems: "flex-start" }}>
                  {/* La flecha SOLO expande las líneas acá mismo (vistazo rápido). */}
                  <button type="button" onClick={() => toggleAbierto(o.id)} aria-expanded={open}
                    title={open ? "Ocultar las líneas" : "Ver las líneas sin salir de la lista"}
                    aria-label={open ? `Ocultar las líneas de ${numeroOrden(o)}` : `Ver las líneas de ${numeroOrden(o)}`}
                    className={`dt-exp-btn${open ? " is-open" : ""}`} style={{ flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  {/* El check SOLO selecciona para el lote: fuera del link, no navega. */}
                  {esPendientes && (
                    <input type="checkbox" className="ds-cbx" checked={sel.has(o.id)} onChange={() => toggleSel(o.id)}
                      title="Seleccionar para aprobar en lote" aria-label={`Seleccionar ${numeroOrden(o)} para aprobar en lote`}
                      style={{ flexShrink: 0, marginTop: 10 }} />
                  )}
                  {/* Tocar la orden (número, proveedor o monto) la ABRE: detalle e historial. */}
                  <Link href={`/compras/aprobacion/${o.id}`}
                    className="oc-open-row row row--between wrap gap-4"
                    title={`Abrir ${numeroOrden(o)}: líneas, obra, facturas e historial`}>
                    <span className="col" style={{ gap: 4, minWidth: 180 }}>
                      <span className="row gap-3 wrap" style={{ alignItems: "center" }}>
                        <span className="ds-subtitle oc-open-row__num">{numeroOrden(o)}</span>
                        <Badge tone={b.tone}>{b.label}</Badge>
                        {sinLanzarBc && (
                          <Badge tone="red" title={`Ya la aprobaste, pero el pedido ${o.bcNumber} quedó sin lanzar en Business Central. Hay que volver a lanzarla.`}>
                            Sin lanzar en BC
                          </Badge>
                        )}
                        {enBc && <Badge tone={enBc.tone} title="Estado real del pedido en Business Central (última sincronización)">{enBc.label}</Badge>}
                        {cd.hay && (
                          <Badge tone="ink" title={`Se consume contra ${cd.destinos.join(" · ")}. El material NO entra a inventario: el costo va a la obra.`}>
                            CD · consumo directo{cd.parcial ? " (parcial)" : ""}
                          </Badge>
                        )}
                      </span>
                      <span className="ds-muted ds-label">{o.proveedorNo ?? prov(o.proveedorId)?.code} · {o.proveedorNombre ?? prov(o.proveedorId)?.nombre} · {formatDate(o.fecha)}</span>
                      <span className="ds-muted ds-body-sm">
                        {articulos.length} línea(s)
                        {alm.codigo && <> · Almacén destino: <span className="ds-strong">{alm.codigo}</span></>}
                        {alm.mixto && <> · Varios almacenes (ver líneas)</>}
                        {maquinas.length > 0 ? ` · Máquina: ${maquinas.join(", ")}` : ""}
                        <span className="oc-open-row__hint ds-strong"> · Ver detalle e historial ↗</span>
                      </span>
                      {cd.hay && (
                        <span className="ds-body-sm" style={{ color: "var(--ds-color-green-200)" }}>
                          {cd.parcial ? `${cd.lineas} de ${articulos.length} línea(s) se consumen` : "Se consume"} contra {cd.destinos.join(" · ")} · no entra a inventario
                        </span>
                      )}
                    </span>
                    {/* Monto total, grande y a la derecha (para leerlo de un vistazo) */}
                    <span className="col" style={{ alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                      <span className="ds-muted ds-body-sm" style={{ textTransform: "uppercase", letterSpacing: ".04em" }}>Total</span>
                      <span className="ds-strong" style={{ fontSize: 26, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{money(total, o.currencyCode)}</span>
                    </span>
                  </Link>
                </div>

                {open && (
                  <div className="ds-table-wrap mt-3" style={{ boxShadow: "none", border: "1.5px solid var(--ds-color-gray-100)" }}>
                    <table className="ds-table">
                      <thead>
                        <tr><th className="hide-mobile">Tipo</th><th>Descripción</th><th>Obra</th>{alm.mixto && <th className="hide-mobile">Almacén</th>}<th className="ds-num">Cantidad</th><th className="ds-num">Precio</th><th className="ds-num">Importe</th></tr>
                      </thead>
                      <tbody>
                        {o.lineas.map((l) => (
                          <tr key={l.id}>
                            <td className="hide-mobile">{l.tipo === "cargo" ? <Badge tone="yellow">Cargo</Badge> : <Badge tone="gray">Artículo</Badge>}</td>
                            <td>{l.descripcion}{l.pedidoNumero && <div className="ds-body-sm ds-muted">{l.pedidoNumero}</div>}</td>
                            <td className="ds-muted ds-body-sm">
                              {l.tipo === "articulo" && ordenLineaEsConsumoDirecto(l)
                                ? <span title={`Consumo directo contra ${l.proyecto} · tarea ${l.taskNo}: no entra a inventario`}>{l.obra || l.proyecto} <Badge tone="ink">CD</Badge></span>
                                : (l.obra || "—")}
                            </td>
                            {alm.mixto && <td className="ds-muted ds-body-sm hide-mobile">{l.almacen || "—"}</td>}
                            <td className="ds-num">{num.format(l.cantidad)} {l.unidad}</td>
                            <td className="ds-num">{money(l.precioUnitario, o.currencyCode)}</td>
                            <td className="ds-num ds-strong">{money(ordenLineaImporte(l), o.currencyCode)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Aprobar/Rechazar SIEMPRE al fondo de la tarjeta: al expandir queda
                    debajo de las líneas (mejor en celular y en PC). Solo en las
                    pendientes: en los otros filtros la lista es de consulta. */}
                {esPendientes && (
                  <div className="mt-4">
                    <AprobarControl
                      busy={lote || aprobandoId === o.id}
                      approveLabel={sinLanzarBc ? "↻ Volver a lanzar en BC" : "Aprobar y lanzar"}
                      title={`${numeroOrden(o)} · ${money(total, o.currencyCode)}`}
                      onApprove={() => aprobar(o)}
                      onReject={() => { setMotivo(""); setRechObj({ id: o.id, numero: numeroOrden(o) }); }}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {rechObj && (
          <Modal title={`Rechazar ${rechObj.numero}`} onClose={() => setRechObj(null)}
            footer={<><Button variant="outline" onClick={() => setRechObj(null)}>Cancelar</Button><Button variant="red" onClick={confirmarRechazo}>Rechazar y devolver</Button></>}>
            <p className="ds-muted ds-body-sm" style={{ marginTop: 0 }}>Indicá por qué se devuelve la orden. Le llega una notificación a Proveeduría y el motivo queda en el historial.</p>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del rechazo…" rows={4} style={{ width: "100%" }} />
          </Modal>
        )}
      </main>
    </AppShell>
  );
}
