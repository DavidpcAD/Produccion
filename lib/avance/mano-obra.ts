// Tipos del módulo Mano de Obra (portado de obrascontrol `mano-obra.ts`).
// Datos en AdelanteDB, esquema `obc` (tablas mo_nomina_semanal / mo_horas_obra /
// mo_subcontratos + semanas_operativas). Cálculo de reparto/costo m²/eficiencia:
//
//   nómina_asignada(obra) = (horas_obra / Σ horas_semana) × nómina_directa
//   M.O.(obra)            = nómina_asignada + Σ subcontratos(obra)
//   costo M.O./m²         = M.O. / m² avanzados
//   eficiencia            = costo_teórico / costo_real × 100

export interface SemanaOperativa {
  id: number;
  anio: number;
  numero_semana: number;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
}

export interface NominaSemanal {
  semana_operativa_id: number;
  monto_nomina_directa: number;
  costo_teorico_m2: number;
  notas: string | null;
  anio: number;
  numero_semana: number;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
}

export interface HorasObra {
  semana_operativa_id: number;
  obra_codigo: string;
  horas: number;
}

export interface Subcontrato {
  id: number;
  semana_operativa_id: number;
  obra_codigo: string;
  tipo: string | null;
  monto: number;
  descripcion: string | null;
}
