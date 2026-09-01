"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Button, Card, Tile } from "@/components/compras/ui";
import { OrdenesLista } from "@/components/compras/ordenes-lista";
import { useStore } from "@/lib/compras/store";
import { useSession } from "@/hooks/useSession";
import { almacenesDeRecepcion, ordenEsParcial, ordenesQueRecibe } from "@/lib/compras/helpers";
import type { Orden } from "@/lib/compras/types";

type Filtro = "porRecibir" | "parcial" | "completado" | "todas";

export default function FacturacionPage() {
  const { ordenes: ordenesAll, pedidos } = useStore();
  const me = useSession();
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("porRecibir");
  const listaRef = useRef<HTMLDivElement>(null);

  // Fábrica de Maderas recibe SOLO su material: las órdenes cuyo material entra a sus
  // bodegas (F-MADERAS / F-MAD-NUE), las pida quien las pida, más las de sus propias
  // solicitudes. Bodega central, Ingeniería y Super Admin ven todas.
  const soloSuFabrica = almacenesDeRecepcion(me) !== null;
  const ordenes = useMemo(() => ordenesQueRecibe(ordenesAll, pedidos, me), [ordenesAll, pedidos, me]);

  // Lo que le toca a bodega: lo que está por llegar y lo que ya se recibió. Las
  // órdenes que siguen en proveeduría o en aprobación no se listan acá.
  const base = ordenes.filter((o) => o.estado === "lanzado" || o.estado === "completado");
  const porRecibir = base.filter((o) => o.estado === "lanzado");
  const parciales = porRecibir.filter(ordenEsParcial);
  const completadas = base.filter((o) => o.estado === "completado");

  function seleccionar(f: Filtro) {
    setFiltro(f);
    setTimeout(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const lista = filtro === "porRecibir" ? porRecibir
    : filtro === "parcial" ? parciales
    : filtro === "completado" ? completadas
    : base;
  const etiqueta: Record<Filtro, string> = {
    porRecibir: "Órdenes por recibir",
    parcial: "Con recepción parcial",
    completado: "Completadas",
    todas: "Todas las órdenes de bodega",
  };

  // Una orden lanzada se abre para RECIBIR; una completada ya no se recibe, se
  // consulta (mismo criterio que el botón de la fila).
  const hrefDetalle = useCallback(
    (id: string) => (base.find((o) => o.id === id)?.estado === "completado"
      ? `/compras/facturacion/ver/${id}`
      : `/compras/facturacion/${id}`),
    [base],
  );
  const acciones = useCallback((o: Orden) => (
    o.estado === "lanzado"
      ? <Button variant="red" size="sm" onClick={() => router.push(`/compras/facturacion/${o.id}`)}>Registrar factura</Button>
      : null
  ), [router]);

  return (
    <AppShell role="facturacion">
      <main className="page">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Órdenes por recibir</h1>
            <p className="ds-muted">Registrá la factura cuando el material llega a bodega. Soporta entregas parciales. Tocá un panel para filtrar.{soloSuFabrica ? " Acá salen las órdenes que traen material a tu fábrica y las de tus solicitudes." : ""}</p>
          </div>
        </div>

        <div className="tiles mt-2">
          <Tile value={porRecibir.length} label="Órdenes por recibir" accent="var(--ds-color-red-100)" onClick={() => seleccionar("porRecibir")} active={filtro === "porRecibir"} />
          <Tile value={parciales.length} label="Con recepción parcial" accent="var(--ds-color-yellow)" onClick={() => seleccionar("parcial")} active={filtro === "parcial"} />
          <Tile value={completadas.length} label="Completadas" accent="var(--ds-color-green-200)" onClick={() => seleccionar("completado")} active={filtro === "completado"} />
          <Tile value={base.length} label="Todas las de bodega" accent="var(--ds-color-gray-300)" onClick={() => seleccionar("todas")} active={filtro === "todas"} />
        </div>

        <div ref={listaRef} className="row row--between mt-6" style={{ marginBottom: 12, alignItems: "baseline", scrollMarginTop: 80 }}>
          <span className="ds-label ds-muted">{etiqueta[filtro]}</span>
          {filtro !== "porRecibir" && <button className="link-btn" onClick={() => setFiltro("porRecibir")}>Ver las que faltan por recibir</button>}
        </div>

        {/* Sin nada por recibir: el pie que manda a "Todas las órdenes" NO se muestra a
            quien solo ve lo suyo — esa pestaña es de contabilidad y no la tiene. */}
        {filtro === "porRecibir" && porRecibir.length === 0 ? (
          <Card><div className="empty" style={{ lineHeight: 1.6 }}>No hay órdenes pendientes de recibir.<br />{soloSuFabrica
            ? <span className="ds-muted ds-body-sm">Acá aparecen las órdenes que traen material a <strong>tu fábrica</strong> —las haya pedido quien las haya pedido— y las que salen de <strong>tus solicitudes</strong>, cuando quedan lanzadas.</span>
            : <span className="ds-muted ds-body-sm">Para ver todas las órdenes y sus facturas, abrí la pestaña <strong>“Recibidas”</strong> arriba.</span>}</div></Card>
        ) : (
          <OrdenesLista key={filtro} ordenes={lista} hrefDetalle={hrefDetalle} acciones={acciones} vacio="No hay órdenes en esta categoría." />
        )}
      </main>
    </AppShell>
  );
}
