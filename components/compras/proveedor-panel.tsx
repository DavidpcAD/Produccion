"use client";

import { useMemo, useState } from "react";
import { Badge, Input } from "@/components/compras/ui";
import { Icon } from "@/components/ds/Icon/Icon";
import { useStore } from "@/lib/compras/store";
import {
  formatDate, money, num, numeroOrdenPlano, ordenAlmacenDestino, ordenBadge,
  ordenLineaImporte, ordenTotalConIva,
} from "@/lib/compras/helpers";
import { coincideBusqueda } from "@/lib/utilidades/buscar";
import type { Orden } from "@/lib/compras/types";

type Tab = "ordenes" | "articulos" | "info";

// Panel del proveedor: se abre desde la orden que se está revisando y contesta lo
// que uno se pregunta antes de aprobarle una compra —qué le hemos comprado, por
// cuánto, qué artículos y con qué facturas se recibió—. Vive entre la lista y el
// riel de la orden, así que no hay que salir de la bandeja para consultarlo.
export function ProveedorPanel({
  codigo, ordenActualId, onVolver, onCerrar, onAbrirOrden,
}: {
  codigo: string;
  ordenActualId?: string;
  onVolver: () => void;
  onCerrar: () => void;
  onAbrirOrden: (id: string) => void;
}) {
  const { ordenes, proveedores, recepciones } = useStore();
  const [tab, setTab] = useState<Tab>("ordenes");
  const [busca, setBusca] = useState("");

  const prov = proveedores.find((p) => p.code === codigo);

  // Manda el CÓDIGO (PROV-…) y no el id: hay órdenes que traen código y nombre pero
  // dejan el id vacío, y comparar ids vacíos mete órdenes de otros proveedores.
  const suyas = useMemo(() => {
    const codigoDe = (o: Orden) => o.proveedorNo ?? proveedores.find((p) => p.id === o.proveedorId)?.code;
    return [...ordenes.filter((o) => codigoDe(o) === codigo)].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [ordenes, proveedores, codigo]);

  const nombre = suyas[0]?.proveedorNombre ?? prov?.nombre ?? codigo;

  // Totales por moneda: sumar colones con dólares sería inventar una cifra.
  const resumen = useMemo(() => {
    const porMoneda = new Map<string, number>();
    for (const o of suyas) {
      const m = o.currencyCode || "";
      porMoneda.set(m, (porMoneda.get(m) ?? 0) + ordenTotalConIva(o));
    }
    const total = [...porMoneda].map(([m, v]) => money(v, m)).join(" · ");
    const promedio = suyas.length
      ? [...porMoneda].map(([m, v]) => money(v / suyas.filter((o) => (o.currencyCode || "") === m).length, m)).join(" · ")
      : "—";
    return { total: total || "—", promedio, ultima: suyas[0]?.fecha };
  }, [suyas]);

  // Qué se le ha comprado: una fila por artículo, con lo acumulado y el último precio.
  const articulos = useMemo(() => {
    const mapa = new Map<string, { code: string; descripcion: string; unidad: string; cantidad: number; importe: number; moneda: string; fecha: string; precio: number }>();
    for (const o of suyas) {
      for (const l of o.lineas) {
        if (l.tipo !== "articulo") continue;
        const k = l.articuloId || l.descripcion;
        const a = mapa.get(k);
        if (!a) {
          mapa.set(k, { code: l.articuloId ?? "—", descripcion: l.descripcion, unidad: l.unidad, cantidad: l.cantidad, importe: ordenLineaImporte(l), moneda: o.currencyCode, fecha: o.fecha, precio: l.precioUnitario });
        } else {
          a.cantidad += l.cantidad;
          a.importe += ordenLineaImporte(l);
          // El precio que se muestra es el de la compra más reciente.
          if (o.fecha > a.fecha) { a.fecha = o.fecha; a.precio = l.precioUnitario; a.moneda = o.currencyCode; }
        }
      }
    }
    return [...mapa.values()].sort((a, b) => b.importe - a.importe);
  }, [suyas]);

  const lista = useMemo(() => {
    const q = busca.trim();
    if (!q) return suyas;
    return suyas.filter((o) => coincideBusqueda(
      [numeroOrdenPlano(o), o.numero, o.bcNumber, ...o.lineas.map((l) => l.descripcion)].filter(Boolean).join(" "), q,
    ));
  }, [suyas, busca]);

  const tabs: { k: Tab; label: string }[] = [
    { k: "ordenes", label: `Órdenes (${suyas.length})` },
    { k: "articulos", label: `Artículos (${articulos.length})` },
    { k: "info", label: "Información" },
  ];

  return (
    <section className="oc-det oc-prov-panel" aria-label={`Proveedor ${nombre}`}>
      <header className="oc-prov-panel__head">
        <button type="button" className="oc-prov-panel__volver" onClick={onVolver}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Volver
        </button>
        <button type="button" className="oc-det__cerrar" onClick={onCerrar} aria-label="Cerrar el proveedor">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="oc-prov-panel__id">
        <h2 className="oc-det__rotulo">Proveedor</h2>
        <div className="oc-det__prov oc-prov-panel__ficha">
          <span className="oc-det__ic"><Icon name="user" size="md" color="currentColor" /></span>
          <span className="oc-det__dato-txt">
            <span className="oc-det__prov-cod">{codigo}</span>
            <span className="oc-det__prov-nom ds-wrap">{nombre}</span>
          </span>
        </div>

        <div className="oc-prov-panel__kpis">
          <Kpi icon="boleta" valor={String(suyas.length)} rotulo={suyas.length === 1 ? "Orden de compra" : "Órdenes de compra"} />
          <Kpi icon="calculator" valor={resumen.total} rotulo="Total comprado" />
          <Kpi icon="reloj" valor={resumen.ultima ? formatDate(resumen.ultima) : "—"} rotulo="Última compra" />
          <Kpi icon="list" valor={resumen.promedio} rotulo="Monto promedio" />
        </div>
      </div>

      <div className="oc-det__tabs" role="tablist" aria-label="Datos del proveedor">
        {tabs.map((t) => (
          <button key={t.k} type="button" role="tab" aria-selected={tab === t.k}
            className={`oc-det__tab${tab === t.k ? " is-active" : ""}`} onClick={() => setTab(t.k)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="oc-det__cuerpo">
        {tab === "ordenes" && (
          <>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              className="ds-form-field__input" placeholder="Buscar en las órdenes del proveedor…"
              aria-label="Buscar en las órdenes del proveedor" />
            {lista.length === 0 && <span className="oc-det__linea-dest">Ninguna orden coincide con “{busca.trim()}”.</span>}
            {lista.map((o) => {
              const recs = recepciones.filter((r) => r.ordenId === o.id);
              const alm = ordenAlmacenDestino(o);
              const b = ordenBadge(o.estado);
              return (
                <button key={o.id} type="button" onClick={() => onAbrirOrden(o.id)}
                  className={`oc-prov-orden${o.id === ordenActualId ? " is-esta" : ""}`}>
                  <span className="oc-prov-orden__top">
                    <span className="ds-strong">{numeroOrdenPlano(o)}</span>
                    <span className="oc-prov-orden__fecha">{formatDate(o.fecha)}</span>
                    <span className="oc-prov-orden__monto">{money(ordenTotalConIva(o), o.currencyCode)}</span>
                  </span>
                  <span className="oc-prov-orden__meta">
                    <span>{o.lineas.filter((l) => l.tipo === "articulo").length} líneas</span>
                    {alm.codigo && <span>{alm.codigo}</span>}
                    {alm.mixto && <span>Varios almacenes</span>}
                  </span>
                  <span className="oc-prov-orden__chips">
                    <Badge tone={b.tone}>{b.label}</Badge>
                    {recs.map((r) => (
                      <Badge key={r.id} tone={r.parcial ? "yellow" : "green"}
                        title={`Recibida con la factura ${r.numeroFactura || "(en revisión)"} por ${money(r.total, o.currencyCode)}`}>
                        {r.numeroFactura || "Factura en revisión"}
                      </Badge>
                    ))}
                  </span>
                </button>
              );
            })}
          </>
        )}

        {tab === "articulos" && (
          <div className="oc-det__lista">
            {articulos.length === 0 && <span className="oc-det__linea-dest">Sin artículos comprados a este proveedor.</span>}
            {articulos.map((a) => (
              <div key={a.code + a.descripcion} className="oc-det__linea">
                <div className="oc-det__linea-tit"><span className="ds-wrap ds-strong">{a.descripcion}</span></div>
                <span className="oc-det__linea-cod">{a.code}</span>
                <div className="oc-det__linea-nums">
                  <span className="ds-nowrap">{num.format(a.cantidad)} {a.unidad} comprados</span>
                  <span className="ds-strong ds-nowrap">{money(a.importe, a.moneda)}</span>
                </div>
                <span className="oc-det__linea-dest">Último precio {money(a.precio, a.moneda)} · {formatDate(a.fecha)}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "info" && (
          <div className="oc-det__lista">
            <Dato rotulo="Código" valor={codigo} />
            <Dato rotulo="Nombre" valor={nombre} />
            <Dato rotulo="Cédula" valor={prov?.cedula || "—"} />
            <Dato rotulo="Condición de pago" valor={prov?.paymentTermsCode || "—"} />
            <Dato rotulo="Método de pago" valor={prov?.paymentMethodCode || "—"} />
            <Dato rotulo="Moneda" valor={prov?.currencyCode || "Colones"} />
            {!prov && (
              <span className="oc-det__linea-dest">
                Este proveedor no está en el catálogo cargado: los datos salen de sus órdenes.
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Kpi({ icon, valor, rotulo }: { icon: "boleta" | "calculator" | "reloj" | "list"; valor: string; rotulo: string }) {
  return (
    <div className="oc-prov-panel__kpi">
      <span className="oc-det__ic oc-det__ic--sm"><Icon name={icon} size="sm" color="currentColor" /></span>
      <span className="oc-det__dato-txt">
        <span className="oc-prov-panel__kpi-val ds-wrap">{valor}</span>
        <span className="oc-det__rot">{rotulo}</span>
      </span>
    </div>
  );
}

function Dato({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="oc-prov-panel__info">
      <span className="oc-det__rot">{rotulo}</span>
      <span className="ds-strong ds-wrap">{valor}</span>
    </div>
  );
}
