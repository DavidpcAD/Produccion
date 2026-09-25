import { PantallaMovida } from '@/components/layout/PantallaMovida';

// La gestión de Apps se movió a Recursos Humanos (rh.adelante.cr).
export default function AppsMovidoPage() {
  return (
    <PantallaMovida
      icono="list"
      titulo="La gestión de Apps se movió"
      enlaces={[
        { href: 'https://rh.adelante.cr/apps', label: 'Ir a Recursos Humanos', principal: true, externo: true },
      ]}
    >
      Las aplicaciones y sus roles ahora se administran desde <b>Recursos Humanos</b>.
    </PantallaMovida>
  );
}
