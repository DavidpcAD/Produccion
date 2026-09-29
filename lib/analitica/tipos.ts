// Tipos del panel de Analítica. Las consultas (lib/analitica/queries.ts) arman
// estas piezas y las pantallas solo las pintan: así el server decide QUÉ se mide
// y el componente solo sabe DIBUJAR.

/** Punto de una serie o de una mini-barra: etiqueta del eje X + valor. */
export type Punto = { x: string; y: number };

/** Cómo formatear los valores de una serie/dona en ejes, leyendas y tooltips. */
export type Formato = 'entero' | 'decimal' | 'crc' | 'pct';

/** Acento del último dato: brand = normal, alerta = rojo (algo que atender). */
export type Tono = 'brand' | 'alerta' | 'neutro';

/** Tarjeta del bloque "Resumen" (número grande + mini-barras de historia). */
export type Tarjeta = {
  clave: string;
  label: string;
  /** Ya formateado por el server (₡, miles, decimales). */
  valor: string;
  sub?: string;
  href?: string;
  tono?: Tono;
  /** Últimos periodos (el último es el actual). Vacío = tarjeta sin barras. */
  historia?: Punto[];
  /** Sufijo del tooltip de las barras ("pedidos", "m³"…). */
  unidad?: string;
};

/** Serie de tiempo (línea) con media móvil opcional. */
export type Serie = {
  clave: string;
  titulo: string;
  sub?: string;
  puntos: Punto[];
  /** Ventana de la media móvil, en puntos. 0/undefined = sin media. */
  media?: number;
  formato?: Formato;
};

export type Rebanada = { etiqueta: string; valor: number };

/** Dona (composición). Las partes vienen ya ordenadas de mayor a menor. */
export type Dona = {
  clave: string;
  titulo: string;
  sub?: string;
  partes: Rebanada[];
  formato?: Formato;
};

/** Todo lo que el panel necesita pintar, ya scopeado por módulo del usuario. */
export type Analitica = {
  tarjetas: Tarjeta[];
  series: Serie[];
  donas: Dona[];
};
