"use client";

import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Button } from "@/components/compras/ui";
import { OrdenDetalle } from "@/components/compras/orden-detalle";
import { useStore } from "@/lib/compras/store";
import { useSession } from "@/hooks/useSession";

export default function BodegaOrdenDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ordenes, cargando } = useStore();
  const me = useSession();

  // Quien solo RECIBE (bodega, fábrica) no tiene las pestañas de contabilidad: se le
  // muestra su propia cabecera y se le devuelve a "Órdenes por recibir". Volver a
  // "Todas las órdenes" lo sacaba de la pantalla, porque esa ruta es de ingeniería
  // (ver modulosDeRuta). Sin módulos —usuario sin rol de Producción— queda como estaba.
  const mods = me?.modules ?? [];
  const soloRecepcion = mods.includes("recepcion") && !mods.includes("ingenieria") && !mods.includes("admin");
  const shellRole = soloRecepcion ? "facturacion" : "contabilidad";

  const orden = ordenes.find((o) => o.id === id);
  if (!orden) {
    return <AppShell role={shellRole}><main className="page"><div className="empty">{cargando ? "Cargando orden…" : "Orden no encontrada."}</div></main></AppShell>;
  }

  const acciones = orden.estado === "lanzado" ? (
    <Button variant="red" onClick={() => router.push(`/compras/facturacion/${orden.id}`)}>Registrar factura</Button>
  ) : null;

  return (
    <AppShell role={shellRole}>
      <OrdenDetalle
        orden={orden}
        volverHref={soloRecepcion ? "/compras/facturacion" : "/compras/facturacion/todas"}
        volverLabel={soloRecepcion ? "Volver a órdenes por recibir" : "Volver a órdenes"}
        acciones={acciones}
      />
    </AppShell>
  );
}
