import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esEscritura,
  esFresca,
  ttlBootstrapMs,
  snapshotBootstrap,
  invalidarBootstrap,
  _resetBootstrapCache,
  type SnapshotBootstrap,
} from "./cache-bootstrap.ts";

type Listo = { cuerpo: string; etag: string; gzip: null };
const listo = (cuerpo: string): Listo => ({ cuerpo, etag: `W/"${cuerpo}"`, gzip: null });

/** Promesa que se resuelve a mano, para controlar el orden de una corrida. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => { resolver = r; });
  return { promesa, resolver };
}

// ── esEscritura: el detector ────────────────────────────────────────────────
test("esEscritura detecta INSERT/UPDATE/DELETE/MERGE sin importar mayúsculas", () => {
  assert.equal(esEscritura("INSERT dbo.OrdenCompra (x) VALUES (1)"), true);
  assert.equal(esEscritura("update dbo.PedidoCompra set estado=1"), true);
  assert.equal(esEscritura("  DELETE FROM dbo.Movimiento WHERE id=@id"), true);
  assert.equal(esEscritura("MERGE dbo.Estado AS t USING ..."), true);
});

test("esEscritura deja pasar los SELECT", () => {
  assert.equal(esEscritura("SELECT * FROM dbo.OrdenCompra WHERE esEliminada=0"), false);
  assert.equal(esEscritura("select idEstado, estado from dbo.Estado"), false);
});

test("esEscritura asume el falso positivo: un SELECT que menciona 'update' bota la foto", () => {
  // Documentado a propósito: botar de más cuesta una consulta; botar de menos
  // cuesta que alguien no vea lo que acaba de guardar.
  assert.equal(esEscritura("SELECT notaCreador FROM dbo.PedidoCompra WHERE notaCreador LIKE '%update%'"), true);
});

test("esEscritura soporta la forma tag-template (array de trozos)", () => {
  assert.equal(esEscritura(["DELETE FROM x WHERE id=", ""]), true);
  assert.equal(esEscritura(["SELECT 1"]), false);
  assert.equal(esEscritura(undefined), false);
});

// ── esFresca + ttl ──────────────────────────────────────────────────────────
test("esFresca respeta el TTL y el null", () => {
  const snap = { cuerpo: "a", etag: "e", gzip: null, creado: 1_000 } as SnapshotBootstrap;
  assert.equal(esFresca(snap, 1_500, 1_000), true);   // 500 ms < 1000
  assert.equal(esFresca(snap, 2_500, 1_000), false);  // 1500 ms > 1000
  assert.equal(esFresca(null, 1_500, 1_000), false);
  assert.equal(esFresca(snap, 1_001, 0), false);      // ttl 0 = apagado
});

test("ttlBootstrapMs: default, apagado y valor propio", () => {
  const antes = process.env.COMPRAS_BOOTSTRAP_TTL_MS;
  delete process.env.COMPRAS_BOOTSTRAP_TTL_MS;
  assert.equal(ttlBootstrapMs(), 8_000);
  process.env.COMPRAS_BOOTSTRAP_TTL_MS = "0";
  assert.equal(ttlBootstrapMs(), 0);
  process.env.COMPRAS_BOOTSTRAP_TTL_MS = "3000";
  assert.equal(ttlBootstrapMs(), 3_000);
  process.env.COMPRAS_BOOTSTRAP_TTL_MS = "abc"; // inválido → default
  assert.equal(ttlBootstrapMs(), 8_000);
  if (antes == null) delete process.env.COMPRAS_BOOTSTRAP_TTL_MS;
  else process.env.COMPRAS_BOOTSTRAP_TTL_MS = antes;
});

// ── snapshotBootstrap: coalescing + reúso + invalidación ─────────────────────
test("coalescing: dos pedidos a la vez comparten UNA corrida", async () => {
  _resetBootstrapCache();
  process.env.COMPRAS_BOOTSTRAP_TTL_MS = "8000";
  let corridas = 0;
  const d = diferida<void>();
  const construir = async () => { corridas++; await d.promesa; return listo("A"); };

  const p1 = snapshotBootstrap(construir);
  const p2 = snapshotBootstrap(construir);
  d.resolver();
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(corridas, 1, "construir corrió una sola vez");
  assert.equal(r1.cache, "miss");
  assert.equal(r2.cache, "vuelo");
  assert.equal(r1.snap.cuerpo, "A");
  assert.equal(r2.snap.cuerpo, "A");
});

test("reúso dentro del TTL: el segundo pedido es un hit, sin correr de nuevo", async () => {
  _resetBootstrapCache();
  process.env.COMPRAS_BOOTSTRAP_TTL_MS = "8000";
  let corridas = 0;
  const construir = async () => { corridas++; return listo("B"); };
  const r1 = await snapshotBootstrap(construir);
  const r2 = await snapshotBootstrap(construir);
  assert.equal(corridas, 1);
  assert.equal(r1.cache, "miss");
  assert.equal(r2.cache, "hit");
});

test("una escritura durante la corrida la envenena: su resultado NO se guarda", async () => {
  _resetBootstrapCache();
  process.env.COMPRAS_BOOTSTRAP_TTL_MS = "8000";
  let corridas = 0;
  const d = diferida<void>();
  const lenta = async () => { corridas++; await d.promesa; return listo("VIEJO"); };

  const p1 = snapshotBootstrap(lenta);   // arranca corrida 1
  invalidarBootstrap();                  // llega una escritura mientras corre
  d.resolver();
  await p1;                              // termina, pero con generación vieja

  // La próxima lectura NO debe ver "VIEJO": tiene que reconstruir.
  const r2 = await snapshotBootstrap(async () => { corridas++; return listo("NUEVO"); });
  assert.equal(r2.cache, "miss");
  assert.equal(r2.snap.cuerpo, "NUEVO");
  assert.equal(corridas, 2);
});

test("TTL=0 apaga todo: cada pedido corre de nuevo, sin compartir", async () => {
  _resetBootstrapCache();
  process.env.COMPRAS_BOOTSTRAP_TTL_MS = "0";
  let corridas = 0;
  const construir = async () => { corridas++; return listo("C"); };
  const r1 = await snapshotBootstrap(construir);
  const r2 = await snapshotBootstrap(construir);
  assert.equal(corridas, 2);
  assert.equal(r1.cache, "miss");
  assert.equal(r2.cache, "miss");
  delete process.env.COMPRAS_BOOTSTRAP_TTL_MS;
});
