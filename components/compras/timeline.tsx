"use client";

import { useEffect, useMemo } from "react";
import { useStore } from "@/lib/compras/store";
import { formatDateTime, numeroOrden, ROL_LABEL } from "@/lib/compras/helpers";
import type { Movimiento } from "@/lib/compras/types";

// Códigos de estado -> nombre legible (pedidos y órdenes).
const ESTADO_LABEL: Record<string, string> = {
  borrador: "Borrador",
  aprobado: "Aprobado",
  en_orden: "En orden",
  cerrado: "Cerrado",
  abierto: "Abierto",
  pendiente_aprobacion: "Pendiente de aprobación",
  lanzado: "Lanzado",
  parcial: "Parcial",
  completado: "Completado",
  anulado: "Anulado",
};
const estadoLabel = (c?: string) => (c ? (ESTADO_LABEL[c] ?? c) : undefined);

const LABEL: Record<string, string> = {
  creado: "Creado",
  reabierto: "Reabierto",
  rechazado: "Rechazado",
  editado: "Editado",
  aprobado: "Aprobado",
  en_orden: "Pasó a orden de compra",
  cerrado: "Cerrado",
  enviado_aprobacion: "Enviado a aprobación",
  aprobado_lanzado: "Aprobado y lanzado",
  completado: "Completado",
  recepcion_parcial: "Recepción parcial",
  recepcion_total: "Recepción total",
  eliminado: "Eliminado",
  // Intento de lanzar a BC que falló: el motivo va en `detalle`.
  lanzamiento_fallido: "No se pudo lanzar a BC",
  // Avisos de BC anotados sin mover la orden (el detalle dice qué pasó).
  aviso_bc: "Aviso de Business Central",
  // Se le quitó la obra en BC a una línea que va a inventario, para que el centro de
  // costo lo ponga el almacén y no la obra.
  obra_quitada: "Obra quitada en BC (material a almacén)",
  // La app le preguntó a BC y el estado de la orden se corrigió para seguir al del
  // pedido allá (lanzado que no estaba lanzado, o pendiente que ya liberaron).
  sincronizado_bc: "Estado corregido según Business Central",
  // Los escribe la app de Proveeduría (misma bitácora) al cotejar la orden contra BC.
  bc_creado: "Pedido creado en Business Central",
  bc_renumerado: "N.º de Business Central corregido",
  bc_desalineado: "⚠ La orden y Business Central NO coinciden",
  bc_alineado: "La orden y Business Central coinciden",
};

// Etiqueta contextual: el mismo tipo de movimiento se lee distinto según
// la etapa (pedido vs. orden vs. recepción), para que la traza completa
// se entienda de un vistazo.
function etiqueta(m: Movimiento): string {
  if (m.entidad === "orden") {
    if (m.tipoMovimiento === "creado") return "En proveeduría · orden de compra creada";
    if (m.tipoMovimiento === "enviado_aprobacion") return "Orden enviada a aprobación";
    if (m.tipoMovimiento === "aprobado_lanzado") return "Orden aprobada y lanzada";
    if (m.tipoMovimiento === "rechazado") return "Orden rechazada por Aprobación";
    if (m.tipoMovimiento === "recepcion_parcial") return "Recibido en bodega (parcial)";
    if (m.tipoMovimiento === "recepcion_total") return "Recibido en bodega (total)";
  }
  // El "cerrado" de un PEDIDO es el archivado de Proveeduría: lo que faltaba por
  // ordenar ya no se compra. El detalle del movimiento trae las líneas y el motivo.
  if (m.entidad === "pedido" && m.tipoMovimiento === "cerrado") return "Solicitud archivada · el resto ya no se compra";
  if (m.entidad === "recepcion" && m.tipoMovimiento === "creado") return "Factura registrada";
  return LABEL[m.tipoMovimiento] ?? m.tipoMovimiento;
}

// Color del punto por etapa, para que cada evento se distinga de un vistazo.
function colorPunto(m: Movimiento): string {
  if (m.entidad === "orden") {
    switch (m.tipoMovimiento) {
      case "creado": return "var(--ds-color-gray-400)";   // En proveeduría · neutral (gris)
      case "enviado_aprobacion": return "var(--ds-color-yellow)"; // pendiente · amarillo
      case "aprobado_lanzado": return "var(--ds-color-green-200)"; // lanzada · verde
      case "recepcion_parcial": return "var(--ds-color-yellow)"; // recibido parcial · amarillo
      case "recepcion_total":
      case "completado": return "var(--ds-color-green-200)"; // recibido total / completado · verde fuerte
      case "rechazado": return "var(--ds-color-red-200)";    // rechazada · rojo
      case "lanzamiento_fallido": return "var(--ds-color-red-100)"; // no se pudo lanzar · rojo
      case "eliminado": return "var(--ds-color-red-100)";
      case "sincronizado_bc": return "var(--ds-color-yellow)";   // BC dijo otra cosa · amarillo
      case "bc_desalineado": return "var(--ds-color-red-200)";   // BC no tiene lo mismo · rojo
      case "bc_alineado": return "var(--ds-color-green-200)";    // verificado y coincide
      case "bc_renumerado": return "var(--ds-color-yellow)";
    }
  }
  // Pedido (ingeniería)
  switch (m.tipoMovimiento) {
    case "creado": return "var(--ds-color-gray-300)";     // creado · gris
    case "aprobado": return "var(--ds-color-green-100)";  // aprobado · verde lima
    case "cerrado": return "var(--ds-color-gray-400)";    // archivada · gris apagado (ni bien ni mal)
    case "reabierto": return "var(--ds-color-gray-400)";
    case "eliminado":
    case "rechazado": return "var(--ds-color-red-100)";
  }
  return "var(--ds-color-gray-300)";
}

export function Timeline({
  entidad,
  idEntidad,
  traza = false,
}: {
  entidad: Movimiento["entidad"];
  idEntidad: string;
  // Si es true y la entidad es un pedido, suma los movimientos de la(s)
  // orden(es) en las que entró el pedido (proveeduría → aprobación → bodega),
  // para mostrar el historial completo hasta que se factura.
  traza?: boolean;
}) {
  const { movimientos, pedidos, ordenes, cargarMovimientos } = useStore();

  // Los documentos cuya bitácora hay que tener para armar esta línea de tiempo: el
  // propio y, con `traza`, las órdenes en las que entró el pedido.
  const refs = useMemo(() => {
    const r = [{ entidad, id: idEntidad }];
    if (traza && entidad === "pedido") {
      const pedido = pedidos.find((p) => p.id === idEntidad);
      const lineasPedido = new Set(pedido?.lineas.map((l) => l.id) ?? []);
      for (const o of ordenes) {
        if (o.lineas.some((l) => l.pedidoLineaId && lineasPedido.has(l.pedidoLineaId))) r.push({ entidad: "orden", id: o.id });
      }
    }
    return r;
  }, [entidad, idEntidad, traza, pedidos, ordenes]);
  // La carga inicial de compras solo trae el resumen de bitácora que usan las listas;
  // el historial completo se pide acá, que es la única pantalla que lo muestra.
  const clave = refs.map((r) => `${r.entidad}:${r.id}`).join(",");
  useEffect(() => { void cargarMovimientos(refs); }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mapa idOrden -> rótulo de la orden, para mostrar de qué orden viene cada evento.
  // Es el N.º de BC si ya está allá y "Interno NN" si no: el `numero` crudo
  // ("CP-000062") se lee igual que un pedido de BC y en BC no existe.
  const numeroDeOrden = useMemo(() => new Map(ordenes.map((o) => [o.id, numeroOrden(o)])), [ordenes]);

  const ordenados = useMemo(() => {
    const quiero = new Set(refs.map((r) => `${r.entidad}:${r.id}`));
    return movimientos
      .filter((m) => quiero.has(`${m.entidad}:${m.idEntidad}`))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [movimientos, refs]);

  if (ordenados.length === 0) {
    return <div className="ds-muted ds-label">Sin movimientos registrados todavía.</div>;
  }

  return (
    <div className="timeline">
      {ordenados.map((m) => {
        const ctxOrden = m.entidad === "orden" ? numeroDeOrden.get(m.idEntidad) : undefined;
        return (
          <div key={m.id} className="timeline__item">
            <span className="timeline__dot" style={{ background: colorPunto(m) }} />
            <div className="timeline__title">
              {etiqueta(m)}
              {ctxOrden && <span className="ds-muted" style={{ fontWeight: 400 }}> · {ctxOrden}</span>}
              {(() => {
                const ant = estadoLabel(m.estadoAnterior);
                const nue = estadoLabel(m.estadoNuevo);
                if (ant && nue && m.estadoAnterior !== m.estadoNuevo)
                  return <span className="ds-muted" style={{ fontWeight: 400 }}> · {ant} → {nue}</span>;
                if (nue)
                  return <span className="ds-muted" style={{ fontWeight: 400 }}> · {nue}</span>;
                return null;
              })()}
            </div>
            <div className="timeline__meta">
              {/* La sincronización no la hace una persona: la dispara la pantalla que
                  alguien tenía abierta. Se dice así, para no atribuirle el cambio. */}
              {m.tipoMovimiento === "sincronizado_bc"
                ? <>Sincronización con Business Central (desde la pantalla de {m.usuario}) · {formatDateTime(m.fecha)}</>
                : <>{m.usuario} · {ROL_LABEL[m.rol]} · {formatDateTime(m.fecha)}</>}
              {m.detalle ? ` · ${m.detalle}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
