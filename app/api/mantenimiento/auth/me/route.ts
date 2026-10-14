import { NextResponse } from "next/server";
import { obtenerUsuarioActual } from "@/lib/mantenimiento/auth";

// El store del módulo pide /api/auth/me (→ /api/mantenimiento/auth/me) para saber
// quién está logueado. Lo resolvemos desde la sesión de Produccion (ver el puente
// en lib/mantenimiento/auth.ts). Sin sesión válida de Mantenimiento → usuario null
// (el store lo interpreta como "no hay sesión").
export async function GET() {
  const usuario = await obtenerUsuarioActual();
  return NextResponse.json({ usuario });
}
