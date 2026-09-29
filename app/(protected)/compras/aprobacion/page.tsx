"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Button, Input, Modal, Select, Textarea, useToast } from "@/components/compras/ui";
import { AprobacionDetalle } from "@/components/compras/aprobacion-detalle";
import { ProveedorPanel } from "@/components/compras/proveedor-panel";
import { AprobarControl } from "@/components/compras/aprobar-control";
import { OrdenFila } from "@/components/compras/orden-fila";
import { IconChevronDown } from "@/components/compras/icons";
import { Icon } from "@/components/ds/Icon/Icon";
import { useStore } from "@/lib/compras/store";
import { aprobarYLanzar } from "@/lib/compras/aprobar";
import {
  bcEstadoBadge, money, numeroOrden, numeroOrdenPlano, ordenConsumoDirecto,
  ordenDevueltaPorBc, ordenTotalConIva,
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
// `corto`: el rótulo que entra en celular, donde las fichas se arrastran de lado.
const VISTA: Record<Vista, { label: string; corto: string; vacio: string; ayuda: string }> = {
  pendientes: { label: "Pendientes", corto: "Pendientes", vacio: "No hay órdenes pendientes de aprobación.", ayuda: "Proveeduría ya las envió: falta aprobarlas o rechazarlas." },
  atencion: { label: "Requieren atención", corto: "Atención", vacio: "Ninguna pendiente tiene problemas con Business Central.", ayuda: "Pendientes con algo trabado en Business Central: el último intento de lanzar falló, BC dice otra cosa, o el pedido quedó sin lanzar." },
  sin_bc: { label: "Sin lanzar en BC", corto: "Sin lanzar", vacio: "Ninguna orden quedó sin lanzar en Business Central.", ayuda: "Ya se aprobaron, pero el pedido quedó sin lanzar en BC: Bodega no puede recibir contra él." },
  lanzado: { label: "Lanzadas", corto: "Lanzadas", vacio: "Todavía no hay órdenes lanzadas.", ayuda: "Ya están en Business Central y el proveedor las tiene." },
  abierto: { label: "En proveeduría", corto: "Proveeduría", vacio: "No hay órdenes abiertas en proveeduría.", ayuda: "Todavía se están armando: aún no llegaron a aprobación." },
  completado: { label: "Completadas", corto: "Completadas", vacio: "Todavía no hay órdenes completadas.", ayuda: "Recibidas y facturadas." },
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
  const { ordenes, proveedores, movimientos, bcEstados, setOrdenEstado, devolverOrden } = useStore();
  const toast = useToast();
  // Lo que uno está mirando vive en el URL. Así "Ver la orden completa" y el botón
  // de atrás del navegador devuelven la pantalla igual: la misma ficha, la misma
  // orden abierta, el mismo proveedor y lo que ya había marcado para el lote.
  const sp = useSearchParams();
  const [vista, setVista] = useState<Vista>(() => {
    const v = sp.get("vista");
    return v && v in VISTA ? (v as Vista) : "pendientes";
  });
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [busca, setBusca] = useState("");
  const [orden, setOrden] = useState<Orden_>("recientes");
  const [sel, setSel] = useState<Set<string>>(() => new Set((sp.get("sel") ?? "").split(",").filter(Boolean)));
  const [abiertaId, setAbiertaId] = useState<string | null>(() => sp.get("orden"));
  const [verSeleccion, setVerSeleccion] = useState(false);
  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [lote, setLote] = useState(false);
  // El rechazo vale para UNA orden o para toda la selección: mismo diálogo, mismo
  // motivo, y se devuelven una por una (BC no debe recibirlas en paralelo).
  const [rechObj, setRechObj] = useState<{ ids: string[]; titulo: string; proveedor?: string; monto: string } | null>(null);
  const [panelSel, setPanelSel] = useState(false);
  // Proveedor abierto al lado del riel (su código PROV-…), con su historial de compras.
  const [provAbierto, setProvAbierto] = useState<string | null>(() => sp.get("prov"));
  const [confirmLote, setConfirmLote] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; fallos: string[] } | null>(null);
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

  useEffect(() => {
    const p = new URLSearchParams();
    if (vista !== "pendientes") p.set("vista", vista);
    if (abiertaId) p.set("orden", abiertaId);
    if (provAbierto) p.set("prov", provAbierto);
    if (sel.size) p.set("sel", [...sel].join(","));
    const q = p.toString();
    window.history.replaceState(null, "", q ? `?${q}` : window.location.pathname);
  }, [vista, abiertaId, provAbierto, sel]);

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

  // Lo que cambia el peso de aprobar en lote: cuántas van contra la obra y cuántas
  // arrastran un pedido sin lanzar en BC.
  const resumenLote = useMemo(() => ({
    cd: seleccionadas.filter((o) => ordenConsumoDirecto(o).hay).length,
    sinBc: seleccionadas.filter((o) => ordenDevueltaPorBc(o, movimientos)).length,
  }), [seleccionadas, movimientos]);

  // Abrir una orden desde la lista: si el panel del proveedor está abierto, TIENE que
  // seguirla. Si no, uno cambia de orden y sigue mirando el historial del proveedor
  // anterior creyendo que es el de esta. Sin código de proveedor se cierra: mostrar el
  // que estaba es peor que no mostrar nada.
  const codigoProveedor = (o: Orden) => o.proveedorNo ?? proveedores.find((p) => p.id === o.proveedorId)?.code ?? null;
  const abrirOrden = (o: Orden) => {
    setAbiertaId(o.id);
    setProvAbierto((actual) => (actual ? codigoProveedor(o) : null));
  };

  const cambiarVista = (v: Vista) => { setVista(v); setSel(new Set()); setAbiertaId(null); setVerSeleccion(false); };
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
    setConfirmLote(false);
    setLote(true);
    let ok = 0; const fallos: string[] = [];
    for (const o of seleccionadas) {
      const r = await aprobarYLanzar(o, setOrdenEstado);
      if (r.ok) ok++; else fallos.push(numeroOrdenPlano(o));
    }
    setLote(false); setSel(new Set()); setAbiertaId(null); setVerSeleccion(false); setPanelSel(false);
    // Un toast se va solo y esto no se puede deshacer: el resultado se queda hasta
    // que la persona lo lee, y dice por nombre cuáles quedaron con problema.
    setResultado({ ok, fallos });
  }
  // Rechazar: el motivo es OBLIGATORIO y vuelve a Proveeduría con la nota.
  async function confirmarRechazo() {
    if (!rechObj || lote) return;
    if (!motivo.trim()) { toast("Escribí el motivo del rechazo.", "error"); return; }
    setLote(true);
    let ok = 0; const fallos: string[] = []; const avisos: string[] = [];
    for (const id of rechObj.ids) {
      try {
        const r = await devolverOrden(id, motivo.trim());
        ok++;
        // Si BC no se pudo poner al día (reabrir + cancelar la solicitud del workflow)
        // se dice: si no, el pedido queda "Pendiente de aprobación" allá y nadie sabría
        // por qué.
        if (r?.bcAviso) avisos.push(r.bcAviso);
        sacarDeSeleccion(id);
        if (abiertaId === id) setAbiertaId(null);
      } catch {
        fallos.push(id);
      }
    }
    setLote(false);
    const cuerpo = ok === 1 && rechObj.ids.length === 1
      ? `Orden ${rechObj.titulo} devuelta a proveeduría`
      : `${ok} órdenes devueltas a proveeduría`;
    const cola = [fallos.length ? `${fallos.length} no se pudieron devolver` : "", avisos[0] ? `⚠️ ${avisos[0]}` : ""].filter(Boolean).join(" · ");
    toast(cola ? `${cuerpo} · ${cola}` : cuerpo, fallos.length || avisos.length ? "error" : "info");
    setRechObj(null); setMotivo(""); setPanelSel(false);
  }
  const pedirRechazoLote = () => {
    if (!seleccionadas.length) return;
    setMotivo("");
    setRechObj({
      ids: seleccionadas.map((o) => o.id),
      titulo: `${seleccionadas.length} ${seleccionadas.length === 1 ? "orden" : "órdenes"}`,
      monto: montoLote,
    });
  };

  const hayFiltro = busca.trim().length > 0 || OTROS_ESTADOS.includes(vista);

  return (
    <AppShell role="aprobacion">
      <div className={`oc-bandeja${provAbierto ? " tiene-prov" : ""}`}>
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
                  <span className="oc-ficha__largo">{VISTA[v].label}</span>
                  <span className="oc-ficha__corto">{VISTA[v].corto}</span>
                  {" "}({deVista[v].length})
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

            {lista.map((o) => (
              <OrdenFila key={o.id} orden={o} abierta={abiertaId === o.id}
                marcada={esPendiente ? sel.has(o.id) : undefined}
                onMarcar={esPendiente ? () => toggleSel(o.id) : undefined}
                onAbrir={() => abrirOrden(o)} />
            ))}
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
                      slideLabel="APROBAR" onApprove={() => setConfirmLote(true)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Celular: la barra del lote no cabe, así que la selección vive en una
              pastilla flotante que abre un panel. Siempre accesible mientras haya
              órdenes marcadas. */}
          {seleccionadas.length > 0 && (
            <button type="button" className="oc-pastilla" onClick={() => { setVerSeleccion(true); setPanelSel(true); }} aria-expanded={panelSel}>
              <span className="oc-pastilla__n">{seleccionadas.length}</span>
              <span className="oc-pastilla__txt">Revisar selección</span>
              <span className="oc-pastilla__chev" aria-hidden><IconChevronDown size={18} /></span>
            </button>
          )}
        </main>

        {provAbierto && (
          <aside className="oc-riel oc-riel--prov is-abierto">
            <ProveedorPanel
              key={provAbierto}
              codigo={provAbierto}
              ordenActualId={abierta?.id}
              onVolver={() => setProvAbierto(null)}
              onCerrar={() => setProvAbierto(null)}
              onAbrirOrden={(id) => setAbiertaId(id)}
            />
          </aside>
        )}

        <aside className={`oc-riel${abierta ? " is-abierto" : ""}`}>
          {abierta ? (
            <AprobacionDetalle
              key={abierta.id}
              orden={abierta}
              aprobando={lote || aprobandoId === abierta.id}
              onCerrar={() => setAbiertaId(null)}
              onAprobar={() => aprobar(abierta)}
              onVerProveedor={(c) => setProvAbierto(c)}
              onRechazar={() => {
                setMotivo("");
                setRechObj({
                  ids: [abierta.id],
                  titulo: numeroOrdenPlano(abierta),
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

        {(abierta || provAbierto) && <div className="oc-riel__velo" onClick={() => { setProvAbierto(null); setAbiertaId(null); }} aria-hidden />}
      </div>

      {panelSel && seleccionadas.length > 0 && (
        <>
          <div className="oc-sel__velo" onClick={() => setPanelSel(false)} aria-hidden />
          <aside className="oc-sel" aria-label="Órdenes seleccionadas">
            <header className="oc-sel__head">
              <h2 className="oc-sel__tit">
                {seleccionadas.length} {seleccionadas.length === 1 ? "orden seleccionada" : "órdenes seleccionadas"}
              </h2>
              <button type="button" className="oc-det__cerrar" onClick={() => setPanelSel(false)} aria-label="Cerrar la selección">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <div className="oc-sel__cuerpo">
              <div className="oc-sel__total">
                <span className="oc-det__rot">Monto total</span>
                <span className="oc-sel__total-num">{montoLote}</span>
              </div>

              {/* Los dos datos que cambian el peso de apretar el botón. Se muestran
                  aunque estén en cero: "0 sin lanzar en BC" también es información. */}
              <div className="oc-sel__avisos">
                <span className={`oc-sel__aviso${resumenLote.cd > 0 ? " is-on" : ""}`}>
                  <Icon name="alert" size="sm" color="currentColor" />
                  {resumenLote.cd} con consumo directo
                </span>
                <span className={`oc-sel__aviso oc-sel__aviso--bc${resumenLote.sinBc > 0 ? " is-on" : ""}`}>
                  <Icon name="traslado" size="sm" color="currentColor" />
                  {resumenLote.sinBc} sin lanzar en BC
                </span>
              </div>

              <Button block disabled={lote} onClick={() => setConfirmLote(true)}>
                {lote ? "Lanzando en Business Central…" : `Aprobar ${seleccionadas.length} ${seleccionadas.length === 1 ? "orden" : "órdenes"}`}
              </Button>
              <Button block variant="outline" disabled={lote} onClick={pedirRechazoLote}>Rechazar seleccionadas</Button>

              <div className="oc-sel__lista-head">
                <span className="oc-det__rot">Órdenes seleccionadas</span>
                <button type="button" className="link-btn" aria-expanded={verSeleccion} onClick={() => setVerSeleccion((v) => !v)}>
                  {verSeleccion ? "Ver menos" : "Ver más"}
                </button>
              </div>
              {verSeleccion && (
                <ul className="oc-sel__lista">
                  {seleccionadas.map((o) => {
                    const cd = ordenConsumoDirecto(o);
                    return (
                      <li key={o.id} className="oc-sel__item">
                        <div className="oc-sel__item-top">
                          <span className="ds-strong">{numeroOrdenPlano(o)}</span>
                          <span className="oc-sel__item-monto">{money(ordenTotalConIva(o), o.currencyCode)}</span>
                          <button type="button" className="oc-sel__quitar" onClick={() => sacarDeSeleccion(o.id)}
                            aria-label={`Quitar ${numeroOrdenPlano(o)} de la selección`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                              <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          </button>
                        </div>
                        <span className="oc-sel__item-prov ds-wrap">
                          {o.proveedorNombre ?? proveedores.find((p) => p.id === o.proveedorId)?.nombre}
                        </span>
                        {cd.hay && (
                          <span className="ds-badge ds-badge--yellow oc-marca">
                            <Icon name="alert" size="sm" color="currentColor" />
                            Consumo directo{cd.parcial ? " (parcial)" : ""}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="oc-aviso oc-aviso--info">
                <span className="oc-aviso__ic"><Icon name="info" size="sm" color="currentColor" /></span>
                <span className="oc-aviso__txt">
                  <span className="oc-aviso__tit">Aprobación irreversible</span>
                  Al aprobar, se enviará el pedido a Business Central (ERP) y esta acción no se puede revertir.
                </span>
              </div>
            </div>
          </aside>
        </>
      )}

      {confirmLote && (
        <Modal title={`¿Aprobar ${seleccionadas.length === 1 ? "esta orden" : `estas ${seleccionadas.length} órdenes`}?`}
          onClose={() => setConfirmLote(false)}
          footer={<>
            <Button variant="outline" onClick={() => setConfirmLote(false)}>Cancelar</Button>
            <Button disabled={lote} onClick={aprobarSeleccionadas}>{lote ? "Enviando…" : "Aprobar y enviar"}</Button>
          </>}>
          <div className="oc-confirmar">
            <span className="oc-confirmar__ic"><Icon name="alert" size="lg" color="currentColor" /></span>
            <p className="oc-confirmar__txt">
              Se enviarán a Business Central (ERP) y esta acción no se puede revertir.
            </p>
            <div className="oc-confirmar__total">
              <span className="oc-det__rot">Monto total</span>
              <span className="oc-sel__total-num">{montoLote}</span>
            </div>
            {resumenLote.cd > 0 && (
              <p className="oc-confirmar__nota">
                {resumenLote.cd} {resumenLote.cd === 1 ? "va" : "van"} contra la obra (consumo directo): el material no entra a inventario.
              </p>
            )}
          </div>
        </Modal>
      )}

      {resultado && (
        <div className="oc-resultado" role="status" aria-live="polite">
          <div className="oc-resultado__caja">
            <span className={`oc-resultado__ic${resultado.fallos.length ? " is-mixto" : ""}`}>
              <Icon name={resultado.fallos.length ? "alert" : "check"} size="lg" color="currentColor" />
            </span>
            <p className="oc-resultado__tit">
              {resultado.ok} {resultado.ok === 1 ? "orden aprobada" : "órdenes aprobadas"}
            </p>
            <p className="oc-resultado__txt">
              {resultado.ok > 0 ? "Se enviaron correctamente a Business Central." : "No se envió ninguna a Business Central."}
              {resultado.fallos.length > 0 && (
                <> <span className="oc-resultado__fallos">Quedaron con problema: {resultado.fallos.join(", ")}. Revisá cada una.</span></>
              )}
            </p>
            <Button block onClick={() => setResultado(null)}>Listo</Button>
          </div>
        </div>
      )}

      {rechObj && (
        <Modal title={`Rechazar ${rechObj.titulo}`} onClose={() => setRechObj(null)}
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
