import { NextRequest, NextResponse } from "next/server";
import { jsonComprimido } from "@/lib/http/json-comprimido";
import { mensajeParaCliente } from "@/lib/errores";
import { bcExistencias, bcItemFichas } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/compras/bc/inventario?items=M01-0001,M02-0003
//
// Cuánto hay HOY en Business Central de cada artículo, para mirarlo antes de aprobar
// una compra ("¿esto ya lo tenemos?"). Es una sola llamada del navegador aunque la
// orden traiga diez materiales: `/existencias` responde de a UN artículo y la
// bandeja de aprobación tendría que pedir diez veces desde la tableta.
//
// Trae también el TIPO del artículo porque en BC un SERVICIO devuelve filas de
// existencias igual que un material (S24-0021 "SUBCONTRATO ELECTRICO" trae 23), así
// que del stock solo no se puede deducir que no mueva inventario — ver el mismo
// cuidado en el modal de facturación.
//
// `total: null` = BC no contestó por ese artículo. No es cero: cero es un dato y se
// muestra; "no se sabe" se muestra como "s/d".

/** Tope de artículos por llamada: son N consultas a BC, una por artículo. Ninguna
 *  orden de compra real pasa de unas pocas decenas de líneas. */
const MAX_ITEMS = 40;
/** Cuántas consultas a BC a la vez. El mismo límite que usa Inventarios. */
const CONCURRENCIA = 6;

type Fila = { almacen: string; variante: string; cantidad: number; unidad: string };
/** `conocido` = BC devolvió la ficha del artículo. Sin ella un código que no existe
 *  allá da cero existencias, que leído como "no hay" es mentira: no hay artículo. */
type Ficha = { tipo: string; base: string; conocido: boolean; total: number | null; almacenes: Fila[] };

export async function GET(req: NextRequest) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  const crudos = (new URL(req.url).searchParams.get("items") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const items = [...new Set(crudos)].slice(0, MAX_ITEMS);
  if (!items.length) {
    return NextResponse.json({ error: "Se requiere items." }, { status: 400 });
  }

  try {
    // La ficha de todos de una (la API estándar sí acepta varios por llamada) y el
    // stock de cada uno en paralelo, con el mismo tope que Inventarios.
    const fichas = await bcItemFichas(items);
    const salida: Record<string, Ficha> = {};
    let i = 0;
    const worker = async () => {
      while (i < items.length) {
        const it = items[i++];
        const f = fichas.get(it);
        const base: Ficha = { tipo: f?.tipo ?? "inventario", base: f?.base ?? "", conocido: !!f, total: null, almacenes: [] };
        try {
          const filas = await bcExistencias({ itemNo: it });
          base.total = filas.reduce((s, e) => s + (Number(e.cantidad) || 0), 0);
          base.almacenes = filas
            .filter((e) => (Number(e.cantidad) || 0) !== 0)
            .map((e) => ({ almacen: e.locationCode, variante: e.variantCode, cantidad: Number(e.cantidad) || 0, unidad: e.unidad }))
            .sort((a, b) => b.cantidad - a.cantidad);
        } catch { /* ese artículo queda en "no se sabe"; los demás sí se responden */ }
        salida[it] = base;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, items.length) }, worker));
    return jsonComprimido(req, { items: salida });
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
