"use client";

import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Button } from "@/components/compras/ui";
import { OrdenDetalle } from "@/components/compras/orden-detalle";
import { useStore } from "@/lib/compras/store";

export default function BodegaOrdenDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ordenes } = useStore();

  const orden = ordenes.find((o) => o.id === id);
  if (!orden) {
    return <AppShell role="contabilidad"><main className="page"><div className="empty">Orden no encontrada.</div></main></AppShell>;
  }

  const acciones = orden.estado === "lanzado" ? (
    <Button variant="red" onClick={() => router.push(`/compras/facturacion/${orden.id}`)}>Registrar factura</Button>
  ) : null;

  return (
    <AppShell role="contabilidad">
      <OrdenDetalle orden={orden} volverHref="/compras/facturacion/todas" volverLabel="Volver a órdenes" acciones={acciones} />
    </AppShell>
  );
}
