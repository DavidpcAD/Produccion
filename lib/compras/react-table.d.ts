// Augmentación de ColumnMeta específica del módulo Compras (portado de OrdenesCompras).
// Se fusiona con la augmentación de la base (components/ui/DataTable.tsx). Agrega las
// props de metadata que usan las tablas de compras.
import type { RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    num?: boolean;   // columna numérica (alineación/formato a la derecha)
    date?: boolean;  // columna de fecha
  }
}
