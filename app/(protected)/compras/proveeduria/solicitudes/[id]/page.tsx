"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/compras/shell";
import { Button, Modal, Textarea, useToast } from "@/components/compras/ui";
import { SolicitudDetalle } from "@/components/compras/solicitud-detalle";
import { useStore } from "@/lib/compras/store";
import { num, pedidoLineaPendiente } from "@/lib/compras/helpers";

export default function ProveeduriaPedidoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { pedidos, setBorrador, devolverLineasPedido, cargando } = useStore();
  const [devolverOpen, setDevolverOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [lineasSel, setLineasSel] = useState<string[]>([]);

  const pedido = pedidos.find((p) => p.id === id);
  if (!pedido) {
    return <AppShell role="proveeduria"><main className="page"><div className="empty">{cargando ? "Cargando solicitud…" : "Solicitud no encontrada."}</div></main></AppShell>;
  }
  const hayPendiente = pedido.lineas.some((l) => pedidoLineaPendiente(l) > 0);
  // Solo se puede devolver una línea que Proveeduría todavía NO ordenó: si ya tiene
  // orden de compra, queda bloqueada y no aparece para elegir.
  const lineasDevolvibles = pedido.lineas.filter((l) => l.cantidadOrdenada === 0);

  function crearOC() {
    const lineas = pedido!.lineas
      .filter((l) => pedidoLineaPendiente(l) > 0)
      .map((l) => ({ pedidoLineaId: l.id, cantidad: pedidoLineaPendiente(l), precio: 0, iva: 13 }));
    if (!lineas.length) { toast("Este pedido no tiene líneas pendientes por ordenar.", "error"); return; }
    setBorrador(lineas);
    router.push("/compras/proveeduria/nueva");
  }
  function abrirDevolver() {
    setLineasSel(lineasDevolvibles.map((l) => l.id));
    setMotivo("");
    setDevolverOpen(true);
  }
  function toggleLinea(id: string) {
    setLineasSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  async function confirmarDevolver() {
    if (!motivo.trim()) { toast("Escribí el motivo de la devolución.", "error"); return; }
    if (!lineasSel.length) { toast("Elegí al menos una línea para devolver.", "error"); return; }
    const todo = lineasSel.length === pedido!.lineas.length;
    await devolverLineasPedido(pedido!.id, lineasSel, motivo.trim());
    toast(todo ? `${pedido!.numero} devuelto a Ingeniería.` : `${lineasSel.length} línea(s) de ${pedido!.numero} devuelta(s) a Ingeniería.`, "info");
    setDevolverOpen(false);
    router.push("/compras/proveeduria/solicitudes");
  }

  const acciones = (
    <>
      <Button variant="red" onClick={abrirDevolver} disabled={!lineasDevolvibles.length}>Devolver al ingeniero</Button>
      <Button onClick={crearOC} disabled={!hayPendiente}>Crear orden de compra →</Button>
    </>
  );

  return (
    <AppShell role="proveeduria">
      <SolicitudDetalle pedido={pedido} volverHref="/compras/proveeduria/solicitudes" volverLabel="Volver a solicitudes" acciones={acciones} />

      {devolverOpen && (
        <Modal title={`Devolver ${pedido.numero} a Ingeniería`} onClose={() => setDevolverOpen(false)}
          footer={<><Button variant="outline" onClick={() => setDevolverOpen(false)}>Cancelar</Button><Button variant="red" onClick={confirmarDevolver}>Devolver</Button></>}>
          <p className="ds-muted ds-body-sm" style={{ marginTop: 0 }}>
            Elegí qué línea(s) debe corregir el ingeniero. Las que ya tienen orden de compra no se pueden devolver y no aparecen acá.
            Si devolvés todas, el pedido completo vuelve a Ingeniería; si es solo alguna, el resto sigue su curso normal.
          </p>
          <div className="col gap-1" style={{ border: "1.5px solid var(--ds-color-gray-100)", borderRadius: 12, padding: "6px 0", marginBottom: 12, maxHeight: 220, overflowY: "auto" }}>
            {lineasDevolvibles.map((l) => (
              <label key={l.id} className="row gap-2" style={{ alignItems: "center", padding: "6px 12px", cursor: "pointer" }}>
                <input type="checkbox" checked={lineasSel.includes(l.id)} onChange={() => toggleLinea(l.id)} />
                <span className="ds-body-sm">{l.descripcion} <span className="ds-muted">· {num.format(l.cantidad)} {l.unidad}</span></span>
              </label>
            ))}
          </div>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo de la devolución…" rows={4} style={{ width: "100%" }} />
        </Modal>
      )}
    </AppShell>
  );
}
