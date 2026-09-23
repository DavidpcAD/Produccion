"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/compras/shell";
import { ComprasResumen } from "@/components/compras/compras-resumen";
import { useStore } from "@/lib/compras/store";
import { kpisDeCompras } from "@/lib/compras/kpis";
import { resumenPorProveedor } from "@/lib/compras/proveedores-resumen";
import { todayISO } from "@/lib/compras/helpers";

// RESUMEN de Órdenes de Compra: el panorama de la tubería completa —lo que se pidió,
// lo que se ordenó, lo que falta que llegue y dónde está detenido—, con el mismo panel
// que tiene proveeduria.adelante.cr en su pantalla de Órdenes de compra.
//
// Los números se calculan ACÁ y no adentro del panel: el recorrido de las órdenes es
// uno solo y así no se repite en cada render.
export default function ResumenComprasPage() {
  const { ordenes, proveedores } = useStore();

  const k = useMemo(() => kpisDeCompras(ordenes, todayISO()), [ordenes]);
  const porProveedor = useMemo(() => resumenPorProveedor(ordenes, proveedores), [ordenes, proveedores]);

  return (
    <AppShell role="ingenieria">
      <main className="page page--wide">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Órdenes de compra</h1>
            <p className="ds-muted">Lo que pidió Ingeniería, lo que se ordenó y lo que falta que llegue.</p>
          </div>
        </div>

        <ComprasResumen k={k} filas={porProveedor.filas} />
      </main>
    </AppShell>
  );
}
