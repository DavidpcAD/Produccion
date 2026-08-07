import Link from 'next/link';
import { Icon } from '@/components/ds/Icon/Icon';

// La gestión de cuentas de login (usuario/contraseña y a qué apps/roles accede
// cada cuenta) se movió a Recursos Humanos (rh.adelante.cr). Producción sigue
// usando esas cuentas y roles para permisos, pero ya no se administran acá.
export default function CuentasMovidoPage() {
  return (
    <div className="p-6 max-w-xl mx-auto animate-fade-in">
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-8 text-center">
        <div className="w-12 h-12 rounded-ds bg-black mx-auto flex items-center justify-center mb-4">
          <Icon name="user" size="lg" color="currentColor" className="text-brand" />
        </div>
        <h1 className="text-heading font-bold text-ds-ink">Las cuentas se administran en RRHH</h1>
        <p className="text-ds-gray-400 mt-2 text-body">
          Crear cuentas de acceso y asignar sus apps y roles ahora se hace desde <b>Recursos Humanos</b>.
          Producción sigue usando esas cuentas y roles para permisos, pero ya no se administran acá.
        </p>
        <a href="https://rh.adelante.cr" target="_blank" rel="noreferrer" className="inline-block mt-6">
          <span className="inline-flex items-center gap-2 rounded-ds-lg bg-brand text-black font-semibold px-6 py-3 shadow-ds-03">
            Ir a Recursos Humanos
            <Icon name="arrow-right" size="sm" color="currentColor" />
          </span>
        </a>
        <div className="mt-4">
          <Link href="/" className="text-sm font-semibold text-ds-gray-400 hover:text-ds-ink">Volver al inicio</Link>
        </div>
      </div>
    </div>
  );
}
