import type { EstadoColada } from './tipos';

// Mapeo de estado de colada → etiqueta + variante de Badge del Design System.
// Alineado con el workflow del dominio (0012/0017): sugerida → confirmada →
// digitada → cerrada; anulada es terminal.
export const ESTADO_COLADA: Record<
  EstadoColada,
  { label: string; variant: 'green' | 'yellow' | 'blue' | 'gray' | 'red' | 'black' }
> = {
  sugerida: { label: 'Sugerida', variant: 'gray' },
  confirmada: { label: 'Confirmada', variant: 'blue' },
  digitada: { label: 'Digitada', variant: 'yellow' },
  cerrada: { label: 'Cerrada', variant: 'green' },
  anulada: { label: 'Anulada', variant: 'red' },
};

export const ESTADOS_COLADA: EstadoColada[] = [
  'sugerida',
  'confirmada',
  'digitada',
  'cerrada',
  'anulada',
];
