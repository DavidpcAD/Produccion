import { PantallaMovida } from '@/components/layout/PantallaMovida';

// La gestión de colaboradores (personal) se movió a la app de Recursos Humanos
// (rh.adelante.cr). En Producción los colaboradores se asignan a la obra desde
// Cuadrillas. Esta pantalla queda como aviso para quien llegue por el enlace viejo.
export default function ColaboradoresMovidoPage() {
  return (
    <PantallaMovida
      icono="user"
      titulo="Los colaboradores se administran en RRHH"
      enlaces={[
        { href: 'https://rh.adelante.cr', label: 'Ir a Recursos Humanos', principal: true, externo: true },
        { href: '/cuadrillas', label: 'Ir a Cuadrillas' },
      ]}
    >
      Crear, editar y dar de baja al personal ahora se hace desde <b>Recursos Humanos</b>.
      En Producción, los colaboradores se asignan a la obra desde <b>Cuadrillas</b>.
    </PantallaMovida>
  );
}
