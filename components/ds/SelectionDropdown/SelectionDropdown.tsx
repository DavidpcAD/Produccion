'use client';
import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { springs } from "../springs";
import { haptic } from "../haptic";
import { ToggleCards } from "../ToggleCards/ToggleCards";
import "./SelectionDropdown.css";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SelectionDropdownItem {
  label: string;
  onClick?: () => void;
}

export interface SelectionDropdownProps {
  /** Texto del header cuando nada está seleccionado. Ej: "Tipo de material" */
  label?: string;
  /** Lista de opciones. Cada una se muestra como un pill negro tipo TabsMenu. */
  items?: SelectionDropdownItem[];
  /** Control externo de apertura */
  isOpen?: boolean;
  onToggle?: () => void;
  className?: string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * SelectionDropdown — tarjeta blanca con header (label + ToggleCards)
 * que se expande hacia abajo mostrando opciones tipo TabsMenu.
 *
 * Fiel al Figma Nav section: selectionDropdown
 * - compressed: 70px, blanco, rounded-32, shadow-01, label gris + ToggleCards small
 * - expanded:   header + lista de pills negros 80px
 */
export function SelectionDropdown({
  label = "Label",
  items = [],
  isOpen: isOpenProp,
  onToggle,
  className,
}: SelectionDropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = isOpenProp !== undefined;
  const isOpen = isControlled ? isOpenProp! : internalOpen;

  const toggle = () => {
    haptic.select();
    if (!isControlled) setInternalOpen(!isOpen);
    onToggle?.();
  };

  // Figma: dos contenedores separados con shadow propia.
  //  1. Header card (siempre visible)
  //  2. Items card (solo visible cuando isOpen)
  // Se separan por gap, no por padding interno de un solo card.
  return (
    <div className={`ds-sd${isOpen ? " ds-sd--open" : ""}${className ? ` ${className}` : ""}` }>
      {/* Header card */}
      <div className="ds-sd__header-card">
        <span className="ds-sd__label">{label}</span>
        <ToggleCards
          size="small"
          visibility={isOpen ? "open" : "close"}
          onClick={toggle}
          ariaLabel={isOpen ? "Cerrar opciones" : "Ver opciones"}
        />
      </div>

      {/* Items card — contenedor separado con su propia shadow */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="sd-items-card"
            className="ds-sd__items-wrapper"
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 16 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={springs.expanding}
          >
            <div className="ds-sd__items-card">
              <div className="ds-sd__items-inner">
                {items.map((item, i) => (
                  <motion.button
                    key={i}
                    type="button"
                    className="ds-sd__item"
                    onClick={item.onClick}
                    whileTap={{ scale: 0.97 }}
                    transition={springs.snappy}
                  >
                    {item.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

