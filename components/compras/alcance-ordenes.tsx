"use client";

import type { AlcanceRecepcion } from "@/lib/compras/helpers";

// Selector de QUÉ órdenes se listan en recepción. Nace del pedido de la Fábrica de
// Maderas el 01/09/2026: ni "solo las de mis solicitudes" ni "solo las de mi bodega"
// les servían —"me llegan facturas que tengo que registrar que no me salen"—, así que
// ven TODAS y acotan cuando quieren. "De mi fábrica" solo se ofrece a los roles
// satélite, que son los únicos con bodegas propias.
export function AlcanceOrdenes({
  valor,
  onChange,
  conFabrica,
}: {
  valor: AlcanceRecepcion;
  onChange: (a: AlcanceRecepcion) => void;
  conFabrica: boolean;
}) {
  const opciones: { v: AlcanceRecepcion; label: string }[] = [
    { v: "todas", label: "Todas" },
    ...(conFabrica ? [{ v: "fabrica" as const, label: "De mi fábrica" }] : []),
    { v: "mias", label: "De mis solicitudes" },
  ];
  return (
    <div className="segmented" role="tablist" aria-label="Qué órdenes ver">
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          role="tab"
          aria-selected={valor === o.v}
          className={`segmented__btn ${valor === o.v ? "is-active" : ""}`}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
