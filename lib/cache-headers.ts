// Cache de navegador (privado, por usuario) para respuestas de REPORTES de solo lectura
// (Utilidades, Avance, Reporte H4). Su dato viene de vistas/BC y NO se edita dentro del
// app, así que servir la respuesta cacheada al revisitar hace la navegación instantánea,
// con refresco en segundo plano (stale-while-revalidate) y sin riesgo de quedar viejo.
// `private` = solo el navegador del usuario, nunca cachés compartidas/CDN.
export const REPORTE_CACHE = { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' };
