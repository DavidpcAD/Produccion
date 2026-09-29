"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/compras/shell";
import { Button, Input, Modal, Select, Textarea, useToast } from "@/components/compras/ui";
import { AprobacionDetalle } from "@/components/compras/aprobacion-detalle";
import { AprobarControl } from "@/components/compras/aprobar-control";
import { IconChevronDown } from "@/components/compras/icons";
import { Icon } from "@/components/ds/Icon/Icon";
import { useStore } from "@/lib/compras/store";
import { aprobarYLanzar } from "@/lib/compras/aprobar";
import {
  bcEstadoBadge, formatDate, money, num, numeroOrden, numeroOrdenPlano, ordenAlmacenDestino, ordenConsumoDirecto,
  ordenDevueltaPorBc, ordenLineaEsConsumoDirecto, ordenLineaImporte, ordenMaquinas, ordenTotalConIva,
} from "@/lib/compras/helpers";
import { coincideBusqueda } from "@/lib/utilidades/buscar";
import type { Movimiento, Orden } from "@/lib/compras/types";
import type { EstadoBcOrden } from "@/lib/compras/api";

// Bandeja de aprobación: la lista a la izquierda y la orden que se está revisando en un
// riel a la derecha (en celular, una hoja que sube desde abajo). Aprobar es irreversible
// —el pedido se lanza en BC y le llega al proveedor—, así que lo que hay que mirar antes
// se lee sin salir de la lista y sin perder la selección del lote.

// Las tres fichas de arriba son VISTAS de la cola de aprobación, una dentro de otra:
// pendientes ⊃ requieren atención ⊃ sin lanzar en BC. Los demás estados (lanzadas, en
// proveeduría, completadas) no son cola de trabajo: se eligen desde "Filtros".
type Vista = "pendientes" | "atencion" | "sin_bc" | "lanzado" | "abierto" | "completado";
const FICHAS: Vista[] = ["pendientes", "atencion", "sin_bc"];
const OTROS_ESTADOS: Vista[] = ["lanzado", "abierto", "completado"];
const VISTA: Record<Vista, { label: string; vacio: string; ayuda: string }> = {
  pendientes: { label: "Pendientes", vacio: "No hay órdenes pendientes de aprobación.", ayuda: "Proveeduría ya las envió: falta aprobarlas o rechazarlas." },
  atencion: { label: "Requieren atención", vacio: "Ninguna pendiente tiene problemas con Business Central.", ayuda: "Pendientes con algo trabado en Business Central: el último intento de lanzar falló, BC dice otra cosa, o el pedido quedó sin lanzar." },
  sin_bc: { label: "Sin lanzar en BC", vacio: "Ninguna orden quedó sin lanzar en Business Central.", ayuda: "Ya se aprobaron, pero el pedido quedó sin lanzar en BC: Bodega no puede recibir contra él." },
  lanzado: { label: "Lanzadas", vacio: "Todavía no hay órdenes lanzadas.", ayuda: "Ya están en Business Central y el proveedor las tiene." },
  abierto: { label: "En proveeduría", vacio: "No hay órdenes abiertas en proveeduría.", ayuda: "Todavía se están armando: aún no llegaron a aprobación." },
  completado: { label: "Completadas", vacio: "Todavía no hay órdenes completadas.", ayuda: "Recibidas y facturadas." },
};

// Atajos del diálogo de rechazo: lo que más se devuelve. Rellenan el campo y se
// siguen pudiendo editar — el motivo lo escribe una persona, no un catálogo.
const MOTIVOS_RECHAZO = [
  "Precio por encima de lo esperado",
  "Falta cotización o comparación",
  "Proveedor equivocado",
  "Cantidad o unidad incorrecta",
  "Va contra otra obra o proyecto",
  "Se pidió por error",
];

type Orden_ = "recientes" | "antiguas" | "mayor" | "menor";
const ORDENES: { v: Orden_; label: string }[] = [
  { v: "recientes", label: "Más recientes" },
  { v: "antiguas", label: "Más antiguas" },
  { v: "mayor", label: "Monto mayor" },
  { v: "menor", label: "Monto menor" },
];

// "Requiere atención": la orden sigue pendiente pero algo quedó trabado del lado de BC y
// aprobarla de nuevo sin mirar no la desatasca. Tres casos, todos reales:
//  · el pedido ya existe en BC pero quedó sin lanzar (BC devolvió la orden),
//  · lo último que BC contestó contradice el estado de acá,
//  · el último intento de lanzar falló y nadie la volvió a tocar.
function requiereAtencion(o: Orden, movs: Movimiento[], bcEstados: Record<string, EstadoBcOrden>): boolean {
  if (o.estado !== "pendiente_aprobacion") return false;
  if (ordenDevueltaPorBc(o, movs)) return true;
  const bc = bcEstados[o.id];
  if (bc && bcEstadoBadge(o.estado, bc).contradice) return true;
  const suyos = movs.filter((m) => m.entidad === "orden" && m.idEntidad === o.id);
  const fallos = suyos.filter((m) => m.tipoMovimiento === "lanzamiento_fallido");
  const ultimoFallo = fallos.reduce<Movimiento | null>((a, m) => (!a || m.fecha > a.fecha ? m : a), null);
  return !!ultimoFallo && !suyos.some((m) => m.fecha > ultimoFallo.fecha);
}

export default function AprobacionPage() {
  const { ordenes, proveedores, pedidos, movimientos, bcEstados, setOrdenEstado, devolverOrden } = useStore();
  const toast = useToast();
  const [vista, setVista] = useState<Vista>("pendientes");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [busca, setBusca] = useState("");
  const [orden, setOrden] = useState<Orden_>("recientes");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [lineasAbiertas, setLineasAbiertas] = useState<Set<string>>(new Set());
  const [verSeleccion, setVerSeleccion] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [lote, setLote] = useState(false);
  const [rechObj, setRechObj] = useState<{ id: string; numero: string; proveedor?: string; monto: string } | null>(null);
  const [motivo, setMotivo] = useState("");

  // Las de cada vista, sin buscador: sirve para el contador de la ficha y para
  // distinguir "no hay ninguna" de "ninguna coincide con lo que buscaste".
  const deVista = useMemo(() => {
    const pendientes = ordenes.filter((o) => o.estado === "pendiente_aprobacion");
    return {
      pendientes,
      atencion: pendientes.filter((o) => requiereAtencion(o, movimientos, bcEstados)),
      sin_bc: pendientes.filter((o) => ordenDevueltaPorBc(o, movimientos)),
      lanzado: ordenes.filter((o) => o.estado === "lanzado"),
      abierto: ordenes.filter((o) => o.estado === "abierto"),
      completado: ordenes.filter((o) => o.estado === "completado"),
    } as Record<Vista, Orden[]>;
  }, [ordenes, movimientos, bcEstados]);

  // Se busca por lo que uno tiene a mano: N.º de orden (el de BC o el interno),
  // proveedor (código o nombre), solicitud de origen, obra/almacén de las líneas y
  // descripción de los artículos. Por palabras y sin tildes.
  const lista = useMemo(() => {
    const prov = (id: string) => proveedores.find((p) => p.id === id);
    const texto = (o: Orden) => [
      numeroOrden(o), o.numero, o.bcNumber,
      o.proveedorNo ?? prov(o.proveedorId)?.code, o.proveedorNombre ?? prov(o.proveedorId)?.nombre,
      ...o.lineas.flatMap((l) => [l.pedidoNumero, l.obra, l.proyecto, l.almacen, l.descripcion]),
    ].filter(Boolean).join(" ");
    const q = busca.trim();
    const cmp = (a: Orden, b: Orden) => {
      if (orden === "mayor") return ordenTotalConIva(b) - ordenTotalConIva(a);
      if (orden === "menor") return ordenTotalConIva(a) - ordenTotalConIva(b);
      const d = a.fecha.localeCompare(b.fecha);
      return orden === "antiguas" ? d : -d;
    };
    return deVista[vista].filter((o) => !q || coincideBusqueda(texto(o), q)).sort(cmp);
  }, [deVista, vista, busca, orden, proveedores]);

  const meta = VISTA[vista];
  // Aprobar y rechazar solo aplican a las pendientes (las tres vistas de la cola). En
  // los otros estados la bandeja es de consulta.
  const esPendiente = FICHAS.includes(vista);
  const abierta = ordenes.find((o) => o.id === abiertaId) ?? null;
  const seleccionadas = useMemo(
    () => (esPendiente ? lista.filter((o) => sel.has(o.id)) : []),
    [esPendiente, lista, sel],
  );
  // Monto del lote. Si hay monedas distintas NO se suman en un número: se muestra el
  // total de cada una (sumar colones con dólares sería inventar una cifra).
  const montoLote = useMemo(() => {
    const porMoneda = new Map<string, number>();
    for (const o of seleccionadas) {
      const m = o.currencyCode || "";
      porMoneda.set(m, (porMoneda.get(m) ?? 0) + ordenTotalConIva(o));
    }
    return [...porMoneda].map(([m, v]) => money(v, m)).join(" · ");
  }, [seleccionadas]);

  const cambiarVista = (v: Vista) => { setVista(v); setSel(new Set()); setAbiertaId(null); setLineasAbiertas(new Set()); setVerSeleccion(false); };
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleLineas = (id: string) => setLineasAbiertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sacarDeSeleccion = (id: string) => setSel((s) => { const n = new Set(s); n.delete(id); return n; });

  // Crea y lanza el pedido en BC; solo pasa a "lanzado" si BC de verdad lo hizo
  // (lib/compras/aprobar.ts).
  async function aprobar(o: Orden) {
    if (lote || aprobandoId) return; // ya hay una aprobación en vuelo
    setAprobandoId(o.id);
    const r = await aprobarYLanzar(o, setOrdenEstado);
    toast(r.message, r.tone);
    setAprobandoId(null);
    sacarDeSeleccion(o.id);
    // Ya no está en esta vista: dejar el riel abierto en una orden que salió de la
    // lista deja la pantalla contando algo que no es.
    if (r.ok) setAbiertaId(null);
  }
  // En LOTE: una por una (BC no debe recibir todo en paralelo).
  async function aprobarSeleccionadas() {
    if (!seleccionadas.length || lote || aprobandoId) return;
    setLote(true);
    let ok = 0; const fallos: string[] = [];
    for (const o of seleccionadas) {
      const r = await aprobarYLanzar(o, setOrdenEstado);
      if (r.ok) ok++; else fallos.push(numeroOrden(o));
    }
    setLote(false); setSel(new Set()); setAbiertaId(null); setVerSeleccion(false);
    toast(`Aprobadas y lanzadas: ${ok}${fallos.length ? ` · con problema: ${fallos.join(", ")} (revisá cada una)` : ""}`, fallos.length ? "info" : "success");
  }
  // Rechazar: el motivo es OBLIGATORIO y vuelve a Proveeduría con la nota.
  async function confirmarRechazo() {
    if (!rechObj) return;
    if (!motivo.trim()) { toast("Escribí el motivo del rechazo.", "error"); return; }
    const r = await devolverOrden(rechObj.id, motivo.trim());
    // Si BC no se pudo poner al día (reabrir + cancelar la solicitud del workflow) se
    // dice: si no, el pedido queda "Pendiente de aprobación" en BC y nadie sabría por qué.
    if (r?.bcAviso) toast(`Orden ${rechObj.numero} devuelta a proveeduría · ⚠️ ${r.bcAviso}`, "error");
    else toast(`Orden ${rechObj.numero} devuelta a proveeduría`, "info");
    sacarDeSeleccion(rechObj.id);
    if (abiertaId === rechObj.id) setAbiertaId(null);
    setRechObj(null); setMotivo("");
  }

  const hayFiltro = busca.trim().length > 0 || OTROS_ESTADOS.includes(vista);

  return (
    <AppShell role="aprobacion">
      <div className="oc-bandeja">
        <main className="oc-bandeja__lista">
          <header className="oc-bandeja__head">
            <h1 className="ds-heading">Aprobación de órdenes de compra</h1>
            {/* En PC se explica de qué va la pantalla. En celular ese párrafo se come
                media pantalla antes de la primera orden, y lo que dice (que aprobar no
                se puede revertir) se repite en el aviso de la hoja, justo arriba del
                deslizador — que es donde de verdad hace falta leerlo. Ahí va el conteo
                de la cola, que es lo que se quiere saber al entrar. */}
            <p className="ds-muted oc-bandeja__intro">
              Revisá las órdenes pendientes y aprobá o rechazá. Al aprobar se envía el pedido a
              Business Central (ERP) y no se puede revertir.
            </p>
            <p className="oc-bandeja__conteo">
              {deVista.pendientes.length} {deVista.pendientes.length === 1 ? "pendiente" : "pendientes"}
            </p>
          </header>

          <div className="oc-barra">
            <div className="oc-fichas" role="group" aria-label="Filtrar la cola de aprobación">
              {FICHAS.map((v) => (
                <button key={v} type="button" aria-pressed={vista === v} title={VISTA[v].ayuda}
                  className={`oc-ficha${vista === v ? " is-active" : ""}`} onClick={() => cambiarVista(v)}>
                  {VISTA[v].label} ({deVista[v].length})
                </button>
              ))}
              {/* Un estado que no es de la cola (se eligió en Filtros): se muestra como
                  ficha para que nunca quede un filtro puesto sin que se vea. */}
              {OTROS_ESTADOS.includes(vista) && (
                <button type="button" className="oc-ficha is-active" title="Quitar este filtro y volver a las pendientes"
                  onClick={() => cambiarVista("pendientes")}>
                  {meta.label} ({deVista[vista].length}) <span aria-hidden>✕</span>
                </button>
              )}
            </div>

            <div className="oc-barra__acciones">
              <button type="button" className={`oc-btn-filtros${filtrosAbiertos ? " is-open" : ""}`}
                aria-expanded={filtrosAbiertos} onClick={() => setFiltrosAbiertos((f) => !f)}>
                <Icon name="filter" size="sm" color="currentColor" />
                Filtros
                {hayFiltro && <span className="oc-btn-filtros__punto" aria-label="con filtros puestos" />}
              </button>
              <Select value={orden} onChange={(e) => setOrden(e.target.value as Orden_)} className="oc-barra__orden">
                {ORDENES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </Select>
            </div>
          </div>

          {filtrosAbiertos && (
            <div className="oc-filtros">
              <label className="oc-filtros__campo">
                <span className="oc-filtros__rot">Buscar</span>
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="N.º de orden, proveedor, obra o artículo…"
                  className="ds-form-field__input" />
              </label>
              <label className="oc-filtros__campo oc-filtros__campo--corto">
                <span className="oc-filtros__rot">Estado</span>
                <Select value={vista} onChange={(e) => cambiarVista(e.target.value as Vista)}>
                  {[...FICHAS, ...OTROS_ESTADOS].map((v) => (
                    <option key={v} value={v}>{VISTA[v].label} ({deVista[v].length})</option>
                  ))}
                </Select>
              </label>
              {esPendiente && lista.length > 0 && (
                <label className="oc-filtros__todas">
                  <input type="checkbox" className="ds-cbx"
                    checked={seleccionadas.length > 0 && seleccionadas.length === lista.length}
                    ref={(el) => { if (el) el.indeterminate = seleccionadas.length > 0 && seleccionadas.length < lista.length; }}
                    onChange={(e) => setSel(e.target.checked ? new Set(lista.map((o) => o.id)) : new Set())} />
                  <span>Seleccionar las {lista.length}</span>
                </label>
              )}
            </div>
          )}

          <div className="oc-bandeja__filas">
            {deVista[vista].length === 0 && (
              <div className="oc-vacio">
                <span className="ds-strong">{meta.vacio}</span>
                <span className="ds-muted ds-body-sm">Tocá otra ficha de arriba para ver las de otro estado.</span>
              </div>
            )}
            {deVista[vista].length > 0 && lista.length === 0 && (
              <div className="oc-vacio">
                <span className="ds-strong">Ninguna orden de «{meta.label}» coincide con “{busca.trim()}”.</span>
                <span className="ds-muted ds-body-sm">
                  Probá con el N.º de BC (CP-…), el proveedor o la solicitud (PED-…).{" "}
                  <button type="button" className="link-btn" onClick={() => setBusca("")}>Limpiar búsqueda</button>
                </span>
              </div>
            )}

            {lista.map((o) => {
              const articulos = o.lineas.filter((l) => l.tipo === "articulo");
              const cd = ordenConsumoDirecto(o);
              const alm = ordenAlmacenDestino(o);
              const maquinas = ordenMaquinas(o, pedidos);
              const sinLanzarBc = ordenDevueltaPorBc(o, movimientos);
              const verLineas = lineasAbiertas.has(o.id);
              const datos = [
                `${articulos.length} ${articulos.length === 1 ? "línea" : "líneas"}`,
                alm.codigo ?? (alm.mixto ? "Varios almacenes" : null),
                maquinas.length > 0 ? maquinas.join(", ") : null,
              ].filter(Boolean) as string[];
              return (
                <article key={o.id} className={`oc-fila${abiertaId === o.id ? " is-abierta" : ""}`}>
                  <div className="oc-fila__top">
                    {esPendiente && (
                      <input type="checkbox" className="ds-cbx oc-fila__cbx" checked={sel.has(o.id)} onChange={() => toggleSel(o.id)}
                        aria-label={`Seleccionar ${numeroOrdenPlano(o)} para aprobar en lote`} />
                    )}
                    <button type="button" className="oc-fila__abrir" onClick={() => setAbiertaId(o.id)}
                      aria-pressed={abiertaId === o.id}>
                      <span className="oc-fila__id">
                        <span className="oc-fila__linea1">
                          <span className="oc-fila__num">{numeroOrdenPlano(o)}</span>
                          <span className="oc-fila__fecha">{formatDate(o.fecha)}</span>
                        </span>
                        <span className="oc-fila__prov">
                          <span className="oc-fila__prov-nom">
                            {o.proveedorNombre ?? proveedores.find((p) => p.id === o.proveedorId)?.nombre}
                          </span>
                          <span className="oc-fila__prov-cod">
                            {o.proveedorNo ?? proveedores.find((p) => p.id === o.proveedorId)?.code}
                          </span>
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
                            title={`El pedido ${o.bcNumber} quedó sin lanzar en Business Central.`}>
                            <Icon name="traslado" size="sm" color="currentColor" />
                            Sin lanzar en BC
                          </span>
                        )}
                      </span>
                      <span className="oc-fila__total">{money(ordenTotalConIva(o), o.currencyCode)}</span>
                    </button>
                    <button type="button" className={`oc-fila__chev${verLineas ? " is-open" : ""}`} onClick={() => toggleLineas(o.id)}
                      aria-expanded={verLineas} aria-label={verLineas ? `Ocultar las líneas de ${numeroOrdenPlano(o)}` : `Ver las líneas de ${numeroOrdenPlano(o)}`}>
                      <IconChevronDown size={18} />
                    </button>
                    {/* Solo en celular: la tabla de líneas no cabe en 375px, así que el
                        chevron de arriba se esconde y este dice que la tarjeta abre la
                        hoja (las líneas se leen en la pestaña "Líneas" del detalle).
                        aria-hidden + tabIndex -1: `oc-fila__abrir` ya expone la acción,
                        y anunciarla dos veces solo ensucia el lector de pantalla. */}
                    <button type="button" className="oc-fila__ir" onClick={() => setAbiertaId(o.id)} aria-hidden tabIndex={-1}>
                      <IconChevronDown size={18} />
                    </button>
                  </div>

                  {verLineas && (
                    <div className="ds-table-wrap oc-fila__lineas">
                      <table className="ds-table">
                        <thead>
                          <tr><th>Descripción</th><th>Destino</th><th className="ds-num">Cantidad</th><th className="ds-num">Precio</th><th className="ds-num">Importe</th></tr>
                        </thead>
                        <tbody>
                          {o.lineas.map((l) => (
                            <tr key={l.id}>
                              <td className="ds-cell-texto">{l.descripcion}{l.pedidoNumero && <div className="ds-body-sm ds-muted">{l.pedidoNumero}</div>}</td>
                              <td className="ds-muted ds-body-sm">
                                {ordenLineaEsConsumoDirecto(l)
                                  ? <span title={`Consumo directo contra ${l.proyecto} · tarea ${l.taskNo}: no entra a inventario`}>{l.obra || l.proyecto} · CD</span>
                                  : (l.almacen || l.obra || "—")}
                              </td>
                              <td className="ds-num">{num.format(l.cantidad)} {l.unidad}</td>
                              <td className="ds-num">{money(l.precioUnitario, o.currencyCode)}</td>
                              <td className="ds-num ds-strong">{money(ordenLineaImporte(l), o.currencyCode)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {seleccionadas.length > 0 && (
            <div className="oc-lote-caja">
              {verSeleccion && (
                <ul className="oc-lote__detalle">
                  {seleccionadas.map((o) => (
                    <li key={o.id}>
                      <span className="ds-strong">{numeroOrdenPlano(o)}</span>
                      <span className="ds-muted">{o.proveedorNombre ?? proveedores.find((p) => p.id === o.proveedorId)?.nombre}</span>
                      <span className="oc-lote__detalle-monto">{money(ordenTotalConIva(o), o.currencyCode)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="oc-lote" role="region" aria-label="Órdenes seleccionadas para aprobar">
                <button type="button" className={`oc-lote__ver${verSeleccion ? " is-open" : ""}`}
                  aria-expanded={verSeleccion} onClick={() => setVerSeleccion((v) => !v)}
                  aria-label={verSeleccion ? "Ocultar las órdenes seleccionadas" : "Ver cuáles órdenes están seleccionadas"}>
                  <IconChevronDown size={18} />
                </button>
                <div className="oc-lote__info">
                  <span className="oc-lote__n">
                    {seleccionadas.length} {seleccionadas.length === 1 ? "orden seleccionada" : "órdenes seleccionadas"}
                  </span>
                  <span className="oc-lote__monto">Monto total: {montoLote}</span>
                </div>
                <div className="oc-lote__acciones">
                  <button type="button" className="link-btn" onClick={() => { setSel(new Set()); setVerSeleccion(false); }} disabled={lote}>
                    Limpiar selección
                  </button>
                  <div className="oc-lote__aprobar">
                    <AprobarControl oneWay busy={lote || aprobandoId !== null}
                      busyLabel={`Lanzando ${seleccionadas.length} en Business Central…`}
                      approveLabel={`Aprobar ${seleccionadas.length} ${seleccionadas.length === 1 ? "orden" : "órdenes"}`}
                      slideLabel="APROBAR" onApprove={aprobarSeleccionadas} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        <aside className={`oc-riel${abierta ? " is-abierto" : ""}`}>
          {abierta ? (
            <AprobacionDetalle
              key={abierta.id}
              orden={abierta}
              aprobando={lote || aprobandoId === abierta.id}
              onCerrar={() => setAbiertaId(null)}
              onAprobar={() => aprobar(abierta)}
              onRechazar={() => {
                setMotivo("");
                setRechObj({
                  id: abierta.id,
                  numero: numeroOrdenPlano(abierta),
                  proveedor: abierta.proveedorNombre ?? proveedores.find((p) => p.id === abierta.proveedorId)?.nombre,
                  monto: money(ordenTotalConIva(abierta), abierta.currencyCode),
                });
              }}
            />
          ) : (
            <div className="oc-riel__vacio">
              <span className="ds-strong">Elegí una orden</span>
              <span className="ds-muted ds-body-sm">
                Tocá una orden de la lista para revisarla acá: proveedor, destino, líneas, obra e
                historial, sin perder la selección del lote.
              </span>
            </div>
          )}
        </aside>

        {abierta && <div className="oc-riel__velo" onClick={() => setAbiertaId(null)} aria-hidden />}
      </div>

      {rechObj && (
        <Modal title={`Rechazar ${rechObj.numero}`} onClose={() => setRechObj(null)}
          footer={<>
            <Button variant="outline" onClick={() => setRechObj(null)}>Cancelar</Button>
            <Button variant="red" onClick={confirmarRechazo} disabled={!motivo.trim()}>Rechazar y devolver</Button>
          </>}>
          <div className="oc-rechazo">
            {/* Qué se está rechazando: el número solo no alcanza cuando venís de
                revisar cuatro órdenes seguidas. */}
            <div className="oc-rechazo__ctx">
              <span className="oc-rechazo__ctx-prov ds-wrap">{rechObj.proveedor ?? "Sin proveedor"}</span>
              <span className="oc-rechazo__ctx-monto">{rechObj.monto}</span>
            </div>
            <p className="oc-rechazo__ayuda">
              La orden vuelve a Proveeduría con tu motivo: les llega la notificación, queda en el historial
              y el pedido se reabre en Business Central.
            </p>
            <div className="ds-form-field oc-rechazo__campo">
              <label className="ds-form-field__label" htmlFor="oc-motivo">Motivo del rechazo</label>
              <Textarea id="oc-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej.: el precio está muy por encima de la última compra a este proveedor." rows={4} />
            </div>
            <div className="oc-rechazo__rapidos">
              <span className="oc-rechazo__rot">Motivos frecuentes</span>
              <div className="oc-rechazo__chips">
                {MOTIVOS_RECHAZO.map((m) => (
                  // Suma, no reemplaza: si ya escribiste algo no se pierde.
                  <button key={m} type="button" className="oc-rechazo__chip"
                    onClick={() => setMotivo((v) => (v.trim() ? `${v.trim()} · ${m}` : m))}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
