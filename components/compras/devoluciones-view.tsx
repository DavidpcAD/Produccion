"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AppShell } from "@/components/compras/shell";
import { Badge } from "@/components/compras/ui";
import { DataTable } from "@/components/compras/data-table";
import { useStore } from "@/lib/compras/store";
import { useSession } from "@/hooks/useSession";
import { destinoLabel, formatDate, numeroOrden, pedidoEsDelUsuario, pedidoTieneDevolucion, veTodoEnCompras } from "@/lib/compras/helpers";
import type { Role } from "@/lib/compras/types";

type Dev = { id: string; tipo: "Solicitud" | "Orden"; numero: string; contra: string; motivo: string; fecha: string; href: string };

// Bandeja de devoluciones, compartida por todos los roles. Reúne:
//  • Solicitudes que Proveeduría devolvió a Ingeniería (pedido entero, o solo
//    alguna(s) línea(s) puntual(es) — el resto del pedido sigue su curso normal)
//  • Órdenes que Aprobación rechazó a Proveeduría (orden.estado = "rechazado")
// Cada rol ve las que le competen y entra a corregirlas.
export function DevolucionesView({ role }: { role: Role }) {
  const { pedidos, ordenes } = useStore();
  const me = useSession();
  const router = useRouter();

  const items = useMemo<Dev[]>(() => {
    const out: Dev[] = [];
    const verSolicitudes = role === "ingenieria" || role === "proveeduria";
    const verOrdenes = role === "proveeduria" || role === "aprobacion" || role === "facturacion";
    if (verSolicitudes) {
      // El ingeniero ve SOLO las devoluciones de SUS solicitudes: la devolución es
      // "corregí esto y reenvialo", y solo la puede corregir quien la pidió (mismo
      // criterio que su lista de solicitudes). Proveeduría sí las ve todas: es quien
      // las devolvió. El Super Admin también, para poder revisar.
      // Mientras la sesión carga (me === null) no se muestra ninguna.
      const mias = (p: Parameters<typeof pedidoEsDelUsuario>[0]) =>
        role !== "ingenieria" || veTodoEnCompras(me) || pedidoEsDelUsuario(p, me);
      for (const p of pedidos.filter((p) => pedidoTieneDevolucion(p) && mias(p))) {
        const lineasDevueltas = p.lineas.filter((l) => l.devuelta);
        out.push({
          id: p.id, tipo: "Solicitud", numero: p.numero, contra: destinoLabel(p),
          motivo: lineasDevueltas.length && p.estado !== "devuelto"
            ? `${lineasDevueltas.length} línea(s): ${lineasDevueltas.map((l) => l.descripcion).join(", ")}`
            : (p.notas ?? "").replace(/^↩\s*Devuelto:\s*/i, "").split(" · ")[0] || "—",
          fecha: p.fecha, href: role === "ingenieria" ? `/compras/ingenieria/${p.id}` : `/compras/proveeduria/solicitudes/${p.id}`,
        });
      }
    }
    if (verOrdenes) {
      for (const o of ordenes.filter((o) => o.estado === "rechazado")) {
        out.push({
          id: o.id, tipo: "Orden", numero: numeroOrden(o), contra: o.proveedorNombre ?? o.proveedorNo ?? "—",
          motivo: o.motivoRechazo ?? "—", fecha: o.fecha,
          href: role === "aprobacion" ? `/compras/aprobacion/${o.id}` : role === "proveeduria" ? `/compras/proveeduria/ordenes/${o.id}` : "",
        });
      }
    }
    return out;
  }, [pedidos, ordenes, role, me]);

  const columns = useMemo<ColumnDef<Dev, any>[]>(() => [
    { id: "tipo", header: "Tipo", accessorFn: (d) => d.tipo, meta: { label: "Tipo" }, cell: (c) => <Badge tone={c.getValue() === "Orden" ? "red" : "yellow"}>{c.getValue()}</Badge> },
    { id: "numero", header: "N.º", accessorFn: (d) => d.numero, meta: { label: "N.º" }, cell: (c) => <span className="ds-strong">{c.getValue()}</span> },
    { id: "contra", header: "Proveedor / Destino", accessorFn: (d) => d.contra, meta: { label: "Proveedor / Destino" } },
    { id: "motivo", header: "Motivo", accessorFn: (d) => d.motivo, meta: { label: "Motivo" }, cell: (c) => <span className="ds-muted">{c.getValue()}</span> },
    { id: "fecha", header: "Fecha", accessorFn: (d) => d.fecha, meta: { label: "Fecha", date: true }, cell: (c) => formatDate(c.getValue()) },
  ], []);

  const desc = role === "ingenieria" ? "Solicitudes que Proveeduría te devolvió para corregir. Entrá a una para editarla y reenviarla."
    : role === "proveeduria" ? "Órdenes que Aprobación rechazó (corregí y relanzá) y solicitudes que devolviste a Ingeniería."
    : role === "aprobacion" ? "Órdenes que rechazaste y devolviste a Proveeduría, con su motivo."
    : "Órdenes rechazadas por Aprobación (solo lectura).";

  return (
    <AppShell role={role}>
      <main className="page page--wide">
        <div className="page__head"><div className="page__title">
          <h1 className="ds-heading">Devoluciones</h1>
          <p className="ds-muted">{desc}</p>
        </div></div>
        <div className="mt-4">
          <DataTable data={items} columns={columns} tablaKey={`devoluciones-${role}`} titulo="Devoluciones" buscarPlaceholder="Buscar por material, orden o proveedor…"
            getRowId={(d) => `${d.tipo}-${d.id}`} onRowClick={(d) => { if (d.href) router.push(d.href); }}
            vacio="No hay devoluciones pendientes." />
        </div>
      </main>
    </AppShell>
  );
}
