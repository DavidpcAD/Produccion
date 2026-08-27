"use client";

import { useRouter } from "next/navigation";
import { Badge, Card, QtyRing } from "@/components/compras/ui";
import { Timeline } from "@/components/compras/timeline";
import { useStore } from "@/lib/compras/store";
import { destinoCodigo, destinoDeLinea, destinoLabel, formatDate, num, pedidoBadge, pedidoLineaPendiente, recibidoDeLineaPedido, tipoSolicitudBadge } from "@/lib/compras/helpers";
import type { Pedido } from "@/lib/compras/types";

// Vista de una solicitud (pedido), reutilizada por Proveeduría —que trabaja sobre
// ella— y por la vista de solo lectura a la que llegan los demás roles desde la
// orden de compra. Lo que cambia entre una y otra son las `acciones`.
export function SolicitudDetalle({
  pedido,
  volverHref,
  volverLabel = "Volver",
  acciones,
}: {
  pedido: Pedido;
  volverHref?: string;
  volverLabel?: string;
  acciones?: React.ReactNode;
}) {
  const router = useRouter();
  const { ordenes } = useStore();
  const b = pedidoBadge(pedido.estado);
  const t = tipoSolicitudBadge(pedido.tipoSolicitud);
  const total = pedido.lineas.reduce((s, l) => s + l.cantidad, 0);
  const rec = pedido.lineas.reduce((s, l) => s + recibidoDeLineaPedido(ordenes, l.id), 0);

  return (
    <main className="page">
      <div className="back-link" onClick={() => (volverHref ? router.push(volverHref) : router.back())}>{volverLabel}</div>
      <div className="page__head">
        <div className="page__title">
          <div className="row gap-3">
            <h1 className="ds-heading">{pedido.numero}</h1>
            <Badge tone={t.tone}>{t.label}</Badge>
            <Badge tone={b.tone}>{b.label}</Badge>
          </div>
          <p className="ds-muted">{destinoCodigo(pedido)} · {destinoLabel(pedido)} · {pedido.solicitante} · {formatDate(pedido.fecha)}</p>
        </div>
        <div className="row gap-3" style={{ alignItems: "center" }}>
          <div className="row gap-2" style={{ alignItems: "center" }}><QtyRing recibida={rec} total={total} /><span className="ds-body-sm ds-muted">entregado</span></div>
          {acciones}
        </div>
      </div>

      {pedido.notas && (
        <Card className="mt-2" style={{ background: "color-mix(in srgb, var(--ds-color-yellow) 8%, var(--ds-tint-base))" }}>
          <span className="ds-label ds-muted">Comentario</span>
          <p style={{ margin: "4px 0 0" }}>{pedido.notas}</p>
        </Card>
      )}

      <Card className="mt-4" style={{ padding: 0, overflow: "hidden" }}>
        <div className="ds-table-wrap" style={{ boxShadow: "none" }}>
          <table className="ds-table">
            <thead><tr><th>Artículo</th><th>Obra</th><th className="ds-num">Solicitado</th><th className="ds-num">Ordenado</th><th className="ds-num">Pendiente</th></tr></thead>
            <tbody>
              {pedido.lineas.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div className="row gap-2" style={{ alignItems: "center" }}>
                      <div className="ds-truncate" title={l.descripcion} style={{ maxWidth: 260 }}>{l.descripcion}</div>
                      {l.devuelta && <Badge tone="red">Devuelta</Badge>}
                    </div>
                  </td>
                  <td className="ds-muted ds-body-sm">{destinoDeLinea(l, pedido) || "—"}</td>
                  <td className="ds-num">{num.format(l.cantidad)} {l.unidad}</td>
                  <td className="ds-num">{num.format(l.cantidadOrdenada)}</td>
                  <td className="ds-num">{pedidoLineaPendiente(l) > 0 ? <span className="ds-pending-text">{num.format(pedidoLineaPendiente(l))}</span> : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <h3 className="ds-subtitle mt-6" style={{ marginBottom: 12 }}>Historial</h3>
      <Card><Timeline entidad="pedido" idEntidad={pedido.id} traza /></Card>
    </main>
  );
}
