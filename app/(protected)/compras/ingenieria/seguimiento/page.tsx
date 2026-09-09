"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AppShell } from "@/components/compras/shell";
import { Badge } from "@/components/compras/ui";
import { DataTable } from "@/components/compras/data-table";
import { useStore } from "@/lib/compras/store";
import { destinoLabel, num, pedidoLineaDadaDeBaja, pedidoLineaPorRecibir, recibidoDeLineaPedido, tipoSolicitudBadge, destinoDeLinea } from "@/lib/compras/helpers";
import type { TipoSolicitud } from "@/lib/compras/types";

type Fila = {
  key: string; proyecto: string; pedidoId: string; pedidoNumero: string; tipo: TipoSolicitud;
  articulo: string; unidad: string; almacen: string; solicitado: number; recibido: number; pendiente: number;
  // Cuánto de esta línea se dio de baja al archivar la solicitud: nunca entró en una
  // orden y ya no se va a comprar. No se esconde la fila —el ingeniero tiene que poder
  // ver qué pasó con lo que pidió—, se marca.
  deBaja: number;
  comentario: string;
};

export default function SeguimientoPage() {
  const { pedidos, ordenes } = useStore();
  const router = useRouter();

  // OJO con "Por recibir": las solicitudes ARCHIVADAS siguen en la lista a propósito.
  // Archivarlas no cancela las órdenes que ya salieron (si le ordenaron 10 y recibió 4,
  // esas 6 vienen en camino y el ingeniero tiene que seguir viéndolas), pero lo que
  // nunca se ordenó ya no va a llegar: eso sale de "por recibir" y se marca como dado
  // de baja (ver pedidoLineaPorRecibir). Lo SOLICITADO no se toca: es lo que pidió.
  const filas = useMemo<Fila[]>(() => pedidos.flatMap((p) => p.lineas.map((l) => {
    const recibido = recibidoDeLineaPedido(ordenes, l.id);
    return {
      key: l.id, proyecto: destinoLabel(p), pedidoId: p.id, pedidoNumero: p.numero, tipo: p.tipoSolicitud,
      articulo: l.descripcion, unidad: l.unidad, almacen: destinoDeLinea(l, p), solicitado: l.cantidad, recibido,
      pendiente: pedidoLineaPorRecibir(l, p, recibido), deBaja: pedidoLineaDadaDeBaja(l, p),
      comentario: p.notas ?? "",
    };
  })), [pedidos, ordenes]);

  const columns = useMemo<ColumnDef<Fila, any>[]>(() => [
    { id: "proyecto", header: "Proyecto", accessorFn: (f) => f.proyecto, meta: { label: "Proyecto" }, cell: (c) => c.getValue() },
    { id: "obra", header: "Obra", accessorFn: (f) => f.almacen ?? "", meta: { label: "Obra" }, cell: (c) => <span className="ds-muted">{c.getValue() || "—"}</span> },
    { id: "pedido", header: "Pedido", accessorFn: (f) => f.pedidoNumero, meta: { label: "Pedido" }, cell: (c) => { const f = c.row.original; const t = tipoSolicitudBadge(f.tipo); return <span className="row gap-2" style={{ alignItems: "center" }}><Badge tone={t.tone}>{t.label}</Badge><span className="ds-body-sm ds-strong">{f.pedidoNumero}</span></span>; } },
    // La marca "Ya no se compra" va pegada al artículo (no en una columna aparte, que
    // quedaría vacía en casi todas las filas): dice por qué esa línea tiene 0 por recibir.
    { id: "articulo", header: "Artículo", accessorFn: (f) => f.articulo, meta: { label: "Artículo" }, cell: (c) => { const f = c.row.original; return <div className="row gap-2" style={{ alignItems: "center", maxWidth: 320 }}><div className="ds-truncate" title={f.articulo} style={{ maxWidth: 260 }}>{f.articulo}</div>{f.deBaja > 0 && <Badge tone="gray" title={`Se archivó la solicitud: ${num.format(f.deBaja)} ${f.unidad} nunca se ordenaron y ya no se van a comprar.`}>Ya no se compra</Badge>}</div>; } },
    { id: "solicitado", header: "Solicitado", accessorFn: (f) => f.solicitado, meta: { label: "Solicitado", num: true }, enableColumnFilter: false, cell: (c) => <span>{num.format(c.getValue())} {c.row.original.unidad}</span> },
    { id: "recibido", header: "Recibido", accessorFn: (f) => f.recibido, meta: { label: "Recibido", num: true }, enableColumnFilter: false, cell: (c) => <span className="ds-strong">{num.format(c.getValue())}</span> },
    { id: "porrecibir", header: "Por recibir", accessorFn: (f) => f.pendiente, meta: { label: "Por recibir", num: true }, enableColumnFilter: false, cell: (c) => { const f = c.row.original; return c.getValue() > 0 ? <span className="ds-pending-text">{num.format(c.getValue())}</span> : <span className="ds-muted" title={f.deBaja > 0 ? `${num.format(f.deBaja)} ${f.unidad} dados de baja al archivar la solicitud` : undefined}>{f.deBaja > 0 ? "—" : "0"}</span>; } },
    { id: "comentario", header: "Comentario", accessorFn: (f) => f.comentario, meta: { label: "Comentario" }, cell: (c) => <span className="ds-muted ds-body-sm">{c.getValue() || "—"}</span> },
  ], []);

  return (
    <AppShell role="ingenieria">
      <main className="page page--wide">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Seguimiento por proyecto</h1>
            <p className="ds-muted">Todas las líneas que pediste, agrupadas por proyecto: lo solicitado, lo que ya llegó y lo que falta.</p>
          </div>
        </div>
        <div className="mt-4">
          <DataTable data={filas} columns={columns} tablaKey="seguimiento" buscarPlaceholder="Buscar por material, pedido u obra…" getRowId={(f) => f.key} onRowClick={(f) => router.push(`/compras/ingenieria/${f.pedidoId}`)} vacio="No hay líneas para mostrar." />
        </div>
      </main>
    </AppShell>
  );
}
