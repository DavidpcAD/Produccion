import { KpiFrame } from '@/components/gerencia/KpiFrame';

// Tablero de KPIs para Gerencia: la app de Marcos tal cual (ver KpiFrame). El
// acceso lo gatea el módulo 'gerencia' del rol (lib/permissions.ts): SOLO el rol
// "Gerencia", ni el Super Admin. Sin API propia: son datos de ejemplo.
export default function GerenciaPage() {
  return <KpiFrame />;
}
