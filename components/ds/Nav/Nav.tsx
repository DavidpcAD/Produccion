'use client';
import React from "react";
import { motion } from "motion/react";
import { Icon, IconName } from "../Icon/Icon";
import { springs } from "../springs";

// ─── NavigationControls ───────────────────────────────────────────────────────
// Figma: 65×59 pill (radius 32), white bg always. Pressed: 8px #F3F3F3 border ring.
// Icons: simple chevron-left (back) / chevron-right (go)

export type NavControlState = "standard" | "pressed";
export type NavControlNavigation = "back" | "go";

export interface NavigationControlsProps {
  state?: NavControlState;
  navigation?: NavControlNavigation;
  onClick?: () => void;
}

export function NavigationControls({
  state = "standard",
  navigation = "back",
  onClick,
}: NavigationControlsProps) {
  const iconName = navigation === "back" ? "chevron-left" : "chevron-right";

  return (
    <motion.button
      className={`ds-nav-ctrl ds-nav-ctrl--${state} ds-nav-ctrl--${navigation}`}
      onClick={onClick}
      type="button"
      aria-label={navigation === "back" ? "Atrás" : "Adelante"}
      whileTap={{ scale: 0.94 }}
      transition={springs.snappy}
    >
      <Icon name={iconName} size="lg" color="var(--ds-color-black)" />
    </motion.button>
  );
}

// ─── FilterOptions ────────────────────────────────────────────────────────────
// Figma: 65×59 pill, white bg for normal, BLACK bg for close
// Icons: "filter" for normal, chevron-down for close

export type FilterOptionsState = "standard" | "pressed";
export type FilterOptionsMode = "normal" | "close";

export interface FilterOptionsProps {
  state?: FilterOptionsState;
  mode?: FilterOptionsMode;
  onClick?: () => void;
}

export function FilterOptions({
  state = "standard",
  mode = "normal",
  onClick,
}: FilterOptionsProps) {
  const iconName = mode === "close" ? "chevron-down" : "filter";
  const iconColor = mode === "close" ? "var(--ds-color-white)" : "var(--ds-color-black)";

  return (
    <motion.button
      className={`ds-filter-opt ds-filter-opt--${state} ds-filter-opt--${mode}`}
      onClick={onClick}
      type="button"
      aria-label={mode === "close" ? "Cerrar filtros" : "Filtros"}
      whileTap={{ scale: 0.94 }}
      transition={springs.snappy}
    >
      <Icon name={iconName} size="lg" color={iconColor} />
    </motion.button>
  );
}

// ─── ToggleMenu ───────────────────────────────────────────────────────────────
// Figma: 65×59 pill, white bg for open, BLACK bg for close
// Icons: double chevrons (↕) for open, chevron-down for close

export type ToggleMenuMode = "open" | "close";
export type ToggleMenuState = "standard" | "pressed";

export interface ToggleMenuProps {
  state?: ToggleMenuState;
  mode?: ToggleMenuMode;
  onClick?: () => void;
}

export function ToggleMenu({
  state = "standard",
  mode = "open",
  onClick,
}: ToggleMenuProps) {
  const iconName = mode === "close" ? "chevron-down" : "chevrons-up-down";
  const iconColor = mode === "close" ? "var(--ds-color-white)" : "var(--ds-color-black)";

  return (
    <motion.button
      className={`ds-toggle-menu ds-toggle-menu--${state} ds-toggle-menu--${mode}`}
      onClick={onClick}
      type="button"
      aria-label={mode === "open" ? "Abrir menú" : "Cerrar menú"}
      aria-expanded={mode === "open"}
      whileTap={{ scale: 0.94 }}
      transition={springs.snappy}
    >
      <Icon name={iconName} size="lg" color={iconColor} />
    </motion.button>
  );
}

// ─── Legacy Nav ───────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href?: string;
  icon?: IconName;
  active?: boolean;
  onClick?: () => void;
}

export interface NavProps {
  items?: NavItem[];
  variant?: "sidebar" | "topbar";
}

export function Nav({ items = [], variant = "sidebar" }: NavProps) {
  return (
    <nav className={`ds-nav ds-nav--${variant}`}>
      {items.map((item, i) => (
        <a
          key={i}
          href={item.href ?? "#"}
          className={`ds-nav__item${item.active ? " ds-nav__item--active" : ""}`}
          onClick={(e) => {
            if (!item.href || item.href === "#") e.preventDefault();
            item.onClick?.();
          }}
        >
          {item.icon && <Icon name={item.icon} size="md" />}
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
