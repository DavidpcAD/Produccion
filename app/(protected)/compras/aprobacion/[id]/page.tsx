"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/compras/shell";
import { Button, Modal, Textarea, useToast } from "@/components/compras/ui";
import { OrdenDetalle } from "@/components/compras/orden-detalle";
import { useStore } from "@/lib/compras/store";
import { aprobarYLanzar } from "@/lib/compras/aprobar";
import { numeroOrden } from "@/lib/compras/helpers";

export default function AprobacionOrdenDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { ordenes, setOrdenEstado, devolverOrden, cargando } = useStore();
  const [rechazarOpen, setRechazarOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aprobando, setAprobando] = useState(false);

  const orden = ordenes.find((o) => o.id === id);
  // Mientras el store trae las órdenes todavía no sabemos si existe: no digas
  // "no encontrada" antes de tiempo. Todos los hooks van ARRIBA de este return.
  if (!orden) {
    return <AppShell role="aprobacion"><main className="page"><div className="empty">{cargando ? "Cargando orden…" : "Orden no encontrada."}</div></main></AppShell>;
  }

  // "Volver" (y el rechazo) regresan a la lista de donde salió la orden: pendientes y
  // abiertas se ven en "Órdenes por aprobar" (sus KPI filtran); las ya aprobadas viven
  // en "Todas las órdenes", que no incluye las que siguen en proveeduría.
  const enAprobacion = orden.estado === "pendiente_aprobacion" || orden.estado === "abierto";
  const volverHref = enAprobacion ? "/compras/aprobacion" : "/compras/aprobacion/todas";
  const volverLabel = enAprobacion ? "Volver a órdenes por aprobar" : "Volver a órdenes";

  // Aprobar (Luis Roberto): crea y LANZA el pedido en BC en un paso. La orden solo
  // pasa a "lanzado" si BC de verdad la creó con líneas y la lanzó; si BC falla,
  // queda pendiente y se muestra el motivo real (ver lib/aprobar.ts).
  async function aprobar() {
    setAprobando(true);
    const r = await aprobarYLanzar(orden!, setOrdenEstado);
    toast(r.message, r.tone);
    setAprobando(false);
  }

  // Rechazar/denegar: el motivo es OBLIGATORIO. Vuelve a Proveeduría con la nota
  // registrada en el historial y como notificación.
  async function confirmarRechazo() {
    if (!motivo.trim()) { toast("Escribí el motivo del rechazo.", "error"); return; }
    await devolverOrden(orden!.id, motivo.trim());
    toast(`${numeroOrden(orden!)} devuelta a proveeduría`, "info");
    setRechazarOpen(false);
    router.push(volverHref);
  }

  const acciones = orden.estado === "pendiente_aprobacion" ? (
    <>
      <Button variant="red" onClick={() => setRechazarOpen(true)} disabled={aprobando}>Rechazar</Button>
      <Button onClick={aprobar} disabled={aprobando}>{aprobando ? "Lanzando…" : "Aprobar y lanzar"}</Button>
    </>
  ) : null;

  return (
    <AppShell role="aprobacion">
      <OrdenDetalle orden={orden} volverHref={volverHref} volverLabel={volverLabel} acciones={acciones} />
      {rechazarOpen && (
        <Modal title={`Rechazar ${numeroOrden(orden)}`} onClose={() => setRechazarOpen(false)}
          footer={<><Button variant="outline" onClick={() => setRechazarOpen(false)}>Cancelar</Button><Button variant="red" onClick={confirmarRechazo}>Rechazar y devolver</Button></>}>
          <p className="ds-muted ds-body-sm" style={{ marginTop: 0 }}>Indicá por qué se devuelve la orden. Le llega una notificación a Proveeduría y el motivo queda en el historial.</p>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del rechazo…" rows={4} style={{ width: "100%" }} />
        </Modal>
      )}
    </AppShell>
  );
}
