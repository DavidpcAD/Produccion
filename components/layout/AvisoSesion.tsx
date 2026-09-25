'use client';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ds/Button/Button';
import { Icon } from '@/components/ds/Icon/Icon';
import { irAlLogin, useSesionVencida } from '@/hooks/useSession';

// ─── Aviso de sesión terminada ───────────────────────────────────────────────
// La sesión dura 8 h y se vence con la pestaña abierta. Desde ese momento el
// servidor contesta 401 a todo y la pantalla sigue pintando los datos de la
// última carga buena: el usuario le pega a botones que no hacen nada (las
// órdenes que decían "lanzado" sin tocar BC, el 26/08/2026; la subpartida que
// no se guardó, el 25/09/2026).
//
// Va arriba de TODO —también de los modales, por eso el z-index 110— porque ahí
// es justo donde lo agarra: llenando un formulario. Y no se cierra ni se va
// solo: si lo mandáramos al login de una, lo escrito se pierde sin que alcance
// a copiarlo. Él decide cuándo salir.
//
// Ocupa su propia franja en vez de flotar encima: así no le tapa el título de
// la pantalla ni el botón del menú en móvil.
export function AvisoSesion() {
  const vencida = useSesionVencida();
  const barra = useRef<HTMLDivElement>(null);

  // Los toasts salen fijos arriba a la derecha, o sea encima de esta barra.
  // Se publica su alto para que bajen lo justo (ver globals.css); con
  // ResizeObserver porque el texto envuelve en pantallas angostas y el alto
  // cambia solo.
  useEffect(() => {
    const barraActual = barra.current;
    if (!vencida || !barraActual) return;
    const raiz = document.documentElement;
    raiz.classList.add('con-aviso-sesion');
    const medir = () => raiz.style.setProperty('--alto-aviso', `${barraActual.offsetHeight}px`);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(barraActual);
    return () => {
      observador.disconnect();
      raiz.classList.remove('con-aviso-sesion');
      raiz.style.removeProperty('--alto-aviso');
    };
  }, [vencida]);

  if (!vencida) return null;

  return (
    <div className="aviso-sesion" role="alert" aria-live="assertive" ref={barra}>
      <Icon name="alert" size="md" color="currentColor" className="aviso-sesion__icono" />
      <div className="aviso-sesion__texto">
        <strong>Tu sesión terminó.</strong> Desde ahora nada de lo que hagás en esta pantalla se
        está guardando. Copiá lo que tengás escrito y entrá de nuevo.
      </div>
      <Button label="Entrar de nuevo" color="black" size="sm" onClick={irAlLogin} />
    </div>
  );
}
