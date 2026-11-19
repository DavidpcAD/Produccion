// Cuándo la ficha deja borrar un producto de BC (y cuándo solo bloquearlo).
//   node --experimental-strip-types --test lib/bc/productos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { puedeBorrarProducto } from "./productos.ts";

test("puedeBorrarProducto: el de prueba, sin movimientos ni pedidos, se puede borrar", () => {
  assert.deepEqual(puedeBorrarProducto({ movimiento: null, pedidos: [] }), { puede: true, motivo: null });
});

test("puedeBorrarProducto: con movimientos en BC no, y dice cuál fue el primero", () => {
  const r = puedeBorrarProducto({ movimiento: { documento: "CR-011859", fecha: "2026-10-23", tipo: "Purchase" }, pedidos: [] });
  assert.equal(r.puede, false);
  assert.match(r.motivo ?? "", /desde el 23\/10\/2026 \(documento CR-011859\)/);
  assert.match(r.motivo ?? "", /se bloquea/);
});

test("puedeBorrarProducto: un pedido de la app que lo usa también frena el borrado", () => {
  const uno = puedeBorrarProducto({ movimiento: null, pedidos: [812] });
  assert.equal(uno.puede, false);
  assert.match(uno.motivo ?? "", /usa el pedido #812 de la app/);
  const varios = puedeBorrarProducto({ movimiento: null, pedidos: [1, 2, 3, 4] });
  assert.match(varios.motivo ?? "", /#1, #2, #3 y otros/);
});

test("puedeBorrarProducto: si no se pudo revisar, no se deja borrar", () => {
  const r = puedeBorrarProducto(null);
  assert.equal(r.puede, false);
  assert.match(r.motivo ?? "", /No se pudo revisar/);
});
