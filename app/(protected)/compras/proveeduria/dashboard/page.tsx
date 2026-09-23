"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AppShell } from "@/components/compras/shell";
import { Tile, ProgressBar } from "@/components/compras/ui";
import { DataTable } from "@/components/compras/data-table";
import { useStore } from "@/lib/compras/store";
import { money, num } from "@/lib/compras/helpers";
import { resumenPorProveedor, type FilaProv } from "@/lib/compras/proveedores-resumen";

// El cálculo vive en lib/compras/proveedores-resumen: lo comparte con el Resumen de
// Órdenes de compra, que arma con él el ranking de "a quién hay que corretearle". Dos
// pantallas con dos cuentas para el mismo rótulo es como se empieza a desconfiar.
type ProvRow = FilaProv;

// Dashboard de Proveeduría: qué se ha pedido vs. entregado, por proveedor.
// Cada fila se puede expandir para ver sus líneas. La tabla se puede filtrar,
// reordenar y guardar como vista (Columnas / Vistas) — Angie la arma como quiera.
export default function ProveeduriaDashboardPage() {
  const { ordenes, proveedores } = useStore();

  const { filas, tot } = useMemo(() => {
    const r = resumenPorProveedor(ordenes, proveedores);
    return { filas: r.filas, tot: { pedido: r.pedido, recibido: r.recibido } };
  }, [ordenes, proveedores]);

  const pctGlobal = tot.pedido > 0 ? Math.round((tot.recibido / tot.pedido) * 100) : 0;
  const pendienteGlobal = Math.max(0, tot.pedido - tot.recibido);

  const columns = useMemo<ColumnDef<ProvRow, any>[]>(() => [
    { id: "prov", header: "Proveedor", accessorFn: (r) => r.nombre, meta: { label: "Proveedor" }, cell: (c) => <span className="ds-strong">{c.getValue()}</span> },
    { id: "ordenes", header: "Órdenes", accessorFn: (r) => r.nOrdenes, meta: { label: "Órdenes", num: true }, enableColumnFilter: false, cell: (c) => c.getValue() },
    { id: "pedido", header: "Pedido", accessorFn: (r) => r.pedido, meta: { label: "Pedido", num: true }, enableColumnFilter: false, cell: (c) => money(c.getValue(), c.row.original.currency) },
    { id: "recibido", header: "Entregado", accessorFn: (r) => r.recibido, meta: { label: "Entregado", num: true }, enableColumnFilter: false, cell: (c) => money(c.getValue(), c.row.original.currency) },
    { id: "pendiente", header: "Pendiente", accessorFn: (r) => r.pendiente, meta: { label: "Pendiente", num: true }, enableColumnFilter: false, cell: (c) => { const v = Number(c.getValue()); return <span className="ds-strong" style={{ color: v > 0 ? "var(--ds-color-red-200)" : "inherit" }}>{money(v, c.row.original.currency)}</span>; } },
    { id: "pct", header: "% entregado", accessorFn: (r) => r.pct, meta: { label: "% entregado", num: true }, enableColumnFilter: false, cell: (c) => { const r = c.row.original; return <div className="row" style={{ justifyContent: "flex-end" }}><ProgressBar compact value={r.recibido} total={r.pedido} /></div>; } },
  ], []);

  const renderExpanded = (r: ProvRow) => (
    <div className="ds-table-wrap" style={{ boxShadow: "none" }}>
      <table className="ds-table">
        <thead><tr><th>Orden</th><th>Artículo</th><th className="ds-num">Pedido</th><th className="ds-num">Entregado</th><th className="ds-num">Pendiente</th><th className="ds-num">Monto</th></tr></thead>
        <tbody>
          {r.lineas.map((l, i) => (
            <tr key={`${l.orden}-${l.code}-${i}`}>
              <td><span className="ds-strong ds-body-sm">{l.orden}</span></td>
              <td><span className="ds-strong ds-body-sm">{l.code}</span> <span className="ds-muted">— {l.desc}</span></td>
              <td className="ds-num">{num.format(l.cantidad)} {l.unidad}</td>
              <td className="ds-num">{num.format(l.recibida)}</td>
              <td className="ds-num ds-strong">{num.format(l.pendiente)}</td>
              <td className="ds-num">{money(l.monto, r.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <AppShell role="proveeduria">
      <main className="page page--wide">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Dashboard</h1>
            <p className="ds-muted">Lo pedido vs. lo entregado, por proveedor. Abrí un proveedor para ver sus líneas. Filtrá, ordená y guardá tu vista.</p>
          </div>
        </div>

        <div className="tiles mt-2">
          <Tile value={money(tot.pedido, "CRC")} label="Pedido (total)" />
          <Tile value={money(tot.recibido, "CRC")} label="Entregado (total)" accent="var(--ds-color-green-200)" />
          <Tile value={`${pctGlobal}%`} label="Entregado (global)" accent="var(--ds-color-green-100)" />
          <Tile value={money(pendienteGlobal, "CRC")} label="Pendiente por entregar" accent="var(--ds-color-red-100)" />
        </div>

        <h2 className="ds-subtitle" style={{ marginTop: 28 }}>Por proveedor</h2>
        <div className="mt-2">
          <DataTable data={filas} columns={columns} tablaKey="dash-prov" buscarPlaceholder="Buscar proveedor…" getRowId={(r) => r.proveedorId} renderExpanded={renderExpanded} vacio="Todavía no hay órdenes de compra." />
        </div>
      </main>
    </AppShell>
  );
}
