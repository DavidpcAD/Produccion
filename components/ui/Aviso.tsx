'use client';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ds/Icon/Icon';

// ─── La franja de aviso ──────────────────────────────────────────────────────
//
// Una línea ámbar que le dice algo a la persona SIN tapar la pantalla ni
// pedirle nada. Es para lo que no es un error pero sí hay que saber: que la
// lista está cortada, que la rebotaron de una ruta, que esa configuración
// todavía no se aplica.
//
// NO es el aviso de sesión vencida (components/layout/AvisoSesion.tsx): ese va
// fijo arriba de todo, encima de los modales, y no se va solo porque hay
// trabajo escrito en riesgo. Este acompaña al contenido.
//
// `role="status"` y no `alert`: un lector de pantalla lo anuncia cuando termine
// lo que está diciendo, sin interrumpir. Nada de esto es una urgencia.

export function Aviso({
  children,
  tono = 'amarillo',
  accion,
}: {
  children: ReactNode;
  /** Hoy solo ámbar. El parámetro existe para que agregar otro tono sea cambiar
   *  este archivo y no buscar la franja copiada por las pantallas. */
  tono?: 'amarillo';
  /** Botón o enlace a la derecha ("Entendido", "Quitar el filtro"). */
  accion?: ReactNode;
}) {
  const colores =
    tono === 'amarillo'
      ? { caja: 'border-ds-yellow/35 bg-ds-yellow-soft', texto: 'text-ds-yellow-ink', icono: 'var(--color-ds-yellow-ink)' }
      : { caja: '', texto: '', icono: 'currentColor' };

  return (
    <div role="status" className={`flex items-start gap-2.5 rounded-ds border px-3.5 py-2.5 ${colores.caja}`}>
      <span className="mt-px shrink-0">
        <Icon name="alert" size="sm" color={colores.icono} />
      </span>
      <p className={`flex-1 text-body-sm ${colores.texto}`}>{children}</p>
      {accion}
    </div>
  );
}
