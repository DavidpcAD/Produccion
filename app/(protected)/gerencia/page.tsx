import { KpiApp } from '@/components/gerencia/KpiApp';

// Tablero de KPIs para Gerencia (ver components/gerencia). El acceso lo gatea el
// módulo 'gerencia' del rol (lib/permissions.ts): solo el rol "Gerencia" y Super
// Admin. Sin API propia: son datos de ejemplo del prototipo.
export default function GerenciaPage() {
  return <KpiApp />;
}
