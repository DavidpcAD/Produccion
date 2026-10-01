'use client';
import { Icon } from '@/components/ds/Icon/Icon';

// ─── "Esto no es todo" ────────────────────────────────────────────────────────
//
// Las pantallas de Concreto piden SIEMPRE la página 1 con un tope (500 batches,
// 500 coladas, 100 ensayos) y hasta ahora rotulaban el resultado con
// `${filas.length} batches`. O sea que con 8 299 batches en la base la pantalla
// decía "500 batches", como si esos fueran todos los que hay.
//
// Y el buscador de la tabla filtra en el navegador (getFilteredRowModel), sobre
// las filas que YA se bajaron. Así que buscar un batch viejo no devolvía nada y
// la pantalla contestaba "no hay resultados" — que es lo mismo que decir "ese
// batch no existe" cuando sí existe.
//
// Esto no arregla la paginación (eso es rehacer 4 pantallas); arregla la
// MENTIRA: el subtítulo dice cuántas se están viendo de cuántas hay, y si falta
// alguna sale este aviso explicando que buscar no las va a encontrar y qué
// hacer para llegar a ellas.
//
// El color sigue el patrón ámbar del DS (el mismo del distintivo amarillo de
// components/ui/Badge): texto `yellow-ink` —que ya tiene su variante de tema
// oscuro— sobre `yellow-soft`, el fondo ámbar que se agregó al DS para esto
// (el amarillo tenía «ink» pero no tenía superficie).

/** Subtítulo honesto: "500 de 8 299 batches". Si no falta nada, "8 299 batches". */
export function rotuloTope(cargadas: number, total: number, sustantivo: string): string {
  const n = (v: number) => v.toLocaleString('es-CR');
  return total > cargadas
    ? `${n(cargadas)} de ${n(total)} ${sustantivo}`
    : `${n(total)} ${sustantivo}`;
}

export function AvisoTope({
  cargadas,
  total,
  sustantivo,
  comoFiltrar,
}: {
  cargadas: number;
  total: number;
  /** Plural en minúscula: "batches", "coladas", "ensayos". */
  sustantivo: string;
  /** Qué filtros tiene esta pantalla para achicar la consulta. */
  comoFiltrar: string;
}) {
  if (total <= cargadas) return null;
  const faltan = total - cargadas;
  const n = (v: number) => v.toLocaleString('es-CR');

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-ds border border-ds-yellow/35 bg-ds-yellow-soft px-3.5 py-2.5"
    >
      <span className="mt-px shrink-0">
        <Icon name="alert" size="sm" color="var(--color-ds-yellow-ink)" />
      </span>
      <p className="text-body-sm text-ds-yellow-ink">
        Se están mostrando {n(cargadas)} {sustantivo} —{' '}
        <strong className="font-semibold">
          {n(faltan)} más {faltan === 1 ? 'queda' : 'quedan'} fuera de la lista
        </strong>
        . El buscador solo mira las que están acá, así que no va a encontrar{' '}
        {faltan === 1 ? 'la que falta' : 'las que faltan'}: {comoFiltrar}
      </p>
    </div>
  );
}
