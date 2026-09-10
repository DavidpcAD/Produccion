"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Badge, Button, Card, EmptyState, Input, QtyRing, Tile } from "@/components/compras/ui";
import { IconDelivery } from "@/components/compras/icons";
import { useStore } from "@/lib/compras/store";
import { useSession } from "@/hooks/useSession";
import { AlcanceOrdenes } from "@/components/compras/alcance-ordenes";
import {
  almacenesDeRecepcion, formatDate, money, numeroOrden, ordenAvance, ordenEsDirecta, ordenEsParcial,
  ordenPedidos, ordenRecibidoPct, ordenSubtotal, ordenTotalConIva, ordenesDelAlcance, type AlcanceRecepcion,
} from "@/lib/compras/helpers";

// Filtros de la bandeja de bodega. Son los estados que le importan a quien recibe:
// lo que todavía no llegó, lo que llegó a medias (y hay que completar) y lo que ya
// se cerró. "Todas las de bodega" no está: era la suma de las otras tres y no
// contestaba ninguna pregunta que se haga al llegar el camión.
type Filtro = "porRecibir" | "sinRecibir" | "parcial" | "completado";

export default function FacturacionPage() {
  const { ordenes: ordenesAll, pedidos, proveedores } = useStore();
  const me = useSession();
  const router = useRouter();
  const prov = (id: string) => proveedores.find((p) => p.id === id);
  const [filtro, setFiltro] = useState<Filtro>("porRecibir");
  const listaRef = useRef<HTMLDivElement>(null);

  // Todas por defecto —lo que pidieron Maderas y Bryan— y se acota con el selector.
  const [alcance, setAlcance] = useState<AlcanceRecepcion>("todas");
  const esFabrica = almacenesDeRecepcion(me) !== null;
  const ordenes = useMemo(() => ordenesDelAlcance(ordenesAll, pedidos, me, alcance), [ordenesAll, pedidos, me, alcance]);

  function seleccionar(f: Filtro) {
    setFiltro(f);
    // Con las tarjetas de conteo arriba, cambiar de filtro sin mover la vista deja
    // a la persona mirando los paneles sin saber que la lista de abajo cambió.
    setTimeout(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  // Lo que le toca a bodega: lo lanzado (por recibir) y lo completado. Las órdenes
  // que siguen en proveeduría o en aprobación no se listan acá.
  const porRecibir = ordenes.filter((o) => o.estado === "lanzado");
  const parciales = porRecibir.filter(ordenEsParcial).length;
  // Todavía no llegó NADA de esta orden: es la cola real de bodega.
  const sinRecibir = porRecibir.filter((o) => ordenRecibidoPct(o) === 0).length;
  const completadas = ordenes.filter((o) => o.estado === "completado");
  const esCompletado = filtro === "completado";

  // Sobre qué universo se busca y se lista, según el panel elegido.
  const base = filtro === "completado" ? completadas
    : filtro === "parcial" ? porRecibir.filter(ordenEsParcial)
    : filtro === "sinRecibir" ? porRecibir.filter((o) => ordenRecibidoPct(o) === 0)
    : porRecibir;
  const etiqueta: Record<Filtro, string> = {
    porRecibir: "Órdenes por recibir",
    sinRecibir: "Sin recibir todavía",
    parcial: "Con recepción parcial",
    completado: "Completadas (ya se recibió todo)",
  };

  // Buscador: con más de cien órdenes abiertas, cuando llega el camión hay que
  // poder llegar a la orden por su N.º, por el proveedor de la factura o por el
  // pedido que la originó, sin scrollear toda la lista.
  const [q, setQ] = useState("");
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter((o) => {
      const provNombre = o.proveedorNombre ?? prov(o.proveedorId)?.nombre ?? "";
      // Se busca por lo que se VE (el N.º de BC, el proveedor y los chips PED-) y
      // también por el CP- interno crudo, que es el que anda en correos y bitácora.
      return [numeroOrden(o), o.numero, o.bcNumber, provNombre, ordenPedidos(o).join(" ")]
        .some((v) => (v ?? "").toLowerCase().includes(t));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, proveedores, q]);

  // Aviso de que la lista está acotada por el SELECTOR (no porque no haya nada):
  // la salida es quitar el filtro, no mandar a la persona a buscar a otra pestaña.
  const pistaAlcance = alcance !== "todas"
    ? <> Estás viendo solo {alcance === "fabrica" ? "las de tu fábrica" : "las de tus solicitudes"} — <button type="button" className="link-btn" onClick={() => setAlcance("todas")}>ver todas</button></>
    : null;

  return (
    <AppShell role="facturacion">
      <main className="page">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Órdenes por recibir</h1>
            <p className="ds-muted">Registrá la factura cuando el material llega a bodega. Soporta entregas parciales.</p>
          </div>
        </div>

        <div className="mt-2"><AlcanceOrdenes valor={alcance} onChange={setAlcance} conFabrica={esFabrica} /></div>

        {/* Los paneles FILTRAN la lista de abajo (mismo gesto que en Órdenes de
            Proveeduría): "¿cuáles vienen a medias?" se contesta tocando el panel. */}
        <div className="tiles mt-2">
          <Tile value={porRecibir.length} label="Órdenes por recibir" accent="var(--ds-color-red-100)"
            onClick={() => seleccionar("porRecibir")} active={filtro === "porRecibir"} />
          <Tile value={sinRecibir} label="Sin recibir todavía" accent="var(--ds-color-gray-300)"
            onClick={() => seleccionar("sinRecibir")} active={filtro === "sinRecibir"} />
          <Tile value={parciales} label="Con recepción parcial" accent="var(--ds-color-yellow)"
            onClick={() => seleccionar("parcial")} active={filtro === "parcial"} />
          <Tile value={completadas.length} label="Completadas" accent="var(--ds-color-green-200)"
            onClick={() => seleccionar("completado")} active={filtro === "completado"} />
        </div>

        {base.length > 0 && (
          <div className="mt-4">
            <Input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar orden"
              placeholder="Buscar por N.º de orden, proveedor o pedido…" />
            {q.trim() !== "" && (
              <p className="ds-body-sm ds-muted" style={{ margin: "6px 0 0" }} role="status">
                {lista.length} de {base.length} orden(es)
              </p>
            )}
          </div>
        )}

        <div ref={listaRef} className="row row--between mt-6" style={{ marginBottom: 12, alignItems: "baseline", scrollMarginTop: 80 }}>
          <span className="ds-label ds-muted">{etiqueta[filtro]}</span>
          {filtro !== "porRecibir" && <button type="button" className="link-btn" onClick={() => setFiltro("porRecibir")}>Ver las que faltan recibir</button>}
        </div>

        <div className="col gap-4">
          {base.length === 0 && <Card><EmptyState icon={<IconDelivery size={24} />}
            title={filtro === "porRecibir" ? "No hay órdenes pendientes de recibir."
              : filtro === "sinRecibir" ? "Todas las órdenes pendientes ya tienen algo recibido."
              : filtro === "parcial" ? "Ninguna orden viene a medias."
              : "Todavía no hay órdenes completadas."}
            hint={<>{filtro === "porRecibir" ? <>Cuando proveeduría lance una orden y llegue material a bodega, vas a verlo acá.</> : <>Tocá otro panel de arriba para ver el resto.</>}{pistaAlcance}</>} /></Card>}
          {base.length > 0 && lista.length === 0 && <Card><EmptyState icon={<IconDelivery size={24} />}
            title="Ninguna orden coincide con la búsqueda."
            hint={<>Probá con el N.º de la orden (CP-…), el nombre del proveedor o el N.º de pedido.</>} /></Card>}
          {lista.map((o) => {
            // Los dos totales de la orden: el que manda es el CON IVA —es el que
            // viene impreso en la factura que Bodega tiene en la mano cuando llega
            // el material—, y el sin IVA queda de referencia (es el que sale en la
            // lista de órdenes y en el dashboard).
            const total = ordenSubtotal(o);
            const conIva = ordenTotalConIva(o);
            const peds = ordenPedidos(o);
            return (
              <Card key={o.id} interactive onClick={() => router.push(esCompletado ? `/compras/facturacion/ver/${o.id}` : `/compras/facturacion/${o.id}`)}>
                <div className="row row--between wrap gap-4">
                  <div className="row gap-4">
                    <QtyRing {...ordenAvance(o)} />
                    <div className="col" style={{ gap: 4 }}>
                      <div className="row gap-3">
                        <span className="ds-strong">{numeroOrden(o)}</span>
                        {esCompletado ? <Badge tone="green">Completada</Badge>
                          : ordenEsParcial(o) ? <Badge tone="yellow">Parcial · {ordenRecibidoPct(o)}%</Badge>
                          : <Badge tone="green">Lanzado</Badge>}
                      </div>
                      <span className="ds-muted ds-label">{o.proveedorNombre ?? prov(o.proveedorId)?.nombre} · emitida {formatDate(o.fecha)}</span>
                      <div className="row gap-2 wrap">
                        {ordenEsDirecta(o) && <Badge tone="yellow">Directa</Badge>}
                        {peds.slice(0, 3).map((n) => <Badge key={n} tone="gray">{n}</Badge>)}
                        {peds.length > 3 && <span className="ds-muted ds-body-sm">+{peds.length - 3}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="row gap-6">
                    <div className="col" style={{ alignItems: "flex-end" }}>
                      {/* Los dos montos, uno debajo del otro y cada uno con su rótulo
                          pegado: en 375px "IVA incluido · ₡… sin IVA" se partía y dejaba
                          el separador colgando al final de la línea. */}
                      <span className="ds-strong" style={{ whiteSpace: "nowrap" }}>
                        {money(conIva, o.currencyCode)} <span className="ds-muted ds-body-sm">con IVA</span>
                      </span>
                      <span className="ds-muted ds-body-sm" style={{ whiteSpace: "nowrap" }}>{money(total, o.currencyCode)} sin IVA</span>
                    </div>
                    {/* Una orden completada ya no se recibe: el botón lleva a verla. */}
                    <Button variant={esCompletado ? "outline" : "green"}>{esCompletado ? "Ver detalle" : "Registrar factura"}</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
