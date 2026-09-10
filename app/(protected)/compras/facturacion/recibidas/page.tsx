"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Badge, Card, EmptyState, Input, Tile } from "@/components/compras/ui";
import { IconChevronDown, IconDelivery } from "@/components/compras/icons";
import { useStore } from "@/lib/compras/store";
import { useSession } from "@/hooks/useSession";
import { AlcanceOrdenes } from "@/components/compras/alcance-ordenes";
import { almacenesDeRecepcion, formatDate, money, numeroOrden, ordenesDelAlcance, type AlcanceRecepcion } from "@/lib/compras/helpers";

// Bodega (recibe): historial de lo que se recibió, con quién lo recibió.
// Pensada para celular/tablet: tarjetas grandes, sin tablas anchas.
export default function RecibidasPage() {
  const { recepciones: recepcionesAll, ordenes: ordenesAll, pedidos, proveedores } = useStore();
  const me = useSession();
  const router = useRouter();
  // Mismo selector que "Órdenes por recibir", y las recepciones siguen a las órdenes.
  const [alcance, setAlcance] = useState<AlcanceRecepcion>("todas");
  const esFabrica = almacenesDeRecepcion(me) !== null;
  const ordenes = useMemo(() => ordenesDelAlcance(ordenesAll, pedidos, me, alcance), [ordenesAll, pedidos, me, alcance]);
  const recepciones = useMemo(() => {
    if (alcance === "todas") return recepcionesAll;
    const ids = new Set(ordenes.map((o) => o.id));
    return recepcionesAll.filter((r) => ids.has(r.ordenId));
  }, [alcance, recepcionesAll, ordenes]);
  const ordenDe = (ordenId: string) => ordenes.find((o) => o.id === ordenId);
  // Cuántas facturas tiene cada orden y en qué puesto va esta: una orden que se
  // recibió en tres viajes tiene tres facturas, y desde la tarjeta hay que poder
  // saltar a las otras dos.
  const facturasDeOrden = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of [...recepcionesAll].sort((a, b) => (a.fechaRecepcion || "").localeCompare(b.fechaRecepcion || ""))) {
      if (!m.has(r.ordenId)) m.set(r.ordenId, []);
      m.get(r.ordenId)!.push(r.id);
    }
    return m;
  }, [recepcionesAll]);
  const provNombre = (ordenId: string) => {
    const o = ordenDe(ordenId);
    return (o ? (o.proveedorNombre ?? proveedores.find((p) => p.id === o.proveedorId)?.nombre) : "") ?? "—";
  };

  // Recepciones con material recibido (registradas o en revisión), más nuevas primero.
  const lista = useMemo(
    () => [...recepciones].sort((a, b) => (b.fechaRecepcion || "").localeCompare(a.fechaRecepcion || "")),
    [recepciones]
  );
  const hoy = new Date().toISOString().slice(0, 10);
  const delMes = lista.filter((r) => (r.fechaRecepcion || "").slice(0, 7) === hoy.slice(0, 7)).length;

  // Con doscientas recepciones, encontrar "la factura de las llantas" scrolleando
  // no es viable: se busca por N.º de factura, de orden, proveedor o quién recibió.
  const [q, setQ] = useState("");
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((r) => {
      const o = ordenes.find((x) => x.id === r.ordenId);
      return [r.numeroFactura, o ? numeroOrden(o) : "", o?.numero, o?.bcNumber,
        o?.proveedorNombre ?? proveedores.find((p) => p.id === o?.proveedorId)?.nombre, r.recibidoPor]
        .some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [lista, ordenes, proveedores, q]);

  return (
    <AppShell role="facturacion">
      <main className="page page--wide">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Recibidas</h1>
            <p className="ds-muted">Material que ya recibiste en bodega. Queda registrado quién lo recibió.</p>
          </div>
        </div>

        <div className="mt-2"><AlcanceOrdenes valor={alcance} onChange={setAlcance} conFabrica={esFabrica} /></div>

        <div className="tiles mt-2">
          <Tile value={lista.length} label="Recepciones" accent="var(--ds-color-green-100)" />
          <Tile value={delMes} label="Este mes" accent="var(--ds-color-yellow)" />
          <Tile value={new Set(lista.map((r) => r.ordenId)).size} label="Órdenes" accent="var(--ds-color-gray-300)" />
        </div>

        {lista.length > 0 && (
          <div className="mt-4">
            <Input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar factura recibida"
              placeholder="Buscar por N.º de factura, orden, proveedor o quién recibió…" />
            {q.trim() !== "" && (
              <p className="ds-body-sm ds-muted" style={{ margin: "6px 0 0" }} role="status">
                {visibles.length} de {lista.length} recepción(es)
              </p>
            )}
          </div>
        )}

        {lista.length === 0 ? (
          <Card className="mt-6"><EmptyState icon={<IconDelivery size={24} />}
            title="Todavía no recibiste material."
            hint={<>Cuando registres una recepción en <strong>Órdenes por recibir</strong>, aparece acá.</>} /></Card>
        ) : visibles.length === 0 ? (
          <Card className="mt-6"><EmptyState icon={<IconDelivery size={24} />}
            title="Ninguna recepción coincide con la búsqueda."
            hint={<>Probá con el N.º de la factura, el de la orden (CP-…) o el proveedor.</>} /></Card>
        ) : (
          <div className="col gap-3 mt-6">
            {visibles.map((r) => {
              const o = ordenDe(r.ordenId);
              const enRevision = !!r.facturaEnRevision || !r.numeroFactura;
              const unidades = r.lineas.reduce((s, l) => s + (Number(l.cantidadRecibida) || 0), 0);
              // "Factura 2 de 3": la orden se recibió en varios viajes. Así se ve
              // desde la lista que esta no es la única factura de esa orden.
              const hermanas = facturasDeOrden.get(r.ordenId) ?? [r.id];
              const puesto = hermanas.indexOf(r.id) + 1;
              return (
                <Card key={r.id} className="rec-card" interactive
                  onClick={() => router.push(`/compras/facturacion/recepcion/${r.id}`)}
                  title="Ver qué líneas trajo esta factura">
                  <div className="row row--between wrap gap-2" style={{ alignItems: "flex-start" }}>
                    <div className="col" style={{ gap: 3, minWidth: 0 }}>
                      <span className="ds-strong" style={{ fontSize: "var(--ds-font-size-subtitle)" }}>
                        {enRevision ? (o ? numeroOrden(o) : "—") : `Factura ${r.numeroFactura}`}
                      </span>
                      <span className="ds-body-sm ds-muted ds-truncate">
                        {o ? numeroOrden(o) : "—"} · {provNombre(r.ordenId)}
                      </span>
                    </div>
                    <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
                      {hermanas.length > 1 && <Badge tone="gray" title={`Esta orden se recibió en ${hermanas.length} facturas`}>Factura {puesto} de {hermanas.length}</Badge>}
                      {enRevision ? <Badge tone="yellow">En revisión</Badge> : (r.parcial ? <Badge tone="yellow">Parcial</Badge> : <Badge tone="green">Completa</Badge>)}
                    </div>
                  </div>
                  <div className="row wrap gap-4 mt-3" style={{ alignItems: "center" }}>
                    <span className="col" style={{ gap: 1 }}>
                      <span className="ds-label ds-muted">Recibido</span>
                      <span className="ds-body-sm ds-strong">{formatDate(r.fechaRecepcion)}</span>
                    </span>
                    <span className="col" style={{ gap: 1 }}>
                      <span className="ds-label ds-muted">Recibido por</span>
                      <span className="ds-body-sm ds-strong">{r.recibidoPor || "—"}</span>
                    </span>
                    <span className="col" style={{ gap: 1 }}>
                      <span className="ds-label ds-muted">Líneas</span>
                      <span className="ds-body-sm ds-strong">{r.lineas.length} · {unidades} und</span>
                    </span>
                    <span className="col" style={{ gap: 1 }}>
                      <span className="ds-label ds-muted">{enRevision ? "Total estimado" : "Total factura"}</span>
                      <span className="ds-body-sm ds-strong">{money(r.total, o?.currencyCode)}</span>
                    </span>
                    <span className="row gap-1 ds-body-sm ds-muted" style={{ marginLeft: "auto", alignItems: "center" }}>
                      Ver detalle <IconChevronDown size={16} style={{ transform: "rotate(-90deg)" }} />
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}
