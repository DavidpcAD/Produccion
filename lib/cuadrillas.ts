// Helpers de guardado de cuadrilla. Una cuadrilla trabaja en uno o VARIOS
// proyectos; por cada proyecto tiene sus obras y sus subpartidas (la exclusividad
// de subpartida es POR PROYECTO). El payload nuevo es `bloques`; se mantiene
// retro-compat con el formato viejo (idProyecto/idObras/idSubPartidas flat).

export interface BloqueCuadrilla {
  idProyecto: number;
  idObras: number[];
  idSubPartidas: number[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizarBloques(body: Record<string, any>): BloqueCuadrilla[] {
  const raw: any[] = Array.isArray(body.bloques)
    ? body.bloques
    : (body.idProyecto
        ? [{ idProyecto: body.idProyecto, idObras: body.idObras, idSubPartidas: body.idSubPartidas }]
        : []);
  return raw
    .map((b) => ({
      idProyecto: Number(b?.idProyecto) || 0,
      idObras: (Array.isArray(b?.idObras) ? b.idObras : []).map(Number).filter(Boolean),
      idSubPartidas: (Array.isArray(b?.idSubPartidas) ? b.idSubPartidas : []).map(Number).filter(Boolean),
    }))
    .filter((b) => b.idProyecto > 0);
}

export function validarBloques(bloques: BloqueCuadrilla[]): string | null {
  if (bloques.length === 0) return 'Seleccioná al menos un proyecto.';
  const ids = bloques.map((b) => b.idProyecto);
  if (new Set(ids).size !== ids.length) return 'Hay un proyecto repetido.';
  for (const b of bloques) {
    if (b.idObras.length === 0) return 'En cada proyecto elegí al menos una obra.';
    if (b.idSubPartidas.length === 0) return 'En cada proyecto elegí al menos una subpartida.';
  }
  return null;
}
