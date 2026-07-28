// Layout del módulo Compras (portado de OrdenesCompras). Provee el store y los toasts
// propios del módulo e importa sus tokens de diseño. Vive dentro del (protected) de la
// base, así que hereda auth + sidebar; acá solo agregamos los providers que sus páginas
// esperan.
import '@/app/compras.css';
import { StoreProvider } from '@/lib/compras/store';
import { ToastProvider } from '@/components/compras/ui';

// Este layout decide modo SQL (USE_API) leyendo la env var del App Service EN RUNTIME.
// Sin esto, Next lo renderiza estático en el build (donde USE_API no existe) y el valor
// queda "horneado" en false → cambiar la env en Azure no haría efecto.
export const dynamic = 'force-dynamic';

export default function ComprasLayout({ children }: { children: React.ReactNode }) {
  const useApi = process.env.USE_API === '1' || process.env.NEXT_PUBLIC_USE_API === '1';
  return (
    <StoreProvider useApi={useApi}>
      {/* .oc-scope confina TODOS los estilos de compras.css a este módulo para que no
          pisen el Design System de la base (sidebar, etc.). */}
      <ToastProvider><div className="oc-scope">{children}</div></ToastProvider>
    </StoreProvider>
  );
}
