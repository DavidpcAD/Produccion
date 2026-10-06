'use client';
import { useEffect, useRef } from 'react';
import { AdelanteMark } from '@/components/ds/AdelanteMark/AdelanteMark';
import { Button } from '@/components/ds/Button/Button';
import { Icon } from '@/components/ds/Icon/Icon';
import { MINUTOS_INACTIVIDAD, useInactividad, seguirAqui } from '@/hooks/useInactividad';

// ─── Lo que se ve cuando la tableta queda sola ───────────────────────────────
// La lógica (cuánto se espera, el logout de verdad, las pestañas) está en
// hooks/useInactividad.ts. Acá solo están las dos pantallas:
//
//   · el aviso con la cuenta regresiva, un minuto antes — flotante, chico, para
//     que quien esté leyendo siga con un toque;
//   · el bloqueo, ya con la sesión cerrada — tapa TODO (velo + desenfoque)
//     porque el punto es justamente que lo de atrás no quede a la vista de
//     quien pase por la mesa.

/** Candado. El catálogo del DS (components/ds/Icon) no tiene ninguno —lo más
 *  cercano, `rol`, es una credencial— y acá la figura ES el mensaje: lo que se
 *  entiende de un vistazo, antes de leer, es que esto está cerrado. Decorativo:
 *  el texto de al lado dice lo mismo. Monocromo con `currentColor`, como todo el
 *  catálogo, para que lo recolore quien lo use. */
function Candado() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3h-2V7a2.5 2.5 0 0 0-5 0v3h-2Z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.5 10h11A2.5 2.5 0 0 1 20 12.5v7A2.5 2.5 0 0 1 17.5 22h-11A2.5 2.5 0 0 1 4 19.5v-7A2.5 2.5 0 0 1 6.5 10Zm5.5 3.6a1.6 1.6 0 0 0-.8 3v1.4a.8.8 0 0 0 1.6 0v-1.4a1.6 1.6 0 0 0-.8-3Z"
      />
    </svg>
  );
}

function Marca() {
  return (
    <div className="bloqueo-sesion__marca">
      <span className="bloqueo-sesion__marca-logo"><AdelanteMark className="w-4 h-auto" /></span>
      <span className="bloqueo-sesion__marca-nombre">Adelante</span>
    </div>
  );
}

/** Al login, recordando a dónde volver. Gemelo del de useSession, con su propio
 *  motivo: el mensaje de allá («se venció») no es el de acá («la cerramos»). */
function volverAEntrar() {
  const { pathname, search } = window.location;
  const destino = encodeURIComponent(`${pathname}${search}`);
  window.location.replace(`/login?sesion=inactividad&volver=${destino}`);
}

export function BloqueoInactividad() {
  const { fase, restante } = useInactividad();
  const panel = useRef<HTMLDivElement>(null);
  const cerrada = fase === 'cerrada';

  // Con el bloqueo puesto la página de atrás no se usa: ni se desplaza ni recibe
  // el tabulador. El foco entra al único botón que queda.
  useEffect(() => {
    if (!cerrada) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const id = requestAnimationFrame(() => panel.current?.querySelector('button')?.focus());
    const atraparTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      panel.current?.querySelector('button')?.focus();
    };
    window.addEventListener('keydown', atraparTab, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', atraparTab, true);
      document.body.style.overflow = previo;
    };
  }, [cerrada]);

  if (fase === 'activo') return null;

  if (fase === 'avisando') {
    const mm = Math.floor(restante / 60);
    const ss = String(restante % 60).padStart(2, '0');
    return (
      <div className="aviso-inactividad" role="alert">
        <span className="aviso-inactividad__icono"><Icon name="reloj" size="md" color="currentColor" /></span>
        <div className="aviso-inactividad__texto">
          <strong>¿Seguís ahí?</strong>{' '}
          <span className="sr-only">Tu sesión se cerrará por inactividad en menos de un minuto.</span>
          <span aria-hidden="true">Tu sesión se cierra en {mm}:{ss} por inactividad.</span>
        </div>
        <Button label="Sigo aquí" color="green" size="sm" onClick={seguirAqui} />
      </div>
    );
  }

  return (
    <div className="bloqueo-sesion" role="dialog" aria-modal="true" aria-labelledby="bloqueo-sesion-titulo">
      <div className="bloqueo-sesion__panel" ref={panel}>
        <Marca />
        <div className="bloqueo-sesion__cuerpo">
          <div>
            <h2 className="bloqueo-sesion__titulo" id="bloqueo-sesion-titulo">Tu sesión terminó</h2>
            <p className="bloqueo-sesion__texto">
              Por seguridad, tu sesión se cerró después de {MINUTOS_INACTIVIDAD} minutos sin
              actividad. Entrá de nuevo para continuar.
            </p>
          </div>
          <span className="bloqueo-sesion__arte" aria-hidden="true"><Candado /></span>
        </div>
        {/* Carga limpia y no `router.push`: la sesión ya no existe y de esta
            pantalla no debe sobrevivir ni el estado ni el historial. Se lleva a
            dónde volver: si es la misma persona la que entra, aterriza donde
            estaba (y si es otra, el guard de rol la rebota, como siempre). */}
        <Button label="Entrar de nuevo" color="green" fullWidth onClick={volverAEntrar} />
      </div>
    </div>
  );
}
