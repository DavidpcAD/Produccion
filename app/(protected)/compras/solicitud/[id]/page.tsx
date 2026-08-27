"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { SolicitudDetalle } from "@/components/compras/solicitud-detalle";
import { useStore } from "@/lib/compras/store";

// Vista de solo lectura de una solicitud, para quien llega desde una orden de compra
// (Aprobación, Bodega, Contabilidad): abre el pedido de origen sin sacarlo de su rol
// ni ofrecerle las acciones de Proveeduría. Proveeduría tiene la suya en
// /compras/proveeduria/solicitudes/[id], donde sí puede ordenar o devolver.
export default function SolicitudSoloLecturaPage() {
  const { id } = useParams<{ id: string }>();
  const { pedidos, role, cargando } = useStore();
  // Se conserva el rol con el que venía navegando: el menú lateral no debe cambiar
  // por abrir una solicitud.
  const shellRole = role ?? "ingenieria";

  const pedido = pedidos.find((p) => p.id === id);
  if (!pedido) {
    return <AppShell role={shellRole}><main className="page"><div className="empty">{cargando ? "Cargando solicitud…" : "Solicitud no encontrada."}</div></main></AppShell>;
  }

  return (
    <AppShell role={shellRole}>
      <SolicitudDetalle pedido={pedido} volverLabel="Volver" />
    </AppShell>
  );
}
