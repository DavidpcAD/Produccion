import { NextResponse } from "next/server";
import { getSession, type JWTPayload } from "@/lib/auth";
import { autorDePedido, autoresDeOrden } from "./repo";
import { alcanceDeModulos, pedidoEsDelUsuario, type AlcanceCompras } from "./helpers";
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

export type { AlcanceCompras };

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
  /** Hasta dónde llega dentro del módulo. Sale de los módulos, NUNCA del body. */
  alcance: AlcanceCompras;
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
 * contra BC).
 *
 * `exigeTodo: true` para lo que NO es de quien solo pide material: crear y mover
 * órdenes, recibir, facturar, la matriz y las clasificaciones. Esas rutas no
 * tienen pantalla en el menú de Bodega, pero el proxy sí las dejaba pasar —
 * `modulosDeRuta` devuelve ['ingenieria','bodega','recepcion'] para TODA
 * /api/compras.
 *
 * Compatibilidad: un usuario SIN rol de Producción (modules undefined) cae al
 * nivel, exactamente igual que en proxy.ts, para no dejar afuera a nadie que
 * hoy entra por rol legacy.
 */
export async function guardCompras(
  opts?: { soloAdmin?: boolean; exigeTodo?: boolean },
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

  const alcance = alcanceDeModulos(session.modules);

  if (opts?.exigeTodo && alcance !== "todo") {
    return NextResponse.json(
      { error: "Tu rol solo trabaja con sus propias solicitudes." },
      { status: 403 },
    );
  }

  return {
    session,
    usuario: session.nombre,
    usuarioId: session.username ?? session.nombre,
    rol: rolDeModulos(session.modules, session.nivelAdmin),
    esAdmin,
    alcance,
  };
}

/** La sesión tal como la leen los helpers de `lib/compras/helpers.ts`, para que el
 *  servidor recorte EXACTAMENTE con el mismo criterio con que la pantalla filtra. */
export function sesionDeActor(g: ActorCompras) {
  return {
    username: g.session.username,
    nombre: g.session.nombre,
    modules: g.session.modules,
    roleNames: g.session.roleNames,
    nivelAdmin: g.session.nivelAdmin,
  };
}

/**
 * Corta el paso si el pedido no es de quien llama. Devuelve la respuesta a
 * retornar, o `null` si puede seguir.
 *
 * Hasta ahora `/api/compras/pedidos/[id]` pedía sesión y nada más: con el id en la
 * URL —y son correlativos— cualquiera con acceso a Compras podía leer, editar,
 * cambiar de estado o borrar la solicitud de otro. Quien ve todo el módulo sigue
 * igual (Proveeduría tiene que poder devolver y archivar lo ajeno; es su oficio).
 */
export async function exigirPedidoPropio(
  g: ActorCompras,
  idPedido: number,
): Promise<NextResponse | null> {
  if (g.alcance === "todo") return null;
  if (!Number.isInteger(idPedido) || idPedido <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  const autor = await autorDePedido(idPedido);
  // No existe: 404 y no 403, que es lo que ya devolvían estas rutas. Da lo mismo
  // para el que busca ids ajenos —no llega a ver nada— y no cambia el
  // comportamiento de las pantallas ante un pedido borrado.
  if (!autor) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  if (pedidoEsDelUsuario(autor, sesionDeActor(g))) return null;
  return NextResponse.json({ error: "Esa solicitud no es tuya." }, { status: 403 });
}

/** Discrimina el resultado de `guardCompras`: `true` = hay que devolverlo ya. */
export function esRechazo(g: ActorCompras | NextResponse): g is NextResponse {
  return g instanceof NextResponse;
}

/**
 * Corta el paso si la orden no salió de un pedido de quien llama.
 *
 * Es el mismo caso que `exigirPedidoPropio` una vuelta más allá: quien solo pide
 * material ve en su pantalla el avance de sus solicitudes, y ese avance sale de
 * las órdenes en las que entraron. Las demás —y una compra directa, que no nace
 * de ningún pedido— no son suyas.
 */
export async function exigirOrdenPropia(
  g: ActorCompras,
  idOrden: number,
): Promise<NextResponse | null> {
  if (g.alcance === "todo") return null;
  if (!Number.isInteger(idOrden) || idOrden <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  const autores = await autoresDeOrden(idOrden);
  const me = sesionDeActor(g);
  if (autores.some((a) => pedidoEsDelUsuario(a, me))) return null;
  return NextResponse.json({ error: "Esa orden no es de tus solicitudes." }, { status: 403 });
}
