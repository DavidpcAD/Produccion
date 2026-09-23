import { esLineaRecibible, pedidoEsDelUsuario, pedidoOrdenadoPct, pedidoTieneDevolucion, veTodoEnCompras } from "./helpers";
import { monedaDe } from "./kpis";
import type { Orden, Pedido } from "./types";
import type { Sesion } from "./helpers";

// LO QUE ESTÁ EN LA CANCHA.
//
// El resto del Resumen contesta "cómo vamos"; esto contesta "qué tengo que hacer hoy",
// que es la pregunta que alguien se hace de verdad varias veces al día. Son las paradas
// donde el trabajo se queda quieto esperando a ALGUIEN, y cada una dice a quién.
//
// Portado de proveeduria.adelante.cr (`lib/compras-cancha.ts`), pero la lista NO es la
// misma: allá la pantalla es de Angie y las cinco paradas son suyas. Acá esta pantalla
// la abre Ingeniería (y el Super Admin) desde "Órdenes de Compra", así que las paradas
// están ordenadas por de quién es la pelota:
//
//   · Borradores sin enviar ......... espera al ingeniero (vos)
//   · Devueltas para corregir ....... espera al ingeniero (vos)
//   · Solicitudes sin orden ......... espera a Proveeduría
//   · Órdenes por aprobar ........... espera a Aprobación
//   · Órdenes rechazadas ............ espera a Proveeduría
//
// Dos paradas del original quedaron fuera porque su dato NO existe en esta base:
// "aprobadas sin mandarle al proveedor" necesita la marca de envío del PDF
// (`envioProveedor`) y "esperando la corrección del ingeniero" necesita el estado de
// espera de una orden; acá una devolución mueve el PEDIDO, no la orden, y eso ya es la
// segunda fila.

export type ItemCancha = {
  clave: string;
  etiqueta: string;
  detalle: string;
  cuenta: number;
  monto: number | null;       // null cuando contar plata no significa nada
  color: string;
  href: string;               // a dónde lleva la fila
  /** De quién es la pelota. Lo que no es tuyo va marcado: sin eso se lee como una
   *  tarea propia y alguien se queda mirándola. */
  deQuien: "vos" | "proveeduria" | "aprobacion";
};

const importe = (o: Orden) => o.lineas
  .filter(esLineaRecibible)
  .reduce((s, l) => s + l.cantidad * l.precioUnitario * (1 - (l.descuentoPct ?? 0) / 100), 0);

export function loQueEstaEnTuCancha(ordenes: Orden[], pedidos: Pedido[], moneda: string, me: Sesion): ItemCancha[] {
  const dela = ordenes.filter((o) => monedaDe(o) === moneda);
  const suma = (lista: Orden[]) => lista.reduce((s, o) => s + importe(o), 0);

  // Las dos primeras filas son TAREAS DE QUIEN MIRA, así que cuentan lo mismo que ve
  // en su bandeja: sus solicitudes, salvo que sea Super Admin, que ve las de todos
  // (mismo criterio que "Mis solicitudes" y que el badge de Devoluciones).
  const veTodo = veTodoEnCompras(me);
  const mias = (p: Pedido) => veTodo || pedidoEsDelUsuario(p, me);

  const borradores = pedidos.filter((p) => p.estado === "borrador" && mias(p));
  const devueltas = pedidos.filter((p) => pedidoTieneDevolucion(p) && mias(p));
  // Enviadas a Proveeduría y todavía sin comprar. `cerrado` = archivada: ya no se compra.
  const sinOrden = pedidos.filter(
    (p) => p.estado !== "borrador" && p.estado !== "devuelto" && p.estado !== "cerrado" && pedidoOrdenadoPct(p) === 0,
  );
  const porAprobar = dela.filter((o) => o.estado === "pendiente_aprobacion");
  const rechazadas = dela.filter((o) => o.estado === "rechazado");

  const items: ItemCancha[] = [
    {
      clave: "borrador", etiqueta: "Solicitudes en borrador sin enviar",
      detalle: "Las armaste y Proveeduría todavía no las ve",
      cuenta: borradores.length, monto: null, color: "var(--ds-color-gray-300)",
      href: "/compras/ingenieria", deQuien: "vos",
    },
    {
      clave: "devuelto", etiqueta: "Devueltas para corregir",
      detalle: "Proveeduría te las regresó: corregilas y reenvialas",
      cuenta: devueltas.length, monto: null, color: "var(--ds-color-red-200)",
      href: "/compras/ingenieria/devoluciones", deQuien: "vos",
    },
    {
      clave: "sin-orden", etiqueta: "Solicitudes sin orden de compra",
      detalle: "Ya se enviaron y nadie las ha comprado",
      cuenta: sinOrden.length, monto: null, color: "var(--ds-color-gray-300)",
      href: "/compras/ingenieria/seguimiento", deQuien: "proveeduria",
    },
    {
      clave: "pendiente_aprobacion", etiqueta: "Órdenes esperando aprobación",
      detalle: "Proveeduría ya las armó; falta que las aprueben y se lancen a BC",
      cuenta: porAprobar.length, monto: suma(porAprobar), color: "var(--ds-color-yellow)",
      href: "/compras/ingenieria/seguimiento", deQuien: "aprobacion",
    },
    {
      clave: "rechazado", etiqueta: "Órdenes rechazadas",
      detalle: "Aprobación las devolvió: Proveeduría tiene que corregirlas y reenviarlas",
      cuenta: rechazadas.length, monto: suma(rechazadas), color: "var(--ds-color-red-200)",
      href: "/compras/ingenieria/seguimiento", deQuien: "proveeduria",
    },
  ];

  // Lo que está en cero no se dibuja: una lista de pendientes con filas vacías obliga a
  // leerla entera para descubrir que no hay nada. Si no queda ninguna, el panel lo dice.
  return items.filter((i) => i.cuenta > 0);
}

/** Cómo se rotula la pelota ajena en la fila. */
export const DE_QUIEN_LABEL: Record<ItemCancha["deQuien"], string | null> = {
  vos: null,
  proveeduria: "es de Proveeduría",
  aprobacion: "es de Aprobación",
};
