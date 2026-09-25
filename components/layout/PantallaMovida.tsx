import Link from 'next/link';
import { Icon } from '@/components/ds/Icon/Icon';
import type { ComponentProps } from 'react';

// ─── Aviso de pantalla mudada ────────────────────────────────────────────────
// Usuarios, Roles, Cuentas, Apps y Auditoría se administran en Recursos Humanos
// (rh.adelante.cr); en Producción quedan estas cinco pantallas como aviso para
// quien llegue por un enlace viejo o por el historial del navegador.
//
// Eran cinco copias del mismo bloque, y ya se les notaba: una traía un segundo
// botón, otra no, y el ancho y el aire de la tarjeta se habían ido separando de
// a poco. Acá viven una sola vez.
//
// El botón es un <a> de verdad —no un <button> envuelto en un enlace— porque va
// a otro dominio: así el navegador ofrece "abrir en pestaña nueva", el clic del
// medio funciona y el lector de pantalla lo anuncia como enlace, que es lo que
// es. Por eso no usa components/ui/Button (que renderiza <button>) y repite sus
// clases de la variante primary/md.

type NombreIcono = ComponentProps<typeof Icon>['name'];

export interface EnlaceMovida {
  href: string;
  label: string;
  /** El principal va relleno de marca; el resto, con borde. */
  principal?: boolean;
  /** Fuera del app (abre en otra pestaña). */
  externo?: boolean;
}

const BASE_ENLACE =
  'inline-flex items-center justify-center gap-2 rounded-ds-lg px-6 py-3 font-semibold text-sm ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

export function PantallaMovida({
  icono,
  titulo,
  children,
  enlaces,
}: {
  icono: NombreIcono;
  titulo: string;
  /** Una o dos frases: qué se movió y qué se hace ahora en Producción. */
  children: React.ReactNode;
  enlaces: EnlaceMovida[];
}) {
  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto animate-fade-in">
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-8 text-center">
        <div className="w-12 h-12 rounded-ds bg-black mx-auto flex items-center justify-center mb-4">
          <Icon name={icono} size="lg" color="currentColor" className="text-brand" />
        </div>
        <h1 className="text-heading font-bold text-ds-ink text-balance">{titulo}</h1>
        <p className="text-ds-gray-400 mt-2 text-body">{children}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {enlaces.map((e) =>
            e.externo ? (
              <a
                key={e.href}
                href={e.href}
                target="_blank"
                rel="noreferrer"
                className={`${BASE_ENLACE} ${
                  e.principal
                    ? 'bg-brand text-black hover:bg-brand-200 focus-visible:ring-brand shadow-ds-03'
                    : 'border-2 border-black text-ds-ink hover:bg-black hover:text-white focus-visible:ring-black'
                }`}
              >
                {e.label}
                <Icon name="arrow-right" size="sm" color="currentColor" />
              </a>
            ) : (
              <Link
                key={e.href}
                href={e.href}
                className={`${BASE_ENLACE} ${
                  e.principal
                    ? 'bg-brand text-black hover:bg-brand-200 focus-visible:ring-brand shadow-ds-03'
                    : 'border-2 border-black text-ds-ink hover:bg-black hover:text-white focus-visible:ring-black'
                }`}
              >
                {e.label}
              </Link>
            ),
          )}
        </div>

        <div className="mt-4">
          <Link href="/" className="text-sm font-semibold text-ds-gray-400 hover:text-ds-ink">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
