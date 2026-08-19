"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Badge, Button, Card, useToast } from "@/components/compras/ui";
import { Timeline } from "@/components/compras/timeline";
import { NuevaSolicitudSheet, type NuevaSolicitudSeed } from "@/components/compras/nueva-solicitud-sheet";
import { useStore } from "@/lib/compras/store";
import { destinoLabel, esConsumoInmediato, formatDate, num, obraDeLinea, pedidoBadge, recibidoDeLineaPedido, tipoSolicitudBadge } from "@/lib/compras/helpers";

export default function PedidoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { pedidos, ordenes, setPedidoEstado, deletePedido } = useStore();
  const [copiarOpen, setCopiarOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);

  const pedido = pedidos.find((p) => p.id === id);
  if (!pedido) {
    return (
      <AppShell role="ingenieria">
        <main className="page"><div className="empty">Pedido no encontrado.</div></main>
      </AppShell>
    );
  }
  const b = pedidoBadge(pedido.estado);
  const t = tipoSolicitudBadge(pedido.tipoSolicitud);
  const ordenado = pedido.lineas.some((l) => l.cantidadOrdenada > 0);

  // Semilla del pedido: la usa "Copiar" (crea uno nuevo con las mismas líneas) y
  // "Editar" (el MISMO drawer, guardando sobre este pedido). La pantalla completa
  // vieja ya no existe.
  const seedPedido: NuevaSolicitudSeed = {
    tipo: pedido.tipoSolicitud,
    prioridad: pedido.prioridad,
    notas: pedido.notas,
    // Consumo directo (CD) = las líneas traían tarea (Job Task) de la obra.
    consumo: pedido.lineas.some((l) => !!l.taskNo),
    destino: pedido.tipoSolicitud === "repuesto" ? pedido.maquinaNo : undefined,
    // Almacén elegido (tag ALM / pedido de Stock): se copia tal cual.
    almacen: pedido.lineas.find((l) => !!l.almacen && !l.taskNo)?.almacen || undefined,
    idClasificacion: pedido.idClasificacion ?? null,
    lineas: pedido.lineas.map((l) => ({
      code: l.articuloId, cantidad: l.cantidad,
      obraCodigo: pedido.tipoSolicitud === "material" ? (obraDeLinea(l, pedido) || undefined) : undefined,
      variantCode: l.variantCode, descripcion: l.descripcion, unidad: l.unidad,
      // La actividad (tarea) del consumo directo viaja con la línea.
      taskNo: l.taskNo, taskDescr: l.taskDescr,
    })),
  };

  return (
    <AppShell role="ingenieria">
      <NuevaSolicitudSheet open={copiarOpen} setOpen={setCopiarOpen} seed={seedPedido} />
      {/* Editar = el mismo drawer, sobre este pedido. */}
      <NuevaSolicitudSheet open={editarOpen} setOpen={setEditarOpen}
        editar={{ id: pedido.id, numero: pedido.numero, seed: seedPedido }} />
      <main className="page">
        <div className="back-link" onClick={() => router.push("/compras/ingenieria")}>Volver a pedidos</div>
        <div className="page__head">
          <div className="page__title">
            <div className="row gap-3">
              <h1 className="ds-heading">{pedido.numero}</h1>
              <Badge tone={t.tone}>{t.label}</Badge>
              {pedido.tipoSolicitud !== "stock" && (
                <Badge tone={esConsumoInmediato(pedido) ? "green" : "gray"}>
                  {esConsumoInmediato(pedido)
                    ? "CD · consumo directo"
                    : `ALM · ${pedido.lineas.find((l) => !!l.almacen)?.almacen || "ALM-GRAL"}`}
                </Badge>
              )}
              <Badge tone={b.tone}>{b.label}</Badge>
            </div>
            <p className="ds-muted">{destinoLabel(pedido)} · {pedido.solicitante} · {formatDate(pedido.fecha)}</p>
          </div>
          <div className="row gap-3">
            <Button variant="outline" title="Crear una solicitud nueva con las mismas líneas" onClick={() => setCopiarOpen(true)}>
              ⧉ Copiar
            </Button>
            {(pedido.estado === "borrador" || pedido.estado === "devuelto") && (
              <>
                <Button variant="outline" onClick={async () => { await deletePedido(pedido.id); toast("Pedido eliminado"); router.push("/compras/ingenieria"); }}>
                  Eliminar
                </Button>
                <Button variant="outline" onClick={() => setEditarOpen(true)}>
                  Editar
                </Button>
                <Button onClick={async () => { await setPedidoEstado(pedido.id, "aprobado"); toast(`${pedido.numero} enviado a proveeduría`, "success"); }}>
                  Enviar a proveeduría
                </Button>
              </>
            )}
            {pedido.estado === "aprobado" && !ordenado && (
              <Button variant="outline" onClick={async () => { await setPedidoEstado(pedido.id, "borrador"); toast("Pedido reabierto como borrador"); }}>
                Volver a borrador
              </Button>
            )}
            {pedido.estado === "aprobado" && ordenado && (
              <span className="ds-muted ds-label" style={{ alignSelf: "center" }}>Proveeduría ya generó orden de compra · no editable</span>
            )}
          </div>
        </div>

        {pedido.notas && (
          <Card flat className="mt-2"><span className="ds-muted ds-label">Notas:</span> {pedido.notas}</Card>
        )}

        <Card className="mt-4" style={{ padding: 0, overflow: "hidden" }}>
          <div className="ds-table-wrap" style={{ boxShadow: "none" }}>
            <table className="ds-table ds-table--center-num">
              <thead>
                <tr>
                  <th>Artículo</th>
                  {pedido.tipoSolicitud === "material" && <th>Obra</th>}
                  <th>Almacén</th><th className="ds-num">Solicitado</th>
                  <th className="ds-num">En orden</th><th className="ds-num">Recibido</th><th className="ds-num">Por recibir</th>
                </tr>
              </thead>
              <tbody>
                {pedido.lineas.map((l) => {
                  const recibido = recibidoDeLineaPedido(ordenes, l.id);
                  const porRecibir = Math.max(0, l.cantidad - recibido);
                  return (
                    <tr key={l.id}>
                      <td>{l.descripcion}</td>
                      {pedido.tipoSolicitud === "material" && <td className="ds-muted">{obraDeLinea(l, pedido) || "—"}</td>}
                      <td className="ds-muted">{l.almacen || (l.taskNo ? obraDeLinea(l, pedido) : "—")}</td>
                      <td className="ds-num">{num.format(l.cantidad)} {l.unidad}</td>
                      <td className="ds-num">{num.format(l.cantidadOrdenada)}</td>
                      <td className="ds-num ds-strong">{num.format(recibido)}</td>
                      <td className="ds-num">
                        {porRecibir > 0 ? <span className="ds-pending-text">{num.format(porRecibir)}</span> : <span className="ds-muted">0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {pedido.estado === "aprobado" && !ordenado && (
          <p className="ds-muted ds-label mt-4">Este pedido está aprobado. Proveeduría puede convertirlo en una orden de compra.</p>
        )}

        <h3 className="ds-subtitle mt-6" style={{ marginBottom: 12 }}>Historial</h3>
        <Card><Timeline entidad="pedido" idEntidad={pedido.id} traza /></Card>
      </main>
    </AppShell>
  );
}
