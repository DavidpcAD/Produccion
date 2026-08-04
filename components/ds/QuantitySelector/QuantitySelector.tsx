'use client';
import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { springs } from "../springs";
import { haptic } from "../haptic";
import "./QuantitySelector.css";


/**
 * Estados visuales del pill, mirror del Figma `quantitySelector`:
 *   - pendiente:  gris, sin anillo — todavía no se registró
 *   - incompleto: anillo amarillo en el lado derecho (mitad) — faltan materiales
 *   - completo:   anillo verde completo — están todos
 *   - sin-stock:  anillo rojo completo — no hay disponible
 *
 * Aliases backward-compatible (mapean a los nombres viejos del DS):
 *   - default → incompleto, ok → completo, alert → sin-stock
 */
export type QuantitySelectorState =
  | "pendiente"
  | "incompleto"
  | "completo"
  | "sin-stock"
  | "default"
  | "ok"
  | "alert";

export type QuantitySelectorMode = "standard" | "pressed";

export interface QuantitySelectorProps {
  /** Cantidad a mostrar dentro del círculo */
  value: number;
  /** Estado visual del anillo (mirror del Figma `quantitySelector.state`). Default "pendiente" (sin anillo). */
  state?: QuantitySelectorState;
  /** Modo visual. "pressed" agrega halo; también se aplica auto en :active si onTap se da. */
  mode?: QuantitySelectorMode;
  /** Tamaño: sm=49px (default), md=64px, lg=96px */
  size?: "sm" | "md" | "lg";
  /** Si se pasa, el pill es tappable y dispara este callback */
  onTap?: () => void;
  /** Aria label custom; si no se da, se compone automáticamente */
  ariaLabel?: string;
  className?: string;
}

/** Mapping del nombre viejo al nuevo. La CSS solo tiene clases para los 4 nuevos. */
const STATE_RESOLVED: Record<QuantitySelectorState, string> = {
  pendiente: "pendiente",
  incompleto: "incompleto",
  completo: "completo",
  "sin-stock": "sin-stock",
  default: "incompleto",
  ok: "completo",
  alert: "sin-stock",
};

/**
 * QuantitySelector — pill circular con anillo de variante + número, mirror del Figma quantitySelector.
 *
 * Estructura visual (3 capas):
 *   __outer:  disco gray-200 (49x49 en sm)
 *   __ring:   border colorido por variant — overlay sobre el outer
 *   __inner:  círculo negro (35x35 en sm) con el número
 *
 * Si se pasa `onTap`, es interactivo (botón con press animation y halo en :active).
 * Si no, es decorativo (span).
 */
export function QuantitySelector({
  value,
  state = "pendiente",
  mode = "standard",
  size = "sm",
  onTap,
  ariaLabel,
  className,
}: QuantitySelectorProps) {
  const resolved = STATE_RESOLVED[state];
  const classes = `ds-qty-selector ds-qty-selector--${resolved} ds-qty-selector--${mode} ds-qty-selector--${size}${className ? ` ${className}` : ""}`;

  const inner = (
    <>
      <span className="ds-qty-selector__outer" aria-hidden />
      <span className="ds-qty-selector__ring" aria-hidden />
      <span className="ds-qty-selector__inner">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            className="ds-qty-selector__value"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={springs.snappy}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
    </>
  );

  if (onTap) {
    return (
      <button
        type="button"
        className={classes}
        onClick={() => { haptic.select(); onTap(); }}
        aria-label={ariaLabel ?? `Cantidad ${value}`}
      >
        {inner}
      </button>
    );
  }

  return (
    <span className={classes} aria-label={ariaLabel} aria-hidden={!ariaLabel}>
      {inner}
    </span>
  );
}
