// LOS FRENOS DE REGISTRO: lo que se revisa contra Business Central antes de postear.
//
// Lo que cuidan estas pruebas es el equilibrio: que cada freno agarre lo que tiene que
// agarrar (otro proveedor, un pedido sin lanzar, una línea que BC no tiene, un precio,
// un IVA o una unidad distintos) y que NO frene por lo que no sabe. Un freno que salta
// de gusto termina apagado desde Azure, que es como se pierden los frenos de verdad.
//
// Todos los datos son inventados.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cotejoEncabezado, diferenciasAlPostear, frenoEncabezado409, frenoLineas409, frenoPrecio409,
  ivaBcDeLinea, lineasNoPosteables, lineasOrdenParaCotejo, tipoDeLineaOrden, tipoLineaBc, tituloDeDiferencias,
  type BcLineasPedido, type LineaApp, type LineaBc,
} from "./freno-registro.ts";
import type { OrdenLinea } from "./types.ts";

const PEDIDO = "CP-000001";
const plata = (n: number) => `₡${n.toFixed(2)}`;

const app = (p: Partial<LineaApp> & { itemNo: string }): LineaApp => ({
  tipo: "articulo", descripcion: p.itemNo, cantidad: 1, precioUnitario: 0, unidad: "UND", ...p,
});
const bc = (p: Partial<LineaBc> & { itemNo: string }): LineaBc => ({
  documentNo: PEDIDO, lineNo: 10000, tipo: "articulo", variantCode: "",
  descripcion: p.itemNo, unidad: "UND", almacen: "ALM-X",
  cantidad: 1, recibida: 0, facturada: 0, pendiente: 1, precioUnitario: 0, ...p,
});
const pedido = (lineas: LineaBc[], fuente: BcLineasPedido["fuente"] = "custom"): BcLineasPedido => ({ lineas, fuente });

// ─── 1. ENCABEZADO ──────────────────────────────────────────────────────────────

test("encabezado: mismo proveedor y lanzado → se sigue", () => {
  const r = cotejoEncabezado(PEDIDO, { estado: "lanzado", vendorNo: "PROV-000001" }, "prov-000001");
  assert.equal(r.ok, true);
  assert.equal(r.verificado, true);
  assert.equal(frenoEncabezado409("registrar", r), null);
});

test("encabezado: otro proveedor en BC → frena, y antes que el lanzamiento", () => {
  const r = cotejoEncabezado(PEDIDO, { estado: "abierto", vendorNo: "PROV-000002" }, "PROV-000001");
  assert.equal(r.ok, false);
  assert.equal(r.problema, "proveedor");
  const f = frenoEncabezado409("registrar", r)!;
  assert.equal(f.frenoEncabezado, true);
  assert.equal(f.frenoProveedor, true);
  assert.equal(f.frenoNoLanzado, undefined);
  assert.match(f.error, /^NO se registró: el pedido CP-000001 en Business Central es del proveedor PROV-000002, pero esta orden es de PROV-000001/);
});

test("encabezado: pedido ABIERTO o PENDIENTE en BC → frena por no lanzado", () => {
  for (const [estado, texto] of [["abierto", "ABIERTO"], ["pendiente_aprobacion", "PENDIENTE DE APROBACIÓN"]] as const) {
    const r = cotejoEncabezado(PEDIDO, { estado, vendorNo: "PROV-000001" }, "PROV-000001");
    assert.equal(r.problema, "no-lanzado");
    const f = frenoEncabezado409("recibir", r)!;
    assert.equal(f.frenoNoLanzado, true);
    assert.match(f.error, new RegExp(`^NO se recibió: el pedido CP-000001 está ${texto} en Business Central`));
    assert.match(f.error, /pedile a Aprobación que lance el pedido/);
  }
});

test("encabezado: lo que no se sabe no frena", () => {
  // BC no contestó.
  assert.equal(cotejoEncabezado(PEDIDO, null, "PROV-000001").ok, true);
  assert.equal(cotejoEncabezado(PEDIDO, null, "PROV-000001").verificado, false);
  // El estado no se pudo leer y el proveedor coincide.
  assert.equal(cotejoEncabezado(PEDIDO, { estado: "desconocido", vendorNo: "PROV-000001" }, "PROV-000001").ok, true);
  // Sin orden (cliente viejo sin ordenId): no hay proveedor esperado, pero el
  // lanzamiento sí se revisa.
  assert.equal(cotejoEncabezado(PEDIDO, { estado: "lanzado", vendorNo: "PROV-000009" }, "").ok, true);
  assert.equal(cotejoEncabezado(PEDIDO, { estado: "abierto", vendorNo: "PROV-000009" }, "").problema, "no-lanzado");
});

// ─── 2. LÍNEAS ──────────────────────────────────────────────────────────────────

test("líneas: todo calza y hay saldo → sin problemas", () => {
  const p = lineasNoPosteables(PEDIDO, pedido([bc({ itemNo: "M00-0001", cantidad: 10, pendiente: 10 })]),
    [{ itemNo: "M00-0001", qty: 4 }], "recibir");
  assert.deepEqual(p, []);
  assert.equal(frenoLineas409("registrar", PEDIDO, p), null);
});

test("líneas: un artículo que BC no tiene se dice, no se salta en silencio", () => {
  const p = lineasNoPosteables(PEDIDO, pedido([bc({ itemNo: "M00-0001" })]),
    [{ itemNo: "M00-0002", qty: 1 }], "recibir");
  assert.equal(p.length, 1);
  assert.match(p[0], /^M00-0002: el pedido CP-000001 de Business Central NO tiene ninguna línea de artículo con ese N.º/);
  const f = frenoLineas409("registrar", PEDIDO, p)!;
  assert.equal(f.frenoLineas, true);
  assert.match(f.error, /^NO se registró: Business Central no puede recibir 1 de las líneas de esta factura/);
  assert.match(f.error, /La orden queda por recibir\.$/);
});

test("líneas: el código con la variante pegada se compara pelado", () => {
  const p = lineasNoPosteables(PEDIDO, pedido([bc({ itemNo: "M00-0001", pendiente: 5 })]),
    [{ itemNo: "M00-0001 NEGRO", qty: 2 }], "recibir");
  assert.deepEqual(p, []);
});

test("líneas: más de lo pendiente en BC → frena con el saldo en la mano", () => {
  const p = lineasNoPosteables(PEDIDO, pedido([bc({ itemNo: "M00-0001", cantidad: 10, pendiente: 3 })]),
    [{ itemNo: "M00-0001", qty: 5 }], "recibir");
  assert.equal(p.length, 1);
  assert.match(p[0], /se quieren registrar 5 y en BC solo hay 3 pendiente de recibir/);
});

test("líneas: dos líneas del mismo material no usan dos veces el mismo saldo", () => {
  const p = lineasNoPosteables(PEDIDO, pedido([bc({ itemNo: "M00-0001", pendiente: 4 })]),
    [{ itemNo: "M00-0001", qty: 3 }, { itemNo: "M00-0001", qty: 3 }], "recibir");
  assert.equal(p.length, 1);
  assert.match(p[0], /solo hay 1 pendiente/);
});

test("líneas: al facturar lo recibido el saldo es lo recibido SIN facturar", () => {
  const l = bc({ itemNo: "M00-0001", cantidad: 10, recibida: 6, facturada: 4, pendiente: 4 });
  assert.deepEqual(lineasNoPosteables(PEDIDO, pedido([l]), [{ itemNo: "M00-0001", qty: 2 }], "facturar-recibido"), []);
  const p = lineasNoPosteables(PEDIDO, pedido([l]), [{ itemNo: "M00-0001", qty: 3 }], "facturar-recibido");
  assert.match(p[0], /solo hay 2 recibido sin facturar/);
  assert.match(frenoLineas409("facturar", PEDIDO, p)!.error, /^NO se facturó: Business Central no puede facturar 1 línea\(s\)/);
});

test("líneas: el activo fijo se busca entre los activos fijos, no entre los artículos", () => {
  const enBc = pedido([bc({ itemNo: "AF-0001", tipo: "activo_fijo" })]);
  assert.deepEqual(lineasNoPosteables(PEDIDO, enBc, [{ itemNo: "AF-0001", qty: 1, tipo: "activo_fijo" }], "recibir"), []);
  // Mandado como artículo (que es como el codeunit lo buscaría sin tipo) no calza.
  const p = lineasNoPosteables(PEDIDO, enBc, [{ itemNo: "AF-0001", qty: 1 }], "recibir");
  assert.match(p[0], /ninguna línea de artículo con ese N.º/);
});

test("líneas: la variante se exige solo si BC la devolvió", () => {
  const conVar = [bc({ itemNo: "M00-0001", variantCode: "ROJO", pendiente: 5 })];
  const p = lineasNoPosteables(PEDIDO, pedido(conVar), [{ itemNo: "M00-0001", qty: 1, variantCode: "AZUL" }], "recibir");
  assert.match(p[0], /variante "AZUL" y en BC la\(s\) línea\(s\) de ese artículo tienen ROJO/);
  // La API estándar no trae variante: no se acusa por eso.
  const std = [bc({ itemNo: "M00-0001", pendiente: 5 })];
  assert.deepEqual(lineasNoPosteables(PEDIDO, pedido(std, "estandar"), [{ itemNo: "M00-0001", qty: 1, variantCode: "AZUL" }], "recibir"), []);
});

test("líneas: los cargos y las líneas en cero no se revisan", () => {
  const enBc = pedido([bc({ itemNo: "M00-0001", pendiente: 1 }), bc({ itemNo: "FLETE", tipo: "cargo", pendiente: 0 })]);
  assert.deepEqual(lineasNoPosteables(PEDIDO, enBc, [{ itemNo: "M00-0001", qty: 1 }, { itemNo: "M00-0009", qty: 0 }], "recibir"), []);
});

// ─── 3. PRECIO ──────────────────────────────────────────────────────────────────

test("precio: si los dos lados dicen lo mismo, no hay nada que frenar", () => {
  const difs = diferenciasAlPostear(
    [app({ itemNo: "M00-0001", cantidad: 6, precioUnitario: 500, ivaPct: 13 })],
    [bc({ itemNo: "M00-0001", cantidad: 6, precioUnitario: 500, ivaPct: 13 })],
    [{ itemNo: "M00-0001", qty: 6 }], plata,
  );
  assert.deepEqual(difs, []);
  assert.equal(frenoPrecio409("registrar", PEDIDO, difs, plata), null);
});

test("precio: BC recalculó el costo de la línea → frena con la plata de más", () => {
  // El caso que trajo esto: la orden dice un precio y la línea del pedido en BC
  // quedó con otro (p. ej. el último costo directo, al cambiarle el almacén).
  const difs = diferenciasAlPostear(
    [app({ itemNo: "M00-0001", descripcion: "MATERIAL A", cantidad: 10, precioUnitario: 1000, ivaPct: 13 })],
    [bc({ itemNo: "M00-0001", descripcion: "MATERIAL A", cantidad: 10, precioUnitario: 1100, ivaPct: 13 })],
    [{ itemNo: "M00-0001", qty: 4 }], plata,
  );
  assert.equal(difs.length, 1);
  assert.equal(difs[0].clase, "precio");
  // Sobre lo que entra AHORA: 4 × (1.100 − 1.000) = 400 de más.
  assert.equal(difs[0].importe, 400);
  assert.match(difs[0].texto, /la orden lo compra a ₡1000\.00 y en BC la línea está a ₡1100\.00/);
  assert.match(difs[0].texto, /₡400\.00 de más/);
  const f = frenoPrecio409("registrar", PEDIDO, difs, plata)!;
  assert.equal(f.frenoPrecio, true);
  assert.equal(f.importeEnJuego, 400);
  assert.match(f.error, /^NO se registró: el precio que tiene Business Central no es el de la orden en 1 línea\(s\)/);
  assert.match(f.error, /BC factura con lo que tenga la línea del pedido CP-000001/);
});

test("precio: el IVA distinto es su propia diferencia, con el monto de IVA", () => {
  const difs = diferenciasAlPostear(
    [app({ itemNo: "M00-0001", cantidad: 10, precioUnitario: 100, ivaPct: 1 })],
    [bc({ itemNo: "M00-0001", cantidad: 10, precioUnitario: 100, ivaPct: 13 })],
    [{ itemNo: "M00-0001", qty: 10 }], plata,
  );
  assert.equal(difs.length, 1);
  assert.equal(difs[0].clase, "iva");
  // 10 × 100 × 12% = 120 de IVA de más.
  assert.ok(Math.abs(difs[0].importe - 120) < 1e-9, String(difs[0].importe));
  assert.match(difs[0].texto, /1% de IVA y en BC la línea calcula 13%/);
  assert.equal(tituloDeDiferencias(difs), "el IVA que Business Central le calcula a las líneas no es el de la orden");
});

test("precio: la unidad va primero; con otra unidad el precio no se compara", () => {
  const difs = diferenciasAlPostear(
    [app({ itemNo: "M00-0001", unidad: "CAJA", cantidad: 1, precioUnitario: 5000 })],
    [bc({ itemNo: "M00-0001", unidad: "UND", cantidad: 1, precioUnitario: 50 })],
    [{ itemNo: "M00-0001", qty: 1 }], plata,
  );
  assert.equal(difs.length, 1);
  assert.equal(difs[0].clase, "unidad");
  assert.match(difs[0].texto, /la orden compra en CAJA y en BC la línea quedó en UND/);
  assert.equal(tituloDeDiferencias(difs), "Business Central tiene las líneas en otra unidad que la orden");
});

test("precio: lo que BC no dice no se acusa (sin IVA leído, sin unidad)", () => {
  const difs = diferenciasAlPostear(
    [app({ itemNo: "M00-0001", unidad: "UND", precioUnitario: 100, ivaPct: 13 })],
    [bc({ itemNo: "M00-0001", unidad: "", precioUnitario: 100, ivaPct: undefined })],
    [{ itemNo: "M00-0001", qty: 1 }], plata,
  );
  assert.deepEqual(difs, []);
});

test("precio: una línea que no entra en este registro no frena", () => {
  const difs = diferenciasAlPostear(
    [app({ itemNo: "M00-0001", precioUnitario: 100 }), app({ itemNo: "M00-0002", precioUnitario: 100 })],
    [bc({ itemNo: "M00-0001", precioUnitario: 100 }), bc({ itemNo: "M00-0002", precioUnitario: 999 })],
    [{ itemNo: "M00-0001", qty: 1 }], plata,
  );
  assert.deepEqual(difs, []);
});

test("precio: una línea que BC no tiene es asunto del freno de líneas, no de éste", () => {
  const difs = diferenciasAlPostear(
    [app({ itemNo: "M00-0001", precioUnitario: 100 })], [],
    [{ itemNo: "M00-0001", qty: 1 }], plata,
  );
  assert.deepEqual(difs, []);
});

test("precio: medio céntimo no es una diferencia; un céntimo sí", () => {
  const con = (pb: number) => diferenciasAlPostear(
    [app({ itemNo: "M00-0001", precioUnitario: 100 })], [bc({ itemNo: "M00-0001", precioUnitario: pb })],
    [{ itemNo: "M00-0001", qty: 1 }], plata,
  );
  assert.deepEqual(con(100.004), []);
  assert.equal(con(100.01).length, 1);
});

test("precio: el mismo material repetido se compara por el precio promedio", () => {
  const difs = diferenciasAlPostear(
    [app({ itemNo: "M00-0001", cantidad: 2, precioUnitario: 100 }), app({ itemNo: "M00-0001", cantidad: 2, precioUnitario: 300 })],
    [bc({ itemNo: "M00-0001", cantidad: 4, precioUnitario: 200 })],
    [{ itemNo: "M00-0001", qty: 4 }], plata,
  );
  assert.deepEqual(difs, []);
});

test("precio: el CARGO no se compara (BC lo reescribe al repartirlo)", () => {
  const difs = diferenciasAlPostear(
    [app({ itemNo: "FLETE", tipo: "cargo", precioUnitario: 100 })],
    [bc({ itemNo: "FLETE", tipo: "cargo", precioUnitario: 7 })],
    [{ itemNo: "FLETE", qty: 1, tipo: "cargo" }], plata,
  );
  assert.deepEqual(difs, []);
});

test("precio: precio e IVA de la misma línea son dos diferencias, la más cara primero", () => {
  const difs = diferenciasAlPostear(
    [app({ itemNo: "M00-0001", cantidad: 10, precioUnitario: 100, ivaPct: 13 })],
    [bc({ itemNo: "M00-0001", cantidad: 10, precioUnitario: 200, ivaPct: 1 })],
    [{ itemNo: "M00-0001", qty: 10 }], plata,
  );
  assert.deepEqual(difs.map((d) => d.clase), ["precio", "iva"]);
  assert.equal(tituloDeDiferencias(difs), "lo que Business Central va a facturar no es lo que dice la orden");
});

// ─── PIEZAS ─────────────────────────────────────────────────────────────────────

test("tipoLineaBc entiende los tres caminos de lectura", () => {
  assert.equal(tipoLineaBc("Item"), "articulo");
  assert.equal(tipoLineaBc("Producto"), "articulo");
  assert.equal(tipoLineaBc("Fixed_x0020_Asset"), "activo_fijo");
  assert.equal(tipoLineaBc("Charge_x0020__x0028_Item_x0029_"), "cargo");
  assert.equal(tipoLineaBc("cualquier texto", 4), "activo_fijo");
  assert.equal(tipoLineaBc("G/L Account"), "otro");
});

test("ivaBcDeLinea: que no venga no es lo mismo que exento", () => {
  assert.equal(ivaBcDeLinea(undefined, null, ""), undefined);
  assert.equal(ivaBcDeLinea(0), 0);
  assert.equal(ivaBcDeLinea(undefined, "13"), 13);
});

test("la orden se compara con el tipo y el precio que la app le mandó a BC", () => {
  const base = { id: "1", descripcion: "X", cantidad: 2, unidad: "UND", almacen: "ALM-X", precioUnitario: 100, ivaPct: 13, cantidadRecibida: 0, cantidadFacturada: 0 };
  const lineas: OrdenLinea[] = [
    { ...base, tipo: "articulo", articuloId: "M00-0001 NEGRO", descuentoPct: 10 },
    { ...base, tipo: "articulo", articuloId: "AF-0001", esActivo: true },
    { ...base, tipo: "cargo", chargeNo: "FLETE" },
  ];
  const c = lineasOrdenParaCotejo(lineas);
  assert.deepEqual(c.map((l) => l.tipo), ["articulo", "activo_fijo", "cargo"]);
  assert.deepEqual(c.map((l) => l.itemNo), ["M00-0001 NEGRO", "AF-0001", "FLETE"]);
  // El descuento de línea no viaja a BC: el precio a comparar es el de la línea.
  assert.equal(c[0].precioUnitario, 100);
  assert.equal(tipoDeLineaOrden(lineas[1]), "activo_fijo");
});
