"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/compras/shell";
import { ComprasResumen } from "@/components/compras/compras-resumen";
import { useStore } from "@/lib/compras/store";
import { useSession } from "@/hooks/useSession";
import { kpisDeCompras } from "@/lib/compras/kpis";
import { resumenPorProveedor } from "@/lib/compras/proveedores-resumen";
import { ingenieroVeSoloLoSuyo, ordenesDeMisPedidos, pedidoEsDelUsuario, todayISO } from "@/lib/compras/helpers";

// RESUMEN de Órdenes de Compra: el panorama de la tubería completa —lo que se pidió,
// lo que se ordenó, lo que falta que llegue y dónde está detenido—, con el mismo panel
// que tiene proveeduria.adelante.cr en su pantalla de Órdenes de compra.
//
// Quién ve QUÉ: un ingeniero de obra ve SOLO lo suyo —sus solicitudes y las órdenes que
// salieron de ellas—, nunca lo de los demás ingenieros (decisión 2026-10-07). El Super
// Admin (y Proveeduría/Aprobación, que lo son) sigue viendo el panorama completo. El
// recorte es por USUARIO, no por rol: se reusan los mismos helpers que filtran "Mis
// solicitudes" y la bandeja de recepción, para que un número no diga una cosa acá y otra
// allá.
//
// Los números se calculan ACÁ y no adentro del panel: el recorrido de las órdenes es
// uno solo y así no se repite en cada render.
export default function ResumenComprasPage() {
  const { ordenes, pedidos, proveedores } = useStore();
  const me = useSession();

  // Si es ingeniero de obra, recortamos a lo suyo ANTES de calcular: así los KPIs, el
  // anillo, el ranking de proveedores y "lo que está detenido" salen todos del mismo
  // universo (el de esta persona) y no hay forma de que uno cuente de más.
  const soloMias = ingenieroVeSoloLoSuyo(me);
  const misPedidos = useMemo(
    () => (soloMias ? pedidos.filter((p) => pedidoEsDelUsuario(p, me)) : pedidos),
    [pedidos, me, soloMias],
  );
  const misOrdenes = useMemo(
    () => (soloMias ? ordenesDeMisPedidos(ordenes, pedidos, me) : ordenes),
    [ordenes, pedidos, me, soloMias],
  );

  const k = useMemo(() => kpisDeCompras(misOrdenes, todayISO()), [misOrdenes]);
  const porProveedor = useMemo(() => resumenPorProveedor(misOrdenes, proveedores), [misOrdenes, proveedores]);

  return (
    <AppShell role="ingenieria">
      <main className="page page--wide">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Órdenes de compra</h1>
            <p className="ds-muted">
              {soloMias
                ? "Lo que pediste vos, lo que se ordenó y lo que falta que llegue."
                : "Lo que pidió Ingeniería, lo que se ordenó y lo que falta que llegue."}
            </p>
          </div>
        </div>

        <ComprasResumen k={k} filas={porProveedor.filas} ordenes={misOrdenes} pedidos={misPedidos} scoped={soloMias} />
      </main>
    </AppShell>
  );
}
