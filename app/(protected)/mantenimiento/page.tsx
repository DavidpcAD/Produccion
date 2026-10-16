"use client";

import Link from "next/link";
import { useAppStore } from "@/lib/mantenimiento/store";
import { StatTile } from "@/components/mantenimiento/local/StatTile";
import { MiniBarChart } from "@/components/mantenimiento/local/MiniBarChart";
import { InspeccionesSemana } from "@/components/mantenimiento/local/InspeccionesSemana";
import { Pill } from "@/components/mantenimiento/local/Table";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";
import { urgenciaPlan } from "@/lib/mantenimiento/planUtils";
import type { TipoOt } from "@/lib/mantenimiento/types";

export default function DashboardPage() {
  const { equipos, ots, repuestos, planes, cargando, errorCarga } = useAppStore();

  const disponibilidad = Math.round((equipos.filter((e) => e.estado === "operativo").length / Math.max(1, equipos.length)) * 100);
  const otsAbiertas = ots.filter((o) => o.estado === "abierta" || o.estado === "en_proceso").length;

  const planesUrgentes = planes
    .filter((p) => p.activo)
    .map((p) => ({ plan: p, equipo: equipos.find((e) => e.id === p.equipoId), urgencia: urgenciaPlan(p, equipos.find((e) => e.id === p.equipoId)) }))
    .filter((p) => p.urgencia === "vencido" || p.urgencia === "proximo");

  const repuestosBajoStock = repuestos.filter((r) => r.stockActual <= r.stockMinimo);
  const alertasActivas = planesUrgentes.length + repuestosBajoStock.length;

  const correctivasFinalizadas = ots.filter((o) => o.tipo === "correctivo" && o.estado === "finalizada" && o.fechaInicio && o.fechaFin);
  const mttrHoras = correctivasFinalizadas.length
    ? Math.round(
        correctivasFinalizadas.reduce((acc, o) => acc + (new Date(o.fechaFin as string).getTime() - new Date(o.fechaInicio as string).getTime()), 0) /
          correctivasFinalizadas.length /
          3600000
      )
    : 0;

  const costoTotalMes = ots.reduce((acc, o) => {
    const costoRepuestos = o.repuestosUsados.reduce((a, l) => a + l.cantidad * l.costoUnitario, 0);
    return acc + o.costoManoObra + costoRepuestos;
  }, 0);

  const otsPorTipo: { tipo: TipoOt; cantidad: number }[] = (["preventivo", "correctivo", "predictivo"] as TipoOt[]).map((tipo) => ({
    tipo,
    cantidad: ots.filter((o) => o.tipo === tipo).length
  }));

  const costoPorEquipo = equipos
    .map((eq) => ({
      nombre: eq.codigo,
      costo: ots
        .filter((o) => o.equipoId === eq.id)
        .reduce((acc, o) => acc + o.costoManoObra + o.repuestosUsados.reduce((a, l) => a + l.cantidad * l.costoUnitario, 0), 0)
    }))
    .filter((e) => e.costo > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-6)" }}>
      <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>Panel</h1>
      <EstadoCarga cargando={cargando} error={errorCarga} />

      <div style={{ display: "flex", gap: "var(--ds-space-4)", flexWrap: "wrap" }}>
        <StatTile label="Disponibilidad de flota" value={`${disponibilidad}%`} icon="good" tone="green" />
        <StatTile label="OTs abiertas" value={otsAbiertas} icon="boleta" tone="black" />
        <StatTile label="Alertas activas" value={alertasActivas} icon="alert" tone={alertasActivas > 0 ? "red" : "black"} />
        <StatTile label="MTTR correctivo" value={`${mttrHoras} h`} icon="incompleto" tone="black" />
        <StatTile label="Costo total registrado" value={`₡${costoTotalMes.toLocaleString("es-CR")}`} icon="calculator" tone="black" />
      </div>

      <InspeccionesSemana />

      <div style={{ display: "flex", gap: "var(--ds-space-4)", flexWrap: "wrap" }}>
        <div style={{ background: "var(--ds-surface)", borderRadius: "var(--ds-radius-lg)", boxShadow: "var(--ds-shadow-01)", padding: "var(--ds-space-5)", flex: 1, minWidth: 320 }}>
          <div style={{ fontWeight: "var(--ds-font-weight-semibold)", marginBottom: "var(--ds-space-2)" }}>OTs por tipo</div>
          <MiniBarChart data={otsPorTipo} valueKey="cantidad" labelKey="tipo" tone="green" />
        </div>
        <div style={{ background: "var(--ds-surface)", borderRadius: "var(--ds-radius-lg)", boxShadow: "var(--ds-shadow-01)", padding: "var(--ds-space-5)", flex: 1, minWidth: 320 }}>
          <div style={{ fontWeight: "var(--ds-font-weight-semibold)", marginBottom: "var(--ds-space-2)" }}>Costo por equipo</div>
          {costoPorEquipo.length ? (
            <MiniBarChart data={costoPorEquipo} valueKey="costo" labelKey="nombre" tone="black" />
          ) : (
            <div style={{ color: "var(--ds-color-gray-400)", padding: "var(--ds-space-5) 0" }}>Sin costos registrados todavía.</div>
          )}
        </div>
      </div>

      <div style={{ background: "var(--ds-surface)", borderRadius: "var(--ds-radius-lg)", boxShadow: "var(--ds-shadow-01)", padding: "var(--ds-space-5)" }}>
        <div style={{ fontWeight: "var(--ds-font-weight-semibold)", marginBottom: "var(--ds-space-3)" }}>Atención requerida</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)" }}>
          {planesUrgentes.map(({ plan, equipo, urgencia }) => (
            <Link
              key={plan.id}
              href="/mantenimiento/planes"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--ds-space-3)", borderRadius: "var(--ds-radius-md)", background: "var(--ds-color-gray-100)", textDecoration: "none", color: "inherit" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)" }}>
                <Icon name="alert" size="sm" color={urgencia === "vencido" ? "var(--ds-color-red-200)" : "var(--ds-color-yellow)"} />
                {plan.nombre} — {equipo?.nombre}
              </span>
              <Pill tone={urgencia === "vencido" ? "red" : "yellow"}>{urgencia === "vencido" ? "Vencido" : "Próximo"}</Pill>
            </Link>
          ))}
          {repuestosBajoStock.map((r) => (
            <Link
              key={r.id}
              href="/mantenimiento/repuestos"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--ds-space-3)", borderRadius: "var(--ds-radius-md)", background: "var(--ds-color-gray-100)", textDecoration: "none", color: "inherit" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)" }}>
                <Icon name="sin-stock" size="sm" color="var(--ds-color-red-200)" />
                {r.nombre} — stock {r.stockActual}/{r.stockMinimo}
              </span>
              <Pill tone="red">Bajo mínimo</Pill>
            </Link>
          ))}
          {alertasActivas === 0 && <div style={{ color: "var(--ds-color-gray-400)" }}>Sin alertas por ahora.</div>}
        </div>
      </div>
    </div>
  );
}
