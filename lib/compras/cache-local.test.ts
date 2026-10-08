import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheValido, type CacheLocal } from "./cache-local.ts";

const H12 = 12 * 60 * 60 * 1000;
const entrada = (usuario: string, creado: number): CacheLocal => ({
  usuario,
  etag: 'W/"x"',
  creado,
  data: { pedidos: [], ordenes: [], recepciones: [], movimientos: [] },
});

test("cacheValido: sirve para el mismo usuario dentro de las 12 h", () => {
  const e = entrada("ana", 1_000_000);
  assert.equal(cacheValido(e, "ana", 1_000_000 + H12 - 1), true);
});

test("cacheValido: vencida pasadas las 12 h", () => {
  const e = entrada("ana", 1_000_000);
  assert.equal(cacheValido(e, "ana", 1_000_000 + H12), false);
  assert.equal(cacheValido(e, "ana", 1_000_000 + H12 + 1), false);
});

test("cacheValido: la de uno NUNCA se le pinta a otro", () => {
  const e = entrada("ana", 1_000_000);
  assert.equal(cacheValido(e, "beto", 1_000_000), false);
});

test("cacheValido: null o sin usuario = no sirve", () => {
  assert.equal(cacheValido(null, "ana", 1_000_000), false);
  assert.equal(cacheValido(entrada("ana", 1_000_000), "", 1_000_000), false);
});
