'use client';
import React, { useState } from "react";
import { motion } from "motion/react";
import { Icon } from "../Icon/Icon";
import { QuantitySelector, QuantitySelectorState } from "../QuantitySelector/QuantitySelector";
import { ToggleCards } from "../ToggleCards/ToggleCards";
import { springs } from "../springs";
import "../QuantitySelector/QuantitySelector.css";

// Orden cíclico de estados del QuantitySelector (Figma prototype)
const QTY_STATE_CYCLE: QuantitySelectorState[] = [
  "pendiente",
  "incompleto",
  "completo",
  "sin-stock",
];

function nextQtyState(s: QuantitySelectorState): QuantitySelectorState {
  const idx = QTY_STATE_CYCLE.indexOf(s);
  return QTY_STATE_CYCLE[(idx + 1) % QTY_STATE_CYCLE.length];
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

export type SummaryCardVisibility = "open" | "close";

export interface SummaryCardProps {
  /** Nombre de la empresa — e.g. "NOVARUM" */
  company?: string;
  /** Código de obra/centro — e.g. "C.01" */
  code?: string;
  /** Número de orden — e.g. "BS000095" */
  orderNumber?: string;
  /** Timestamp legible — e.g. "Ayer 10:25 am" */
  timestamp?: string;
  /** Estado visual del ícono de status (completado / incompleto / pendiente / sin-stock) */
  statusState?: QuantitySelectorState;
  /** open = card expandida (ToggleCards con chevrons), close = card colapsada (arrow down) */
  visibility?: SummaryCardVisibility;
  onClick?: () => void;
}

export function SummaryCard({
  company = "NOVARUM",
  code = "C.01",
  orderNumber = "BS000095",
  timestamp = "Ayer 10:25 am",
  statusState = "completo",
  visibility = "open",
  onClick,
}: SummaryCardProps) {
  return (
    <motion.div
      className={`ds-summary-card ds-summary-card--${visibility}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={springs.snappy}
    >
      {/* Left — info block */}
      <div className="ds-summary-card__info">
        <div className="ds-summary-card__company-block">
          <span className="ds-summary-card__company">{company}</span>
          <span className="ds-summary-card__code">{code}</span>
        </div>
        <span className="ds-summary-card__order">{orderNumber}</span>
        <div className="ds-summary-card__timestamp">
          <Icon name="info" size="sm" color="var(--ds-color-gray-500)" />
          <span className="ds-summary-card__time">{timestamp}</span>
        </div>
      </div>

      {/* Right — status + toggle */}
      <div className="ds-summary-card__actions">
        <Icon
          name={statusState === "completo" ? "completado" : statusState === "sin-stock" ? "sin-stock" : statusState === "incompleto" ? "incompleto" : "pendiente"}
          size="lg"
        />
        <ToggleCards
          size={visibility === "open" ? "big" : "small"}
          visibility={visibility === "open" ? "open" : "close"}
          onClick={onClick}
        />
      </div>
    </motion.div>
  );
}

// ─── MaterialList ─────────────────────────────────────────────────────────────

export interface MaterialListProps {
  /** Descripción del material */
  description: string;
  /** Estado visual del QuantitySelector circular */
  qtyState?: QuantitySelectorState;
  /** Cantidad */
  qty?: number;
  /** Callback opcional cuando se toca el QuantitySelector. Si no se pasa, cicla el estado internamente. */
  onQtyChange?: (qty: number) => void;
  onStateChange?: (state: QuantitySelectorState) => void;
}

export function MaterialList({
  description = "CONECTOR ADAPTADOR HEMBRA EAGLE 110V SALIDA MACHO EAGLE 220V",
  qtyState = "pendiente",
  qty = 1,
  onQtyChange,
  onStateChange,
}: MaterialListProps) {
  // Estado interno solo si no hay control externo
  const [internalState, setInternalState] = useState<QuantitySelectorState>(qtyState);
  const isControlled = onStateChange !== undefined;
  const currentState = isControlled ? qtyState : internalState;

  const handleTap = () => {
    if (onQtyChange) onQtyChange(qty);
    const next = nextQtyState(currentState);
    if (isControlled) onStateChange!(next);
    else setInternalState(next);
  };

  return (
    <div className="ds-material-list">
      <p className="ds-material-list__desc">{description}</p>
      <QuantitySelector
        value={qty}
        state={currentState}
        size="sm"
        onTap={handleTap}
      />
    </div>
  );
}

// ─── DetailCard ───────────────────────────────────────────────────────────────

export interface DetailCardProps {
  company?: string;
  code?: string;
  orderNumber?: string;
  timestamp?: string;
  statusState?: QuantitySelectorState;
  materials?: MaterialListProps[];
}

export function DetailCard({
  company = "NOVARUM",
  code = "C.01",
  orderNumber = "BS000095",
  timestamp = "Ayer 10:25 am",
  statusState = "completo",
  materials = [],
}: DetailCardProps) {
  return (
    <div className="ds-detail-card">
      <SummaryCard
        company={company}
        code={code}
        orderNumber={orderNumber}
        timestamp={timestamp}
        statusState={statusState}
        visibility="open"
      />
      <div className="ds-detail-card__materials">
        {materials.map((m, i) => (
          <MaterialList key={i} {...m} />
        ))}
      </div>
    </div>
  );
}

// ─── Legacy Card ─────────────────────────────────────────────────────────────

export interface CardProps {
  title: string;
  description?: string;
  variant?: "default" | "outlined" | "filled";
  children?: React.ReactNode;
}

/** @deprecated Use SummaryCard, MaterialList, or DetailCard */
export function Card({
  title,
  description,
  variant = "default",
  children,
}: CardProps) {
  return (
    <div className={`ds-card ds-card--${variant}`}>
      <div className="ds-card__header">
        <h3 className="ds-card__title">{title}</h3>
        {description && <p className="ds-card__description">{description}</p>}
      </div>
      {children && <div className="ds-card__body">{children}</div>}
    </div>
  );
}
