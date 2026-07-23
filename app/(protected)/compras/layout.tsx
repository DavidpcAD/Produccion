// Layout del módulo Compras (portado de OrdenesCompras). Provee el store y los toasts
// propios del módulo e importa sus tokens de diseño. Vive dentro del (protected) de la
// base, así que hereda auth + sidebar; acá solo agregamos los providers que sus páginas
// esperan.
import '@/app/compras.css';
import { StoreProvider } from '@/lib/compras/store';
import { ToastProvider } from '@/components/compras/ui';

export default function ComprasLayout({ children }: { children: React.ReactNode }) {
  const useApi = process.env.USE_API === '1' || process.env.NEXT_PUBLIC_USE_API === '1';
  return (
    <StoreProvider useApi={useApi}>
      <ToastProvider>{children}</ToastProvider>
    </StoreProvider>
  );
}
