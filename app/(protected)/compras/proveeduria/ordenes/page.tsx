"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Button, Tile } from "@/components/compras/ui";
import { OrdenesLista } from "@/components/compras/ordenes-lista";
import { VistaToggle } from "@/components/compras/vista-toggle";
import { IconReceipt, IconList } from "@/components/compras/icons";
import { useStore } from "@/lib/compras/store";

type Filtro = "todas" | "abierto" | "pendiente_aprobacion" | "rechazado" | "lanzado" | "completado";

export default function OrdenesPage() {
  const { ordenes } = useStore();
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const listaRef = useRef<HTMLDivElement>(null);

  function seleccionar(f: Filtro) {
    setFiltro(f);
    setTimeout(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const abiertas = ordenes.filter((o) => o.estado === "abierto").length;
  // Una orden puede estar en CINCO estados y acá solo había panel para cuatro:
  // la que proveeduría manda con "Enviar a aprobación" queda en
  // `pendiente_aprobacion` y no aparecía en ninguna ficha. Resultado: los paneles
  // no sumaban el total (se veía "2 órdenes totales" con 0+0+1+0 abajo) y esa
  // orden no se podía filtrar — justo la que uno busca para saber en qué quedó.
  const pendientes = ordenes.filter((o) => o.estado === "pendiente_aprobacion").length;
  const rechazadas = ordenes.filter((o) => o.estado === "rechazado").length;
  const lanzadas = ordenes.filter((o) => o.estado === "lanzado").length;
  const completas = ordenes.filter((o) => o.estado === "completado").length;

  const lista = ordenes.filter((o) => (filtro === "todas" ? true : o.estado === filtro));
  const etiqueta: Record<Filtro, string> = {
    todas: "Todas las órdenes",
    abierto: "Órdenes abiertas (borrador)",
    pendiente_aprobacion: "Órdenes esperando aprobación",
    rechazado: "Órdenes rechazadas (corregir y reenviar)",
    lanzado: "Órdenes lanzadas",
    completado: "Órdenes completadas",
  };

  return (
    <AppShell role="proveeduria">
      <main className="page">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Órdenes de compra</h1>
            <p className="ds-muted">Órdenes enviadas a proveedores. Tocá un panel para filtrar. Quedan abiertas hasta recibir el 100% del material.</p>
          </div>
          <Button onClick={() => router.push("/compras/proveeduria/directa")}>+ Nueva orden directa</Button>
        </div>

        <VistaToggle opciones={[
          { label: "Por orden", href: "/compras/proveeduria/ordenes", active: true, icon: <IconReceipt size={16} /> },
          { label: "Por línea", href: "/compras/proveeduria/pedidas", active: false, icon: <IconList size={16} /> },
        ]} />

        <div className="tiles mt-2">
          <Tile value={ordenes.length} label="Órdenes totales" onClick={() => seleccionar("todas")} active={filtro === "todas"} />
          <Tile value={abiertas} label="Abiertas (borrador)" accent="var(--ds-color-gray-300)" onClick={() => seleccionar("abierto")} active={filtro === "abierto"} />
          <Tile value={pendientes} label="Esperando aprobación" accent="var(--st-pending)" onClick={() => seleccionar("pendiente_aprobacion")} active={filtro === "pendiente_aprobacion"} />
          <Tile value={rechazadas} label="Rechazadas" accent="var(--ds-color-red-200)" onClick={() => seleccionar("rechazado")} active={filtro === "rechazado"} />
          <Tile value={lanzadas} label="Lanzadas" accent="var(--ds-color-green-100)" onClick={() => seleccionar("lanzado")} active={filtro === "lanzado"} />
          <Tile value={completas} label="Completadas" accent="var(--ds-color-green-200)" onClick={() => seleccionar("completado")} active={filtro === "completado"} />
        </div>

        <div ref={listaRef} className="row row--between mt-6" style={{ marginBottom: 12, alignItems: "baseline", scrollMarginTop: 80 }}>
          <span className="ds-label ds-muted">{etiqueta[filtro]}</span>
          {filtro !== "todas" && <button className="link-btn" onClick={() => setFiltro("todas")}>Ver todas</button>}
        </div>

        <OrdenesLista key={filtro} ordenes={lista} hrefDetalle={(id) => `/compras/proveeduria/ordenes/${id}`} vacio="No hay órdenes en esta categoría." />
      </main>
    </AppShell>
  );
}
