"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AppShell } from "@/components/compras/shell";
import { Badge, Button, Tile } from "@/components/compras/ui";
import { NuevaSolicitudSheet } from "@/components/compras/nueva-solicitud-sheet";
import { SolicitudProgreso } from "@/components/compras/solicitud-progreso";
import { UsuarioChip } from "@/components/compras/usuario-chip";
import { HoverCard } from "@/components/compras/hover-card";
import { DataTable } from "@/components/compras/data-table";
import { useStore } from "@/lib/compras/store";
import { useSession } from "@/hooks/useSession";
import { destinoCodigo, devolucionInfo, esConsumoInmediato, formatDate, formatDiaMes, pedidoBadge, pedidoNumeroCorto, pedidoProgreso, tipoSolicitudBadge, type DevolucionInfo, pedidoEsDelUsuario, veTodoEnCompras } from "@/lib/compras/helpers";
import type { Pedido } from "@/lib/compras/types";

type Filtro = "todas" | "material" | "repuesto" | "subcontrato" | "completado";

export default function IngenieriaPage() {
  const { pedidos: pedidosAll, ordenes, movimientos } = useStore();
  const me = useSession();
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [nuevoOpen, setNuevoOpen] = useState(false);

  // Cada usuario ve SOLO sus solicitudes (id estable = username; calza por nombre
  // para históricos). Mientras la sesión carga (me === null) no muestra nada.
  // EXCEPCIÓN: el Super Admin ve las de TODOS (pedido de David, 21/08/2026) — antes
  // también quedaba encerrado en las suyas y no podía revisar el trabajo de nadie.
  const veTodo = veTodoEnCompras(me);
  const pedidos = useMemo(() => {
    if (!me) return [];
    if (veTodo) return pedidosAll;
    return pedidosAll.filter((p) => pedidoEsDelUsuario(p, me));
  }, [pedidosAll, me, veTodo]);
  const listaRef = useRef<HTMLDivElement>(null);

  function seleccionar(f: Filtro) { setFiltro(f); setTimeout(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }

  const fuente = pedidos;         // mis solicitudes
  const ordenesFinal = ordenes;

  // Repuesto: la MÁQUINA si es consumo directo; si va a inventario (tag ALM) no hay
  // máquina y el destino es el ALMACÉN de sus líneas (ver destinoCodigo/destinoLabel).
  const destCodigo = (p: Pedido) => destinoCodigo(p);
  const destNombre = (p: Pedido) => (p.tipoSolicitud === "repuesto" ? (p.maquinaNombre ?? "") : (p.obraNombre ?? ""));

  // "Completada" = terminó todo el flujo (los 5 pasos con ✓, recibida y facturada).
  const esCompletada = (p: Pedido) => pedidoProgreso(p, ordenesFinal).completado;
  const material = fuente.filter((p) => p.tipoSolicitud === "material").length;
  const repuesto = fuente.filter((p) => p.tipoSolicitud === "repuesto").length;
  const subcontratos = fuente.filter((p) => p.tipoSolicitud === "subcontrato").length;
  const completadas = fuente.filter(esCompletada).length;

  // KPIs (tiles) filtran la tabla; los filtros por columna se apilan encima.
  const base = useMemo(() => fuente.filter((p) =>
    filtro === "material" ? p.tipoSolicitud === "material"
      : filtro === "repuesto" ? p.tipoSolicitud === "repuesto"
      : filtro === "subcontrato" ? p.tipoSolicitud === "subcontrato"
      : filtro === "completado" ? esCompletada(p) : true
  ), [fuente, filtro, ordenesFinal]); // eslint-disable-line react-hooks/exhaustive-deps
  const dataFinal = base;
  // Quién/desde dónde se devolvió una solicitud (para el detalle del stepper), de la bitácora.
  const devolPara = (p: Pedido): DevolucionInfo | undefined =>
    p.estado !== "devuelto" ? undefined : devolucionInfo(p, movimientos);

  const columns = useMemo<ColumnDef<Pedido, any>[]>(() => [
    // Pedido: en la UI solo los últimos dígitos (0025); el nº completo va en el tooltip.
    { id: "num", header: "Pedido", accessorFn: (p) => p.numero, meta: { label: "Pedido" }, cell: (c) => { const p = c.row.original; return <span className="ds-strong" style={{ whiteSpace: "nowrap" }} title={`Solicitud ${p.numero}`}>{pedidoNumeroCorto(p.numero)}</span>; } },
    // Destino: código de obra/máquina; el tipo y el nombre completo van en el tooltip.
    { id: "destino", header: "Destino", accessorFn: (p) => `${destCodigo(p)} ${destNombre(p)}${esConsumoInmediato(p) ? " consumo inmediato" : ""}`.trim(), meta: { label: "Destino" }, cell: (c) => { const p = c.row.original; const ci = esConsumoInmediato(p); const tip = `${tipoSolicitudBadge(p.tipoSolicitud).label} · ${destCodigo(p)}${destNombre(p) ? ` — ${destNombre(p)}` : ""}${ci ? " · consumo inmediato" : p.tipoSolicitud === "material" ? " · al Almacén General" : ""}`; return <span className="row gap-2" style={{ alignItems: "center", whiteSpace: "nowrap" }} title={tip}><span className="ds-strong ds-body-sm">{destCodigo(p)}</span>{ci && <Badge tone="green">CI</Badge>}</span>; } },
    // Fecha: "8 Agosto"; el detalle dd/mm/aaaa va en el tooltip.
    { id: "fecha", header: "Fecha", accessorFn: (p) => p.fecha, meta: { label: "Fecha", date: true }, cell: (c) => { const p = c.row.original; return <span className="ds-body-sm" style={{ whiteSpace: "nowrap" }} title={formatDate(p.fecha)}>{formatDiaMes(p.fecha)}</span>; } },
    // Estado: barrita de progreso (5 pasos). El filtro sigue por el estado del pedido.
    { id: "estado", header: "Estado", accessorFn: (p) => pedidoBadge(p.estado).label, meta: { label: "Estado" }, cell: (c) => <SolicitudProgreso prog={pedidoProgreso(c.row.original, ordenesFinal)} devolucion={devolPara(c.row.original)} /> },
    // Comentario: truncado; al pasar el mouse se despliega hacia abajo con el texto completo.
    { id: "comentario", header: "Comentario", accessorFn: (p) => p.notas ?? "", meta: { label: "Comentario" }, cell: (c) => { const txt = c.getValue() as string; if (!txt) return <span className="ds-body-sm ds-muted">—</span>; return <HoverCard placement="bottom" align="start" variant="panel" maxWidth={340} skipIfFits content={<span className="hc-comentario">{txt}</span>}><span className="ds-body-sm ds-muted ds-truncate" data-fit style={{ maxWidth: 240, display: "inline-block", verticalAlign: "middle" }}>{txt}</span></HoverCard>; } },
    // Usuario: iniciales que se expanden a nombre completo en la misma línea (sin tooltip).
    { id: "usuario", header: "Usuario", accessorFn: (p) => p.solicitante, meta: { label: "Usuario" }, cell: (c) => <UsuarioChip nombre={c.row.original.solicitante} /> },
    { id: "prioridad", header: "Prioridad", accessorFn: (p) => p.prioridad, meta: { label: "Prioridad" }, cell: (c) => { const p = c.row.original; return p.prioridad === "urgente" ? <Badge tone="red">Urgente</Badge> : p.prioridad === "alta" ? <Badge tone="yellow">Alta</Badge> : <Badge tone="gray">Normal</Badge>; } },
  ], [ordenesFinal, movimientos]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell role="ingenieria">
      <main className="page page--wide">
        <div className="page__head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div className="page__title" style={{ flex: 1, minWidth: 0 }}>
            <h1 className="ds-heading">{veTodo ? "Solicitudes de material" : "Mis solicitudes de material"}</h1>
            <p className="ds-muted">{veTodo
              ? "Todas las solicitudes de todos los usuarios. Material para una obra, repuestos para una máquina o un subcontrato."
              : "Pedí material para una obra o repuestos para una máquina — o contratá un subcontrato. Proveeduría se encarga del proveedor (el subcontrato va directo a aprobación)."}</p>
          </div>
          <div style={{ flexShrink: 0 }}><Button onClick={() => setNuevoOpen(true)}>+ Nueva solicitud</Button></div>
        </div>

        <div className="tiles mt-2">
          <Tile value={fuente.length} label="Total" onClick={() => seleccionar("todas")} active={filtro === "todas"} />
          <Tile value={material} label="De material (obra)" accent="var(--ds-color-green-100)" onClick={() => seleccionar("material")} active={filtro === "material"} />
          <Tile value={repuesto} label="De repuesto (máquina)" accent="var(--ds-color-yellow)" onClick={() => seleccionar("repuesto")} active={filtro === "repuesto"} />
          <Tile value={subcontratos} label="Subcontratos" accent="var(--ds-color-gray-500)" onClick={() => seleccionar("subcontrato")} active={filtro === "subcontrato"} />
          <Tile value={completadas} label="Completadas" accent="var(--ds-color-green-200)" onClick={() => seleccionar("completado")} active={filtro === "completado"} />
        </div>

        <div ref={listaRef} className="mt-6" style={{ scrollMarginTop: 80 }}>
          <DataTable data={dataFinal} columns={columns} tablaKey="solicitudes-ing" buscarPlaceholder="Buscar por N.º, material u obra…" getRowId={(p) => p.id} onRowClick={(p) => router.push(`/compras/ingenieria/${p.id}`)} rowClassName={(p) => (p.estado === "borrador" ? "row-borrador" : "")} vacio={fuente.length === 0 ? "Aún no hay solicitudes. Creá la primera." : "Ninguna solicitud coincide."} />
        </div>
      </main>
      <NuevaSolicitudSheet open={nuevoOpen} setOpen={setNuevoOpen} />
    </AppShell>
  );
}
