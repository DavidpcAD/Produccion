// Textos de la ayuda contextual (botón ⓘ de la topbar), indexados por ruta.
// Un solo archivo: es de lo más barato/rentable que tiene la app — nadie
// recibió capacitación formal para usar esto.

export interface AyudaPantalla {
  paraQueSirve: string;
  pasoAPaso: string[];
  tips?: string[];
}

export const AYUDA: Record<string, AyudaPantalla> = {
  "/": {
    paraQueSirve: "Panel general: qué tan disponible está la flota, cuántas OTs siguen abiertas y qué necesita atención ya.",
    pasoAPaso: [
      "Revisá 'Alertas activas' — ahí caen los planes de mantenimiento vencidos y los repuestos bajo el mínimo.",
      "Hacé clic en cualquier alerta para ir directo a esa pantalla."
    ]
  },
  "/equipos": {
    paraQueSirve: "El listado de toda la maquinaria: horómetro, estado y cuánto falta para el próximo mantenimiento.",
    pasoAPaso: [
      "'Nuevo equipo' para dar de alta una máquina.",
      "El ícono de reloj registra una lectura de horómetro sin editar el equipo entero.",
      "El ícono de lista abre la ficha: historial de repuestos, vida útil y manuales."
    ],
    tips: ["'Horas restantes' se calcula solo — no hace falta crear un plan formal para verlo."]
  },
  "/ordenes": {
    paraQueSirve: "Todas las órdenes de trabajo: preventivas, correctivas y predictivas, con su estado y prioridad.",
    pasoAPaso: [
      "'Nueva OT' para abrir una orden de trabajo.",
      "Entrá a una OT abierta para iniciarla, cargar el checklist, repuestos usados, fotos y firma de cierre."
    ]
  },
  "/planes": {
    paraQueSirve: "Los planes de mantenimiento preventivo por equipo, ordenados por urgencia.",
    pasoAPaso: ["'Generar OT' en un plan vencido o próximo crea la orden de trabajo ya con el checklist cargado."]
  },
  "/repuestos": {
    paraQueSirve: "El repertorio de repuestos de UN equipo a la vez (cada repuesto pertenece a una sola máquina).",
    pasoAPaso: [
      "Elegí el equipo arriba para ver su repertorio.",
      "'Movimiento' registra una entrada o salida de bodega y ajusta el stock solo."
    ]
  },
  "/solicitudes": {
    paraQueSirve: "Pedidos de materiales que generan un PDF listo para imprimir o enviar.",
    pasoAPaso: ["'Nueva solicitud' — elegí el material (o escribilo si no está en el catálogo), la cantidad y su unidad, y generá el PDF."]
  },
  "/reportes": {
    paraQueSirve: "Métricas históricas: OTs finalizadas, costo total y costo por equipo.",
    pasoAPaso: ["Es de solo lectura — no hay nada para editar acá."]
  }
};

export function ayudaParaRuta(pathname: string): AyudaPantalla | null {
  if (AYUDA[pathname]) return AYUDA[pathname];
  const base = "/" + (pathname.split("/")[1] || "");
  return AYUDA[base] ?? null;
}
