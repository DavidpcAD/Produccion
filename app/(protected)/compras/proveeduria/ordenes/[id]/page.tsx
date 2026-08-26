"use client";

import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Button, useToast } from "@/components/compras/ui";
import { OrdenDetalle } from "@/components/compras/orden-detalle";
import { useStore } from "@/lib/compras/store";
import { numeroOrden } from "@/lib/compras/helpers";

export default function ProvOrdenDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { ordenes, pedidos, setOrdenEstado, cargando } = useStore();

  const orden = ordenes.find((o) => o.id === id);
  if (!orden) {
    return <AppShell role="proveeduria"><main className="page"><div className="empty">{cargando ? "Cargando orden…" : "Orden no encontrada."}</div></main></AppShell>;
  }
  // Link de cada línea a su solicitud de origen (para ver quién la pidió).
  const solicitudHref = (l: NonNullable<typeof orden>["lineas"][number]) => {
    const p = (l.pedidoLineaId && pedidos.find((x) => x.lineas.some((ln) => ln.id === l.pedidoLineaId)))
      || (l.pedidoNumero && pedidos.find((x) => x.numero === l.pedidoNumero));
    return p ? `/compras/proveeduria/solicitudes/${p.id}` : null;
  };

  async function act(estado: NonNullable<typeof orden>["estado"], msg: string) {
    const r = await setOrdenEstado(orden!.id, estado);
    // El estado en la app ya cambió; si BC no acompañó (mandar a aprobación el pedido /
    // reabrirlo cancelando la solicitud), el motivo se muestra en vez de cantar éxito.
    if (r?.bcAviso) toast(`${msg} · ⚠️ ${r.bcAviso}`, "error");
    else toast(msg, "success");
  }

  const acciones = (
    <>
      {orden.estado === "abierto" && (
        <>
          <Button variant="outline" onClick={() => router.push(`/compras/proveeduria/ordenes/${orden.id}/editar`)}>Editar</Button>
          <Button onClick={() => act("pendiente_aprobacion", `${numeroOrden(orden)} enviada a aprobación`)}>Enviar a aprobación</Button>
        </>
      )}
      {orden.estado === "pendiente_aprobacion" && (
        <>
          <span className="ds-muted ds-label" style={{ alignSelf: "center" }}>En espera de aprobación de Luis Roberto</span>
          <Button variant="outline" onClick={() => act("abierto", "Solicitud de aprobación cancelada")}>Cancelar envío</Button>
        </>
      )}
      {orden.estado === "rechazado" && (
        <>
          <Button variant="outline" onClick={() => router.push(`/compras/proveeduria/ordenes/${orden.id}/editar`)}>Editar</Button>
          <Button onClick={() => act("pendiente_aprobacion", `${numeroOrden(orden)} corregida y reenviada a aprobación`)}>Reenviar a aprobación</Button>
        </>
      )}
      {orden.estado === "lanzado" && (
        <Button variant="outline" onClick={() => { act("abierto", "Orden reabierta para edición"); if (orden.bcDeepLink) window.open(orden.bcDeepLink, "_blank"); }}>Volver a abrir</Button>
      )}
    </>
  );

  return (
    <AppShell role="proveeduria">
      <OrdenDetalle orden={orden} volverHref="/compras/proveeduria/ordenes" volverLabel="Volver a órdenes" acciones={acciones} solicitudHref={solicitudHref} />
    </AppShell>
  );
}
