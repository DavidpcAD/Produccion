"use client";

// EL AVISO DE UN FRENO DE REGISTRO — lo que se ve cuando el servidor se negó a postear
// en Business Central porque algo no cuadra (ver lib/compras/frenar-registro.ts).
//
// Va en un aviso que se QUEDA en pantalla y no en un toast: es un "no" que hay que leer
// entero —qué línea, qué precio, a quién avisar— y un toast de 3 segundos se lo comía.
// Se cierra con "Entendido" o al volver a intentar.
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ds/Icon/Icon";
import { Button } from "@/components/compras/ui";

export type TipoFrenoBc = "proveedor" | "no-lanzado" | "lineas" | "precio";
export type FrenoBc = { tipo: TipoFrenoBc; error: string; problemas: string[] };

/** El freno que trae una respuesta 409 de recibir / registrar / facturar-recibido, o
 *  `null` si la respuesta no es de un freno (otro error: sigue su camino de siempre). */
export function frenoDeRespuesta(d: unknown): FrenoBc | null {
  const r = (d ?? {}) as Record<string, unknown>;
  if (!r.frenoEncabezado && !r.frenoLineas && !r.frenoPrecio) return null;
  return {
    tipo: r.frenoPrecio ? "precio" : r.frenoNoLanzado ? "no-lanzado" : r.frenoProveedor ? "proveedor" : "lineas",
    error: String(r.error ?? ""),
    problemas: Array.isArray(r.problemas) ? r.problemas.map(String) : [],
  };
}

function titulo(tipo: TipoFrenoBc, pedido: string): string {
  if (tipo === "proveedor") return `El pedido ${pedido} en Business Central es de OTRO proveedor`;
  if (tipo === "no-lanzado") return `El pedido ${pedido} todavía no está lanzado en Business Central`;
  if (tipo === "precio") return `En Business Central el pedido ${pedido} no tiene los montos de la orden`;
  return `Business Central no tiene estas líneas en el pedido ${pedido}`;
}

function queHacer(tipo: TipoFrenoBc): string {
  // Los dos del encabezado van debajo del "qué pasó" del servidor: acá solo el qué hacer.
  if (tipo === "proveedor") {
    return "Eso después solo se deshace con una nota de crédito. Avisale a Proveeduría para que revise el pedido "
      + "en BC antes de reintentar.";
  }
  if (tipo === "no-lanzado") {
    return "No es un error tuyo y no hace falta reintentar a ciegas: avisale a Aprobación para que lance el pedido, "
      + "y volvé a intentar cuando esté Lanzado.";
  }
  if (tipo === "precio") {
    return "Al registrar, la app le manda a BC el artículo y la cantidad: el precio y el IVA los pone la línea del "
      + "pedido en BC. Si no son los de la orden, la factura de compra queda por un monto que acá nadie dijo, y eso "
      + "después solo se arregla con una nota de crédito. Corregilo en Business Central —o la orden acá, con "
      + "Proveeduría— y volvé a intentar.";
  }
  return "Si se registrara igual, BC saltaría esas líneas sin avisar: la app diría “recibido” y el material nunca "
    + "entraría al inventario ni a la factura de compra. Corregí el pedido en BC (o la orden con Proveeduría) y "
    + "volvé a intentar.";
}

export function AvisoFrenoBc({ freno, pedido, onCerrar, className }: {
  freno: FrenoBc;
  pedido: string;
  onCerrar: () => void;
  className?: string;
}) {
  // El botón que dispara el registro suele quedar abajo de todo (o en un modal):
  // el aviso se trae a la vista para que nadie crea que no pasó nada.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [freno]);

  const conLista = (freno.tipo === "lineas" || freno.tipo === "precio") && freno.problemas.length > 0;
  return (
    <div ref={ref} className={`oc-aviso oc-aviso--rojo ${className ?? ""}`} role="alert">
      <span className="oc-aviso__ic"><Icon name="alert" size="sm" color="currentColor" /></span>
      <span className="oc-aviso__txt">
        <span className="oc-aviso__tit">{titulo(freno.tipo, pedido)}</span>
        {conLista ? (
          <ul style={{ margin: "2px 0 4px", paddingLeft: 18, listStyle: "disc", display: "flex", flexDirection: "column", gap: 4 }}>
            {freno.problemas.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        ) : (
          // Solo lo que pasó (el primer párrafo): qué hacer lo dice el texto de abajo,
          // escrito para quien está frente a la pantalla. Mostrar los dos lo repetía.
          <span style={{ whiteSpace: "pre-line" }}>{freno.error.split("\n\n")[0]}</span>
        )}
        <span>{queHacer(freno.tipo)} <span className="ds-strong">Nada se guardó.</span></span>
        <span style={{ marginTop: 6 }}>
          <Button variant="outline" size="sm" onClick={onCerrar}>Entendido</Button>
        </span>
      </span>
    </div>
  );
}
