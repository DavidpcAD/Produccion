import Link from 'next/link';
import { Icon } from '@/components/ds/Icon/Icon';

// ─── 404 ─────────────────────────────────────────────────────────────────────
//
// Sin esta pantalla, Next sirve la suya: «404 — This page could not be found»,
// en inglés, sin el diseño del app y sin ningún enlace de vuelta. En una app
// interna donde la gente llega por enlaces viejos, por el historial o por un
// error de tipeo, eso parece que el sistema se cayó.
//
// Va al grano y deja salida. No dice "¿seguro que escribiste bien?" ni nada por
// el estilo: quien llega acá ya sabe que algo no cuadró; lo que necesita es
// volver a trabajar.
//
// Ojo: esto es para una dirección que NO EXISTE. Cuando la dirección existe
// pero no le toca a esa persona, el aviso lo da `AvisoSinAcceso` después de que
// `proxy.ts` la rebota a su pantalla de entrada — eso explica el porqué, que
// acá no se sabe.

export default function NoEncontrada() {
  return (
    <div className="min-h-dvh grid place-items-center bg-ds-bg p-6">
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-8 text-center max-w-md animate-fade-in">
        <div className="w-12 h-12 rounded-ds bg-black mx-auto flex items-center justify-center mb-4">
          <Icon name="search" size="md" color="var(--ds-color-green-100)" />
        </div>
        <h1 className="text-sub font-bold text-ds-ink">Esta dirección no existe</h1>
        <p className="mt-2 text-body-sm text-ds-gray-500">
          Puede que la pantalla se haya movido o que el enlace esté viejo.
        </p>
        <Link
          href="/"
          // `text-black` y NO `text-ds-ink`: el verde de marca es un color LITERAL y no
          // se invierte con el tema, pero `ds-ink` sí —en oscuro se vuelve claro— y el
          // botón quedaba en 1,48:1, prácticamente ilegible. Son las mismas clases que
          // usa el botón principal de PantallaMovida.
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-ds-lg bg-brand px-6 py-3 text-sm font-semibold text-black shadow-ds-03 transition-colors hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
