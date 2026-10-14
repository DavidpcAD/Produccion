"use client";

// NOT-IN-DS: aviso de carga/error para cuando la pantalla todavía no tiene
// datos de la base real, o el último refresco en segundo plano falló. Si ya
// hay datos en pantalla (de un refresco anterior que sí funcionó), un fallo
// de red no debe hacer desaparecer la tabla — por eso esto es un banner
// aparte y no un "return null" que tape el resto de la pantalla.

export function EstadoCarga({ cargando, error }: { cargando: boolean; error: string | null }) {
  if (cargando) {
    return <div style={{ color: "var(--ds-color-gray-400)", padding: "var(--ds-space-4) 0" }}>Cargando datos de la base...</div>;
  }
  if (error) {
    return (
      <div
        style={{
          background: "var(--ds-color-red-100)",
          color: "var(--ds-color-white)",
          borderRadius: "var(--ds-radius-md)",
          padding: "var(--ds-space-3) var(--ds-space-4)"
        }}
      >
        No se pudo actualizar contra la base: {error}
      </div>
    );
  }
  return null;
}
