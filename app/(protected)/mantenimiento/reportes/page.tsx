"use client";

import { useAppStore } from "@/lib/mantenimiento/store";
import { StatTile } from "@/components/mantenimiento/local/StatTile";
import { Table, type ColumnaTabla } from "@/components/mantenimiento/local/Table";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import type { Equipo, OrdenTrabajo } from "@/lib/mantenimiento/types";

interface FilaRanking {
  equipo: Equipo;
  cantidadOts: number;
  costo: number;
  costoPorOt: number;
}

export default function ReportesPage() {
  const { ots, equipos, cargando, errorCarga } = useAppStore();

  const finalizadas = ots.filter((o) => o.estado === "finalizada");
  const correctivas = ots.filter((o) => o.tipo === "correctivo");
  const costoDe = (o: OrdenTrabajo) => o.costoManoObra + o.repuestosUsados.reduce((a, l) => a + l.cantidad * l.costoUnitario, 0);
  const costoHistoricoTotal = ots.reduce((acc, o) => acc + costoDe(o), 0);

  const rankingPorEquipo: FilaRanking[] = equipos
    .map((eq) => {
      const otsEquipo = ots.filter((o) => o.equipoId === eq.id);
      const costo = otsEquipo.reduce((acc, o) => acc + costoDe(o), 0);
      return { equipo: eq, cantidadOts: otsEquipo.length, costo, costoPorOt: otsEquipo.length ? costo / otsEquipo.length : 0 };
    })
    .filter((r) => r.cantidadOts > 0)
    .sort((a, b) => b.costo - a.costo);

  const columnas: ColumnaTabla<FilaRanking>[] = [
    { key: "equipo", header: "Equipo", sortValue: (r) => r.equipo.nombre, render: (r) => r.equipo.nombre },
    { key: "cantidadOts", header: "OTs registradas", align: "right" },
    { key: "costo", header: "Costo total", align: "right", render: (r) => `₡${r.costo.toLocaleString("es-CR")}` },
    { key: "costoPorOt", header: "Costo promedio por OT", align: "right", render: (r) => `₡${Math.round(r.costoPorOt).toLocaleString("es-CR")}` }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)" }}>
      <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>Reportes</h1>
      <EstadoCarga cargando={cargando} error={errorCarga} />

      <div style={{ display: "flex", gap: "var(--ds-space-4)", flexWrap: "wrap" }}>
        <StatTile label="OTs finalizadas" value={finalizadas.length} icon="completado" tone="green" />
        <StatTile label="OTs correctivas (histórico)" value={correctivas.length} icon="alert" tone="red" />
        <StatTile label="Costo histórico total" value={`₡${costoHistoricoTotal.toLocaleString("es-CR")}`} icon="calculator" tone="black" />
      </div>

      <div>
        <div style={{ fontWeight: "var(--ds-font-weight-semibold)", marginBottom: "var(--ds-space-3)" }}>Costo por equipo</div>
        <Table tablaKey="reportes-ranking" columns={columnas} rows={rankingPorEquipo} getRowKey={(r) => r.equipo.id} emptyMessage="Sin costos registrados todavía." />
      </div>
    </div>
  );
}
