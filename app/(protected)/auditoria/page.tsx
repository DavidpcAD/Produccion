import { PantallaMovida } from '@/components/layout/PantallaMovida';

// La Auditoría se movió a Recursos Humanos (rh.adelante.cr).
export default function AuditoriaMovidoPage() {
  return (
    <PantallaMovida
      icono="boleta"
      titulo="La Auditoría se movió"
      enlaces={[
        { href: 'https://rh.adelante.cr/auditoria', label: 'Ir a Recursos Humanos', principal: true, externo: true },
      ]}
    >
      La bitácora de auditoría ahora se consulta desde <b>Recursos Humanos</b>.
    </PantallaMovida>
  );
}
