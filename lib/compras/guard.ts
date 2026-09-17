import { NextResponse } from "next/server";
import { getSession, type JWTPayload } from "@/lib/auth";
import type { Role } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Puerta de entrada de las rutas de /api/compras.
//
// Por qué existe: hasta 2026-09-14 la autorización de este módulo vivía SOLO en
// proxy.ts, y las rutas confiaban en dos cosas que el cliente controla:
//   1) que el proxy ya lo había filtrado — pero `modulosDeRuta` devuelve
//      ['ingenieria','bodega','recepcion'] para TODA /api/compras, así que la
//      API de aprobación quedaba abierta a Bodega y Recepción aunque la PANTALLA
//      de aprobación fuera solo de Super Admin ("el scope real lo hace la
//      pantalla" — y una pantalla no es una frontera de seguridad);
//   2) el `usuario` y el `rol` que venían en el body, que el navegador guarda en
//      localStorage. Con eso cualquiera creaba y aprobaba a nombre de otro, y la
//      bitácora registraba lo que el cliente dijera.
//
// Acá se resuelven las dos: la sesión se verifica en la ruta (no solo en el
// proxy) y la identidad sale del token, nunca del body.
// ─────────────────────────────────────────────────────────────────────────────

/** Módulos que abren Órdenes de Compra (los mismos de `modulosDeRuta`). */
const MODULOS_COMPRAS = ["admin", "ingenieria", "bodega", "recepcion"] as const;

export type ActorCompras = {
  session: JWTPayload;
  /** Nombre legible para la bitácora. Sale de la sesión, NUNCA del body. */
  usuario: string;
  /** Id estable del actor (username) para atribuir autoría. */
  usuarioId: string;
  /** Etapa de Compras del actor, derivada de sus módulos. NUNCA del body. */
  rol: Role;
  /** ¿Es Aprobación (Super Admin)? */
  esAdmin: boolean;
};

/** Etapa que le corresponde al usuario según los módulos de su rol.
 *  Bodega pide material igual que Ingeniería (ver el comentario de `Modulo` en
 *  lib/permissions.ts), así que comparte etapa con ella. */
function rolDeModulos(modules: string[] | undefined, nivelAdmin: number): Role {
  if (!modules) return nivelAdmin >= 4 ? "aprobacion" : "ingenieria";
  if (modules.includes("admin")) return "aprobacion";
  if (modules.includes("ingenieria")) return "ingenieria";
  if (modules.includes("recepcion")) return "facturacion";
  return "ingenieria";
}

/**
 * Verifica la sesión y devuelve el actor, o la respuesta de error que la ruta
 * debe retornar tal cual.
 *
 * `soloAdmin: true` para las acciones de Aprobación (lanzar/relanzar/release
 * contra BC). El resto de las rutas solo exigen sesión con algún módulo de
 * Compras — es defensa en profundidad, no un recorte de lo que ya podían hacer.
 *
 * Compatibilidad: un usuario SIN rol de Producción (modules undefined) cae al
 * nivel, exactamente igual que en proxy.ts, para no dejar afuera a nadie que
 * hoy entra por rol legacy.
 */
export async function guardCompras(
  opts?: { soloAdmin?: boolean },
): Promise<ActorCompras | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sesión vencida. Volvé a entrar." }, { status: 401 });
  }

  const esAdmin = session.modules
    ? session.modules.includes("admin")
    : session.nivelAdmin >= 4;

  const abreCompras = session.modules
    ? MODULOS_COMPRAS.some((m) => session.modules!.includes(m))
    : session.nivelAdmin >= 4;

  if (!abreCompras) {
    return NextResponse.json({ error: "No tenés acceso a Órdenes de Compra." }, { status: 403 });
  }

  if (opts?.soloAdmin && !esAdmin) {
    return NextResponse.json(
      { error: "Solo Aprobación puede lanzar una orden a Business Central." },
      { status: 403 },
    );
  }

  return {
    session,
    usuario: session.nombre,
    usuarioId: session.username ?? session.nombre,
    rol: rolDeModulos(session.modules, session.nivelAdmin),
    esAdmin,
  };
}

/** Discrimina el resultado de `guardCompras`: `true` = hay que devolverlo ya. */
export function esRechazo(g: ActorCompras | NextResponse): g is NextResponse {
  return g instanceof NextResponse;
}
