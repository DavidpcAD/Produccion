"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Select } from "@/components/compras/ui";
import { AprobacionDetalle } from "@/components/compras/aprobacion-detalle";
import { ProveedorPanel } from "@/components/compras/proveedor-panel";
import { OrdenFila } from "@/components/compras/orden-fila";
import { OrdenesLista } from "@/components/compras/ordenes-lista";
import { PantallaSkeleton } from "@/components/compras/pantalla-skeleton";
import { Icon } from "@/components/ds/Icon/Icon";
import { useStore } from "@/lib/compras/store";
import { ordenTotalConIva, textoBuscableOrden } from "@/lib/compras/helpers";
import { coincideBusqueda } from "@/lib/utilidades/buscar";
import type { Orden } from "@/lib/compras/types";

// Todas las órdenes que pasaron por aprobación. Es la MISMA bandeja de Aprobación
// —lista, riel de la orden y panel del proveedor— pero de consulta: acá no se
// aprueba ni se rechaza nada.
type Vista = "todas" | "pendiente_aprobacion" | "lanzado" | "completado" | "rechazado";
const FICHAS: Vista[] = ["todas", "pendiente_aprobacion", "lanzado", "completado", "rechazado"];
const VISTA: Record<Vista, { label: string; corto: string; vacio: string }> = {
  todas: { label: "Todas", corto: "Todas", vacio: "Todavía no hay órdenes." },
  pendiente_aprobacion: { label: "Pendientes de aprobación", corto: "Pendientes", vacio: "No hay órdenes pendientes de aprobación." },
  lanzado: { label: "Lanzadas", corto: "Lanzadas", vacio: "Todavía no hay órdenes lanzadas." },
  completado: { label: "Completadas", corto: "Completadas", vacio: "Todavía no hay órdenes completadas." },
  rechazado: { label: "Rechazadas", corto: "Rechazadas", vacio: "No hay órdenes rechazadas." },
};

type Orden_ = "recientes" | "antiguas" | "mayor" | "menor";
const ORDENES: { v: Orden_; label: string }[] = [
  { v: "recientes", label: "Más recientes" },
  { v: "antiguas", label: "Más antiguas" },
  { v: "mayor", label: "Monto mayor" },
  { v: "menor", label: "Monto menor" },
];

export default function AprobacionTodasPage() {
  const { ordenes, proveedores, pedidos, recepciones, cargandoExtra } = useStore();
  const sp = useSearchParams();
  const [vista, setVista] = useState<Vista>(() => {
    const v = sp.get("vista");
    return v && v in VISTA ? (v as Vista) : "todas";
  });
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [busca, setBusca] = useState("");
  const [orden, setOrden] = useState<Orden_>("recientes");
  const [abiertaId, setAbiertaId] = useState<string | null>(() => sp.get("orden"));
  const [provAbierto, setProvAbierto] = useState<string | null>(() => sp.get("prov"));
  // La tabla vieja sigue disponible: es la única con columnas, vistas y exportar.
  const [comoTabla, setComoTabla] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams();
    if (vista !== "todas") p.set("vista", vista);
    if (abiertaId) p.set("orden", abiertaId);
    if (provAbierto) p.set("prov", provAbierto);
    const q = p.toString();
    window.history.replaceState(null, "", q ? `?${q}` : window.location.pathname);
  }, [vista, abiertaId, provAbierto]);

  // Las que pasaron por aprobación: las que siguen en proveeduría no son de acá.
  const base = useMemo(() => ordenes.filter((o) => o.estado !== "abierto"), [ordenes]);
  const deVista = useMemo(() => Object.fromEntries(
    FICHAS.map((v) => [v, v === "todas" ? base : base.filter((o) => o.estado === v)]),
  ) as Record<Vista, Orden[]>, [base]);

  const lista = useMemo(() => {
    const q = busca.trim();
    const cmp = (a: Orden, b: Orden) => {
      if (orden === "mayor") return ordenTotalConIva(b) - ordenTotalConIva(a);
      if (orden === "menor") return ordenTotalConIva(a) - ordenTotalConIva(b);
      const d = a.fecha.localeCompare(b.fecha);
      return orden === "antiguas" ? d : -d;
    };
    return deVista[vista].filter((o) => !q || coincideBusqueda(textoBuscableOrden(o, { proveedores, pedidos, recepciones }), q)).sort(cmp);
  }, [deVista, vista, busca, orden, proveedores, pedidos, recepciones]);

  const meta = VISTA[vista];
  const abierta = ordenes.find((o) => o.id === abiertaId) ?? null;
  const codigoProveedor = (o: Orden) => o.proveedorNo ?? proveedores.find((p) => p.id === o.proveedorId)?.code ?? null;
  const abrirOrden = (o: Orden) => {
    setAbiertaId(o.id);
    setProvAbierto((actual) => (actual ? codigoProveedor(o) : null));
  };
  const cambiarVista = (v: Vista) => { setVista(v); setAbiertaId(null); setProvAbierto(null); };
  const hayFiltro = busca.trim().length > 0;

  // La primera carga trae solo la cola de pendientes, para que Aprobación pinte ya.
  // Esta pantalla es justamente TODAS: mostrar 7 de 628 mientras baja el resto se
  // leería como que no hay más, así que acá sí se espera.
  if (cargandoExtra) return <AppShell role="aprobacion"><PantallaSkeleton forma="bandeja" /></AppShell>;

  return (
    <AppShell role="aprobacion">
      <div className={`oc-bandeja${provAbierto ? " tiene-central" : ""}`}>
        <main className="oc-bandeja__lista">
          <header className="oc-bandeja__head">
            <h1 className="ds-heading">Todas las órdenes</h1>
            <p className="ds-muted oc-bandeja__intro">
              Consulta de todas las órdenes que pasaron por aprobación, con su estado, sus líneas,
              su proveedor y las facturas con las que se recibieron.
            </p>
            <p className="oc-bandeja__conteo">{deVista[vista].length} {deVista[vista].length === 1 ? "orden" : "órdenes"}</p>
          </header>

          <div className="oc-barra">
            <div className="oc-fichas" role="group" aria-label="Filtrar por estado">
              {FICHAS.map((v) => (
                <button key={v} type="button" aria-pressed={vista === v}
                  className={`oc-ficha${vista === v ? " is-active" : ""}`} onClick={() => cambiarVista(v)}>
                  <span className="oc-ficha__largo">{VISTA[v].label}</span>
                  <span className="oc-ficha__corto">{VISTA[v].corto}</span>
                  {" "}({deVista[v].length})
                </button>
              ))}
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

          {/* Buscador siempre a la vista: encuentra por N.º de orden, proveedor,
              material, obra, quién la pidió o N.º de factura. Estaba escondido dentro
              de "Filtros" y nadie lo hallaba. */}
          <div className="oc-buscar">
            <span className="oc-buscar__ic" aria-hidden><Icon name="search" size="md" color="currentColor" /></span>
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
              className="oc-buscar__campo" aria-label="Buscar órdenes"
              placeholder="Buscar por N.º de orden, proveedor, material, obra, quién la pidió o N.º de factura…" />
            {busca && (
              <button type="button" className="oc-buscar__limpiar" onClick={() => setBusca("")} aria-label="Limpiar la búsqueda">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>

          {filtrosAbiertos && (
            <div className="oc-filtros">
              {/* La tabla es la única con columnas, vistas y exportar: no se pierde. */}
              <label className="oc-filtros__todas">
                <input type="checkbox" className="ds-cbx" checked={comoTabla} onChange={(e) => setComoTabla(e.target.checked)} />
                <span>Verlas como tabla (columnas y exportar)</span>
              </label>
            </div>
          )}

          {comoTabla ? (
            <OrdenesLista key={vista} ordenes={lista} hrefDetalle={(id) => `/compras/aprobacion/${id}`} vacio={meta.vacio} />
          ) : (
            <div className="oc-bandeja__filas">
              {deVista[vista].length === 0 && (
                <div className="oc-vacio">
                  <span className="ds-strong">{meta.vacio}</span>
                  <span className="ds-muted ds-body-sm">Tocá otra ficha de arriba para ver las de otro estado.</span>
                </div>
              )}
              {deVista[vista].length > 0 && lista.length === 0 && (
                <div className="oc-vacio">
                  <span className="ds-strong">Ninguna orden coincide con “{busca.trim()}”.</span>
                  <span className="ds-muted ds-body-sm">
                    Probá con el N.º de BC (CP-…), el proveedor o la solicitud (PED-…).{" "}
                    <button type="button" className="link-btn" onClick={() => setBusca("")}>Limpiar búsqueda</button>
                  </span>
                </div>
              )}
              {lista.map((o) => (
                <OrdenFila key={o.id} orden={o} abierta={abiertaId === o.id} onAbrir={() => abrirOrden(o)} />
              ))}
            </div>
          )}
        </main>

        {provAbierto && (
          <aside className="oc-riel oc-riel--central is-abierto">
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
              onCerrar={() => setAbiertaId(null)}
              onVerProveedor={(c) => setProvAbierto(c)}
            />
          ) : (
            <div className="oc-riel__vacio">
              <span className="ds-strong">Elegí una orden</span>
              <span className="ds-muted ds-body-sm">
                Tocá una orden de la lista para verla acá: proveedor, destino, líneas, obra e historial.
              </span>
            </div>
          )}
        </aside>

        {(abierta || provAbierto) && (
          <div className="oc-riel__velo" onClick={() => { setProvAbierto(null); setAbiertaId(null); }} aria-hidden />
        )}
      </div>
    </AppShell>
  );
}
