import { PantallaMovida } from '@/components/layout/PantallaMovida';

// La gestión de cuentas de login (usuario/contraseña y a qué apps/roles accede
// cada cuenta) se movió a Recursos Humanos (rh.adelante.cr). Producción sigue
// usando esas cuentas y roles para permisos, pero ya no se administran acá.
export default function CuentasMovidoPage() {
  return (
    <PantallaMovida
      icono="user"
      titulo="Las cuentas se administran en RRHH"
      enlaces={[
        { href: 'https://rh.adelante.cr', label: 'Ir a Recursos Humanos', principal: true, externo: true },
      ]}
    >
      Crear cuentas de acceso y asignar sus apps y roles ahora se hace desde <b>Recursos Humanos</b>.
      Producción sigue usando esas cuentas y roles para permisos, pero ya no se administran acá.
    </PantallaMovida>
  );
}
