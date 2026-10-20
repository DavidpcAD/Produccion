import { getDb, sql } from "@/lib/db";
import { bcItemLedgerSinLiquidar, bcAlmacenes, bcItems } from "@/lib/compras/bc";

// ─── SNAPSHOT DE INVENTARIO POR ALMACÉN ─────────────────────────────────────────
// Baja de BC los movimientos de inventario SIN LIQUIDAR (Item Ledger Entry abiertas,
// Remaining Quantity ≠ 0), les pega la CATEGORÍA del artículo (ItemCategoryCode, que
// no vive en la entrada sino en el Item → se cruza con bcItems) y la marca de almacén
// VIRTUAL (Location."GJW Tipo Almacen" → bcAlmacenes), y reemplaza el contenido de
// dbo.InventarioAlmacen. Lo consume la app de Reportes por SQL. Ver la migración
// migrations/2026-10-20_inventario_almacen.sql y la nota del flujo en lib/compras/bc.ts.

export type ResultadoSnapshot = { ok: boolean; filas: number; ms: number };

export async function refrescarInventarioAlmacen(): Promise<ResultadoSnapshot> {
  const t0 = Date.now();

  // 1) Fuentes de BC en paralelo: movimientos abiertos + clasificación de almacenes
  //    + catálogo (para la categoría). bcAlmacenes y bcItems ya se cachean 5 min.
  const [ile, almacenes, items] = await Promise.all([
    bcItemLedgerSinLiquidar(),
    bcAlmacenes(),
    bcItems(),
  ]);

  const tipoPorAlmacen = new Map<string, string>();
  for (const a of almacenes) tipoPorAlmacen.set(a.codigo, a.tipoAlmacen ?? "");
  const catPorItem = new Map<string, string>();
  for (const it of items) if (it.categoria) catPorItem.set(it.code, it.categoria);

  const filas = ile.map((e) => {
    const tipo = tipoPorAlmacen.get(e.locationCode) ?? "";
    return {
      entryNo: e.entryNo,
      itemNo: e.itemNo,
      descripcion: e.descripcion || null,
      categoria: catPorItem.get(e.itemNo) ?? null,
      obra: e.obra || null,
      jobTaskNo: e.jobTaskNo || null,
      almacen: e.locationCode || null,
      // "Virtual" = tiene material apartado en el almacén de PROYECTO sin liquidar
      // (gomJobWarehouseQuantity > 0), NO la clasificación de la ubicación.
      esVirtual: (e.cantidadProyecto ?? 0) > 0,
      tipoAlmacen: tipo || null,
      variante: e.variante || null,
      unidad: e.unidad || null,
      cantidad: Number.isFinite(e.cantidad) ? e.cantidad : 0,
      cantidadProyecto: Number.isFinite(e.cantidadProyecto) ? e.cantidadProyecto : 0,
      costoActual: Number.isFinite(e.costoActual) ? e.costoActual : null,
      tipoMovimiento: e.tipoMovimiento || null,
      documentoNo: e.documentoNo || null,
      procedenciaNo: e.procedenciaNo || null,
      proveedor: e.proveedor || null,
      idBoletaEntrega: e.idBoletaEntrega || null,
      fechaMovimiento: e.fechaMovimiento ? new Date(e.fechaMovimiento) : null,
    };
  });

  // 2) Reemplazo atómico del snapshot: TRUNCATE + bulk insert en una transacción,
  //    para que Reportes nunca lea una foto a medio llenar.
  const pool = await getDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).batch("TRUNCATE TABLE dbo.InventarioAlmacen");

    if (filas.length) {
      const tabla = new sql.Table("dbo.InventarioAlmacen");
      tabla.create = false;
      tabla.columns.add("entryNo", sql.Int, { nullable: false });
      tabla.columns.add("itemNo", sql.NVarChar(20), { nullable: false });
      tabla.columns.add("descripcion", sql.NVarChar(150), { nullable: true });
      tabla.columns.add("categoria", sql.NVarChar(20), { nullable: true });
      tabla.columns.add("obra", sql.NVarChar(20), { nullable: true });
      tabla.columns.add("jobTaskNo", sql.NVarChar(250), { nullable: true });
      tabla.columns.add("almacen", sql.NVarChar(20), { nullable: true });
      tabla.columns.add("esVirtual", sql.Bit, { nullable: false });
      tabla.columns.add("tipoAlmacen", sql.NVarChar(20), { nullable: true });
      tabla.columns.add("variante", sql.NVarChar(20), { nullable: true });
      tabla.columns.add("unidad", sql.NVarChar(20), { nullable: true });
      tabla.columns.add("cantidad", sql.Decimal(18, 4), { nullable: false });
      tabla.columns.add("cantidadProyecto", sql.Decimal(18, 4), { nullable: true });
      tabla.columns.add("costoActual", sql.Decimal(18, 4), { nullable: true });
      tabla.columns.add("tipoMovimiento", sql.NVarChar(40), { nullable: true });
      tabla.columns.add("documentoNo", sql.NVarChar(40), { nullable: true });
      tabla.columns.add("procedenciaNo", sql.NVarChar(40), { nullable: true });
      tabla.columns.add("proveedor", sql.NVarChar(120), { nullable: true });
      tabla.columns.add("idBoletaEntrega", sql.NVarChar(30), { nullable: true });
      tabla.columns.add("fechaMovimiento", sql.Date, { nullable: true });
      tabla.columns.add("actualizado", sql.DateTime2, { nullable: false });

      const ahora = new Date();
      for (const f of filas) {
        tabla.rows.add(
          f.entryNo, f.itemNo, f.descripcion, f.categoria, f.obra, f.jobTaskNo,
          f.almacen, f.esVirtual, f.tipoAlmacen, f.variante, f.unidad, f.cantidad,
          f.cantidadProyecto, f.costoActual, f.tipoMovimiento, f.documentoNo, f.procedenciaNo,
          f.proveedor, f.idBoletaEntrega, f.fechaMovimiento, ahora,
        );
      }
      await new sql.Request(tx).bulk(tabla);
    }

    const ms = Date.now() - t0;
    await new sql.Request(tx)
      .input("filas", sql.Int, filas.length)
      .input("ms", sql.Int, ms)
      .query(
        "UPDATE dbo.InventarioAlmacenSync SET ultimaCorrida = SYSUTCDATETIME(), " +
        "filas = @filas, ok = 1, ms = @ms, mensaje = NULL WHERE id = 1",
      );

    await tx.commit();
    return { ok: true, filas: filas.length, ms: ms };
  } catch (e: unknown) {
    try { await tx.rollback(); } catch { /* ignorar: el error real es `e` */ }
    // Dejar registrada la frescura del fallo fuera de la transacción abortada.
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await (await getDb()).request()
        .input("m", sql.NVarChar(400), msg.slice(0, 400))
        .query("UPDATE dbo.InventarioAlmacenSync SET ultimaCorrida = SYSUTCDATETIME(), ok = 0, mensaje = @m WHERE id = 1");
    } catch { /* ignorar */ }
    throw e;
  }
}
