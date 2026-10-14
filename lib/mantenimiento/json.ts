// Ayudantes para las columnas JSON (checklist, fotos, repuestosUsados, tareas,
// manuales, items). Ver la nota al principio de sql/schema2.sql sobre por qué
// esas listas viven como texto JSON y no como tablas aparte.

export function parsearJson<T>(texto: string | null | undefined, porDefecto: T): T {
  if (texto == null) return porDefecto;
  try {
    const valor = JSON.parse(texto);
    return valor == null ? porDefecto : (valor as T);
  } catch {
    // Un JSON roto acá es un bug del propio sistema (la columna tiene un
    // CHECK ISJSON), no algo que el usuario pueda causar — no vale la pena
    // tirar la lectura entera por eso, mejor devolver el valor por defecto.
    return porDefecto;
  }
}

export function aJsonONull(valor: unknown): string | null {
  if (valor == null) return null;
  return JSON.stringify(valor);
}
