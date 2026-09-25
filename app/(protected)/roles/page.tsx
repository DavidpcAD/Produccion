import { PantallaMovida } from '@/components/layout/PantallaMovida';

// La gestión de roles se movió a la app de Recursos Humanos (rh.adelante.cr).
// Esta pantalla queda como aviso/redirección para quien llegue por el enlace viejo.
export default function RolesMovidoPage() {
  return (
    <PantallaMovida
      icono="rol"
      titulo="La gestión de roles se movió"
      enlaces={[
        { href: 'https://rh.adelante.cr/roles', label: 'Ir a Recursos Humanos', principal: true, externo: true },
      ]}
    >
      Los roles y sus tipos ahora se administran desde <b>Recursos Humanos</b>.
      Producción sigue usando los roles para permisos, pero ya no se editan acá.
    </PantallaMovida>
  );
}
