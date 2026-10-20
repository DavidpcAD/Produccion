"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/mantenimiento/store";
import { Table, Pill, marcarFilaParaVolver, type ColumnaTabla } from "@/components/mantenimiento/local/Table";
import { FilterChips } from "@/components/mantenimiento/local/FilterChips";
import { EstadoCarga } from "@/components/mantenimiento/local/EstadoCarga";
import { Button } from "@/components/mantenimiento/ds/Button/Button";
import { SearchBar } from "@/components/mantenimiento/ds/SearchBar/SearchBar";
import { ESTADOS_OT, TIPOS_OT } from "@/lib/mantenimiento/mockData";
import type { Equipo, EstadoOt, OrdenTrabajo, PrioridadOt, TipoOt } from "@/lib/mantenimiento/types";
import type { TonoPill } from "@/lib/mantenimiento/planUtils";

const ESTADO_LABEL: Record<EstadoOt, string> = { abierta: "Abierta", en_proceso: "En proceso", finalizada: "Finalizada", cancelada: "Cancelada" };
const ESTADO_TONO: Record<EstadoOt, TonoPill> = { abierta: "yellow", en_proceso: "black", finalizada: "green", cancelada: "red" };
const TIPO_LABEL: Record<TipoOt, string> = { preventivo: "Preventivo", correctivo: "Correctivo", predictivo: "Predictivo" };
const PRIORIDAD_TONO: Record<PrioridadOt, TonoPill> = { baja: "gray", media: "yellow", alta: "red", urgente: "red" };

interface FilaOt extends OrdenTrabajo {
  equipo?: Equipo;
}

export default function OrdenesPage() {
  const { ots, equipos, cargando, errorCarga } = useAppStore();
  const router = useRouter();

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const filas = useMemo<FilaOt[]>(() => {
    return ots
      .map((o) => ({ ...o, equipo: equipos.find((e) => e.id === o.equipoId) }))
      .filter((o) => {
        const coincideTexto = `${o.numero} ${o.titulo} ${o.equipo?.nombre ?? ""}`.toLowerCase().includes(busqueda.toLowerCase());
        const coincideEstado = filtroEstado === "todas" || o.estado === filtroEstado;
        const coincideTipo = filtroTipo === "todos" || o.tipo === filtroTipo;
        return coincideTexto && coincideEstado && coincideTipo;
      })
      .sort((a, b) => new Date(b.fechaApertura).getTime() - new Date(a.fechaApertura).getTime());
  }, [ots, equipos, busqueda, filtroEstado, filtroTipo]);

  function verDetalle(o: FilaOt) {
    marcarFilaParaVolver("ordenes", o.id);
    router.push(`/mantenimiento/ordenes/${o.id}`);
  }

  const columnas: ColumnaTabla<FilaOt>[] = [
    { key: "numero", header: "Número", movil: "titulo" },
    { key: "equipo", header: "Equipo", sortValue: (o) => o.equipo?.nombre ?? "", render: (o) => o.equipo?.nombre ?? "—" },
    { key: "tipo", header: "Tipo", render: (o) => <Pill tone={o.tipo === "correctivo" ? "red" : o.tipo === "preventivo" ? "green" : "gray"}>{TIPO_LABEL[o.tipo]}</Pill> },
    { key: "titulo", header: "Título", movil: "titulo" },
    { key: "prioridad", header: "Prioridad", render: (o) => <Pill tone={PRIORIDAD_TONO[o.prioridad]}>{o.prioridad}</Pill> },
    { key: "estado", header: "Estado", render: (o) => <Pill tone={ESTADO_TONO[o.estado]}>{ESTADO_LABEL[o.estado]}</Pill> },
    { key: "fechaApertura", header: "Apertura", render: (o) => new Date(o.fechaApertura).toLocaleDateString("es-CR") },
    { key: "responsable", header: "Responsable" }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--ds-space-3)" }}>
        <h1 style={{ fontSize: "var(--ds-font-size-heading)", margin: 0 }}>Órdenes de trabajo</h1>
        <Button label="Nueva OT" color="green" layout="icon-left" icon="plus" onClick={() => router.push("/mantenimiento/ordenes/nueva")} />
      </div>

      <EstadoCarga cargando={cargando} error={errorCarga} />

      <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-4)", flexWrap: "wrap" }}>
        <div style={{ width: 300 }}>
          <SearchBar layout="label" placeholder="Buscar por número, título o equipo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onClose={busqueda ? () => setBusqueda("") : undefined} />
        </div>
        <FilterChips
          value={filtroEstado}
          onChange={setFiltroEstado}
          options={[{ value: "todas", label: "Todas" }, ...ESTADOS_OT.map((e) => ({ value: e, label: ESTADO_LABEL[e] }))]}
        />
        <FilterChips
          value={filtroTipo}
          onChange={setFiltroTipo}
          options={[{ value: "todos", label: "Todos los tipos" }, ...TIPOS_OT.map((t) => ({ value: t, label: TIPO_LABEL[t] }))]}
        />
      </div>

      <Table tablaKey="ordenes" columns={columnas} rows={filas} getRowKey={(o) => o.id} onRowClick={verDetalle} emptyMessage="No hay órdenes de trabajo que coincidan con el filtro." />
    </div>
  );
}
