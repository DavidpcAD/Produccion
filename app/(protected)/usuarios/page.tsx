import Link from 'next/link';
import { Icon } from '@/components/ds/Icon/Icon';

// La gestión de colaboradores (personal) se movió a la app de Recursos Humanos
// (rh.adelante.cr). En Producción los colaboradores se asignan a la obra desde
// Cuadrillas. Esta pantalla queda como aviso para quien llegue por el enlace viejo.
export default function ColaboradoresMovidoPage() {
  return (
    <div className="p-6 max-w-xl mx-auto animate-fade-in">
      <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-8 text-center">
        <div className="w-12 h-12 rounded-ds bg-black mx-auto flex items-center justify-center mb-4">
          <Icon name="user" size="lg" color="currentColor" className="text-brand" />
        </div>
        <h1 className="text-heading font-bold text-black">Los colaboradores se administran en RRHH</h1>
        <p className="text-ds-gray-400 mt-2 text-body">
          Crear, editar y dar de baja al personal ahora se hace desde <b>Recursos Humanos</b>.
          En Producción, los colaboradores se asignan a la obra desde <b>Cuadrillas</b>.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a href="https://rh.adelante.cr" target="_blank" rel="noreferrer">
            <span className="inline-flex items-center gap-2 rounded-ds-lg bg-brand text-black font-semibold px-6 py-3 shadow-ds-03">
              Ir a Recursos Humanos
              <Icon name="arrow-right" size="sm" color="currentColor" />
            </span>
          </a>
          <Link href="/cuadrillas">
            <span className="inline-flex items-center gap-2 rounded-ds-lg bg-white text-black font-semibold px-6 py-3 border border-ds-gray-200 hover:bg-ds-gray-100 transition-colors">
              Ir a Cuadrillas
            </span>
          </Link>
        </div>
        <div className="mt-4">
          <Link href="/" className="text-sm font-semibold text-ds-gray-400 hover:text-black">Volver al inicio</Link>
        </div>
      </div>
    </div>
  );
}
