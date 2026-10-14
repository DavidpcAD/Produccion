import { NextResponse } from "next/server";
import { requerirUsuario } from "@/lib/mantenimiento/auth";

// "Solicitudes de materiales" (las órdenes de compra de la app de Steven) queda
// FUERA del módulo a propósito: eso lo cubre Órdenes de Compra de Produccion, que
// el rol Mantenimiento también tiene. El store del módulo igual pide esta
// colección al cargar, así que se devuelve vacía para no romper la carga.
export async function GET() {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;
  return NextResponse.json({ docs: [] });
}
