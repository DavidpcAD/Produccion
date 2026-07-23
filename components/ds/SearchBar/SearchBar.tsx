'use client';
import React from "react";
import { motion } from "motion/react";
import { springs } from "../springs";
import { Icon } from "../Icon/Icon";
import "./SearchBar.css";

export type SearchBarLayout = "label" | "normal" | "icon" | "expanded";
export type SearchBarState = "standard" | "pressed";

export interface SearchSuggestion {
  id: string | number;
  /** Texto a mostrar; el match con `value` se renderiza en semibold */
  name: string;
}

export interface SearchBarProps {
  layout?: SearchBarLayout;
  state?: SearchBarState;
  /** Aplica a layout="label" | "normal" | "expanded" */
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Cuando layout="icon", al tappar dispara este callback */
  onClick?: () => void;
  /** Override total del slot derecho. Si no se da y `onClose` está seteado, se renderiza el botón cerrar default */
  rightSlot?: React.ReactNode;
  /** Si se pasa, renderiza el botón cerrar (X gris) en el slot derecho */
  onClose?: () => void;
  /** Solo aplica con layout="expanded" — sugerencias filtradas a renderizar bajo el input */
  suggestions?: SearchSuggestion[];
  /** Callback cuando se selecciona una sugerencia (layout="expanded") */
  onPick?: (s: SearchSuggestion) => void;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  ariaLabel?: string;
}

/**
 * SearchBar — alineado al Figma. Cinco variantes:
 *  - layout="icon"               → botón circular (65px) con lupa, tap dispara onClick
 *  - layout="icon" + state=pressed → mismo botón con shadow más fuerte
 *  - layout="normal"             → pill sin texto (input vacío)
 *  - layout="label"              → pill con texto y opcional close (rightSlot u onClose)
 *  - layout="expanded"           → pill + panel de sugerencias adjunto debajo
 */
export function SearchBar({
  layout = "label",
  state = "standard",
  placeholder = "Buscar",
  value,
  onChange,
  onClick,
  rightSlot,
  onClose,
  suggestions,
  onPick,
  className,
  inputRef,
  onKeyDown,
  onFocus,
  onBlur,
  ariaLabel,
}: SearchBarProps) {
  if (layout === "icon") {
    return (
      <motion.button
        type="button"
        className={`ds-search ds-search--icon ds-search--${state}${className ? ` ${className}` : ""}`}
        onClick={onClick}
        whileTap={{ scale: 0.96 }}
        transition={springs.snappy}
        aria-label={ariaLabel ?? "Abrir búsqueda"}
      >
        <Icon name="search" size="lg" color="currentColor" />
      </motion.button>
    );
  }

  const right = rightSlot ?? (onClose ? <CloseButton onClick={onClose} /> : null);

  const pill = (
    <div className={`ds-search ds-search--${layout} ds-search--${state}`}>
      <span className="ds-search__icon" aria-hidden>
        <Icon name="search" size="lg" color="currentColor" />
      </span>
      <input
        ref={inputRef}
        className="ds-search__input"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label={ariaLabel ?? "Buscar"}
      />
      {right && <span className="ds-search__right">{right}</span>}
    </div>
  );

  if (layout !== "expanded") {
    return <div className={`ds-search-shell${className ? ` ${className}` : ""}`}>{pill}</div>;
  }

  return (
    <div className={`ds-search-shell ds-search-shell--expanded${className ? ` ${className}` : ""}`}>
      {pill}
      {suggestions && suggestions.length > 0 && (
        <ul className="ds-search__panel" role="listbox">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="ds-search__hit"
                onClick={() => onPick?.(s)}
                role="option"
              >
                <span className="ds-search__hit-name">{highlightMatch(s.name, value)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Resalta el match de `query` dentro de `text` con semibold (Figma). */
function highlightMatch(text: string, query?: string): React.ReactNode {
  const q = (query ?? "").trim();
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <strong className="ds-search__match">{text.slice(i, i + q.length)}</strong>
      {text.slice(i + q.length)}
    </>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="ds-search__close"
      onClick={onClick}
      aria-label="Cerrar"
    >
      <Icon name="close" size="md" color="currentColor" />
    </button>
  );
}