"use client";

import { HoverCard } from "@/components/compras/hover-card";
import type { DevolucionInfo, PedidoProgreso, PedidoProgresoPaso } from "@/lib/compras/helpers";

// Mini-stepper de 5 pasos (Pedido → Proveeduría → Orden → Aprobado → Facturado)
// para la columna Estado de "Mis solicitudes". Puntos con conectores punteados:
// completado = verde con ✓, actual = punto sólido, futuro = vacío. Si la solicitud
// fue devuelta a Ingeniería, el paso actual se pinta rojo. Al pasar el mouse sobre
// un punto cumplido (✓) o el actual se abre una tarjetita tipo "gota de agua" con el
// detalle del paso; los pasos futuros no reaccionan.
export function SolicitudProgreso({ prog, devolucion }: { prog: PedidoProgreso; devolucion?: DevolucionInfo }) {
  return (
    <span className={`sol-steps${prog.devuelto ? " sol-steps--devuelto" : ""}`} role="img" aria-label={`Paso ${prog.nivel} de ${prog.total}: ${prog.actualLabel}`}>
      {prog.pasos.map((paso, i) => {
        // TODOS los puntos reaccionan al mouse y abren su tarjetita (incluso los
        // futuros/pendientes), para poder ver de qué etapa se trata cada uno.
        const dot = (
          <span
            className={`sol-steps__dot${paso.done ? " is-done" : ""}${paso.current ? " is-current" : ""} is-interactive`}
            tabIndex={0}
          >
            {paso.done && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            )}
          </span>
        );
        return (
          <span className="sol-steps__seg" key={paso.label}>
            {i > 0 && <span className="sol-steps__line" aria-hidden />}
            <HoverCard placement="top" variant="droplet" maxWidth={250} content={<DotDetalle paso={paso} n={i + 1} prog={prog} devolucion={devolucion} />}>{dot}</HoverCard>
          </span>
        );
      })}
    </span>
  );
}

// Contenido de la tarjetita de un punto. En una solicitud devuelta, el punto actual
// (rojo) muestra de dónde volvió, quién la devolvió y el motivo.
function DotDetalle({ paso, n, prog, devolucion }: { paso: PedidoProgresoPaso; n: number; prog: PedidoProgreso; devolucion?: DevolucionInfo }) {
  if (prog.devuelto && paso.current) {
    const quien = devolucion?.por
      ? `${devolucion.por}${devolucion.rolLabel ? ` · ${devolucion.rolLabel}` : ""}`
      : undefined;
    return (
      <div className="hc-step">
        <div className="hc-step__title hc-step__title--danger">↩ Devuelta a Ingeniería</div>
        <div className="hc-step__sub">Volvió desde “{paso.label}”</div>
        {quien && <div className="hc-step__sub">Devuelta por {quien}</div>}
        <div className="hc-step__state hc-step__state--devuelto">Devuelta</div>
        {prog.motivo && <div className="hc-step__motivo">Motivo: {prog.motivo}</div>}
      </div>
    );
  }
  const estado = paso.done ? "done" : paso.current ? "current" : "next";
  const estadoLabel = paso.done ? "Completado" : paso.current ? "En curso" : "Pendiente";
  return (
    <div className="hc-step">
      <div className="hc-step__title">{n}. {paso.label}</div>
      <div className="hc-step__sub">{paso.tip}</div>
      <div className={`hc-step__state hc-step__state--${estado}`}>{estadoLabel}</div>
    </div>
  );
}
