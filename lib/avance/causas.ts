// Tipos del catálogo de Causas (portado de obrascontrol `causas.ts`).
// Datos en AdelanteDB, esquema `obc`, tabla `causas_catalogo`. El tipo de
// lectura `Causa` ya vive en `lib/avance/types.ts` (lo consume la matriz de
// avance / diálogo "No cumplió"); aquí solo agregamos los tipos de escritura
// del CRUD admin.
import type { Causa } from './types';

export type { Causa };

/** Body de POST /api/avance/causas (crear). */
export interface CausaCrear {
  codigo: string;
  descripcion: string;
  aplica_nc: boolean;
  aplica_inactividad: boolean;
  orden?: number;
}

/** Body de PUT /api/avance/causas/{id} (editar parcial). */
export interface CausaEditar {
  codigo?: string;
  descripcion?: string;
  aplica_nc?: boolean;
  aplica_inactividad?: boolean;
  activo?: boolean;
  orden?: number;
}
