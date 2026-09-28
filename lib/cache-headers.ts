// Cache de navegador (privado, por usuario) para respuestas de REPORTES de solo lectura
// (Utilidades, Avance, Reporte H4). Su dato viene de vistas/BC y NO se edita dentro del
// app, así que servir la respuesta cacheada al revisitar hace la navegación instantánea,
// con refresco en segundo plano (stale-while-revalidate) y sin riesgo de quedar viejo.
// `private` = solo el navegador del usuario, nunca cachés compartidas/CDN.
export const REPORTE_CACHE = { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' };

// El badge de la navegación (devoluciones pendientes). Lo pide CADA carga de
// página, así que sin caché son dos viajes a la base —y con la base serverless
// dormida eso son segundos— para pintar un numerito. 20 s alcanzan para que
// moverse por el app no vuelva a preguntar, y quien devuelve una solicitud ve el
// número nuevo al siguiente refresco, que es lo mismo que pasaba antes (el badge
// solo se actualizaba al cargar la página).
export const BADGE_CACHE = { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=60' };
