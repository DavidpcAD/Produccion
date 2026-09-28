'use client';
import type { ComponentProps, ReactNode } from 'react';
import { Icon } from '@/components/ds/Icon/Icon';

// ─── Estado vacío / de error ─────────────────────────────────────────────────
// El estándar (docs/design-standard.md §6) pide que TODA pantalla diga algo
// cuando no hay nada que mostrar, y da la forma: card centrada con el mensaje.
// Cada pantalla lo venía escribiendo a mano y se fueron separando —`p-10
// text-center`, `py-20 text-ds-gray-300`, con card y sin card—, así que acá vive
// una sola vez.
//
// Sirve para los dos casos, que se ven parecido pero no son lo mismo:
//   · No hay datos todavía (`tono="neutro"`): no pasó nada malo.
//   · La carga falló (`tono="error"`): pasó algo y hay que poder reintentar.
//
// El de error importa más de lo que parece: una pantalla que solo tostaba el
// fallo quedaba en blanco bajo el título, el toast se iba a los pocos segundos y
// el usuario se quedaba mirando un vacío sin saber si no hay datos, si se rompió
// algo o si todavía está cargando.

type Tono = 'neutro' | 'error';

export function EstadoVacio({
  icono = 'boleta',
  titulo,
  children,
  accion,
  tono = 'neutro',
}: {
  icono?: ComponentProps<typeof Icon>['name'];
  titulo: string;
  /** Una frase que explique qué pasa y, si aplica, qué hacer. */
  children?: ReactNode;
  /** Botón de salida (reintentar, crear el primero, volver…). */
  accion?: ReactNode;
  tono?: Tono;
}) {
  const esError = tono === 'error';
  return (
    <div
      role={esError ? 'alert' : undefined}
      className={
        'bg-ds-surface rounded-ds-lg border p-10 text-center shadow-ds-01 ' +
        (esError ? 'border-ds-red/40' : 'border-ds-gray-200')
      }
    >
      <div
        className={
          'w-12 h-12 rounded-ds mx-auto flex items-center justify-center mb-4 ' +
          (esError ? 'bg-ds-red' : 'bg-ds-gray-100')
        }
      >
        <Icon
          name={esError ? 'alert' : icono}
          size="lg"
          color="currentColor"
          className={esError ? 'text-white' : 'text-ds-gray-400'}
        />
      </div>
      <p className="text-body font-semibold text-ds-ink text-balance">{titulo}</p>
      {children && <p className="text-sm text-ds-gray-400 mt-1 break-words">{children}</p>}
      {accion && <div className="mt-5 flex justify-center">{accion}</div>}
    </div>
  );
}
