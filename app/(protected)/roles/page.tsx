import Link from 'next/link';
import { Icon } from '@/components/ds/Icon/Icon';

// La gestión de roles se movió a la app de Recursos Humanos (rh.adelante.cr).
// Esta pantalla queda como aviso/redirección para quien llegue por el enlace viejo.
export default function RolesMovidoPage() {
  return (
    <div className="p-6 max-w-xl mx-auto animate-fade-in">
      <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-8 text-center">
        <div className="w-12 h-12 rounded-ds bg-black mx-auto flex items-center justify-center mb-4">
          <Icon name="rol" size="lg" color="currentColor" className="text-brand" />
        </div>
        <h1 className="text-heading font-bold text-black">La gestión de roles se movió</h1>
        <p className="text-ds-gray-400 mt-2 text-body">
          Los roles y sus tipos ahora se administran desde <b>Recursos Humanos</b>.
          Producción sigue usando los roles para permisos, pero ya no se editan acá.
        </p>
        <a href="https://rh.adelante.cr/roles" target="_blank" rel="noreferrer" className="inline-block mt-6">
          <span className="inline-flex items-center gap-2 rounded-ds-lg bg-brand text-black font-semibold px-6 py-3 shadow-ds-03">
            Ir a Recursos Humanos
            <Icon name="arrow-right" size="sm" color="currentColor" />
          </span>
        </a>
        <div className="mt-4">
          <Link href="/" className="text-sm font-semibold text-ds-gray-400 hover:text-black">Volver al inicio</Link>
        </div>
      </div>
    </div>
  );
}
