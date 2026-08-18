import { redirect } from 'next/navigation';

// El Dashboard de Órdenes de Compra se retiró del menú: "Mis solicitudes" es ahora
// la entrada del módulo. Se mantiene esta ruta como redirección para no romper
// links/bookmarks viejos que apuntaban a /compras/ingenieria/dashboard.
export default function OrdenesCompraDashboardRedirect() {
  redirect('/compras/ingenieria');
}
