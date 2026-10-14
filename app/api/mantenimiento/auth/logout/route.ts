import { NextResponse } from "next/server";

// En Produccion el logout real lo maneja la app (cookie de sesión de Produccion),
// no este módulo. Se deja el endpoint para no romper el store de Mantenimiento,
// que lo llama; acá es un no-op.
export async function POST() {
  return NextResponse.json({ ok: true });
}
