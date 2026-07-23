'use client';
import React, { useRef, useState } from "react";
import { Icon, IconName } from "../Icon/Icon";
import { haptic } from "../haptic";

// Must match --ds-radius-xl = 32px
const TABS_RADIUS = 32;
const HALO_WIDTH = 8;
const HALO_COLOR = "rgba(0, 0, 0, 0.8)"; // Figma: 80% opacity black stroke

export type TabsMenuState = "standard" | "pressed";
export type TabsMenuLayout = "label" | "label+icon";

export interface TabsMenuProps {
  label?: string;
  state?: TabsMenuState;
  layout?: TabsMenuLayout;
  /** Icon to show (layout must include icon) */
  icon?: IconName;
  onClick?: () => void;
}

export function TabsMenu({
  label = "Tab",
  state = "standard",
  layout = "label",
  icon = "home",
  onClick,
}: TabsMenuProps) {
  const showIcon = layout === "label+icon";
  const [pressed, setPressed] = useState(false);
  const cancelled = useRef(false);

  return (
    <button
      className={`ds-tabs-menu ds-tabs-menu--${state} ds-tabs-menu--${layout.replace("+", "-")}`}
      type="button"
      aria-pressed={state === "pressed"}
      style={{
        position: "relative",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        cancelled.current = false;
        setPressed(true);
        haptic.select();
      }}
      onPointerUp={() => {
        setPressed(false);
        if (!cancelled.current) {
          setTimeout(() => onClick?.(), 100);
        }
      }}
      onPointerLeave={() => {
        if (pressed) {
          cancelled.current = true;
          setPressed(false);
        }
      }}
      onPointerCancel={() => {
        cancelled.current = true;
        setPressed(false);
      }}
    >
      {showIcon && (
        <span className="ds-tabs-menu__icon">
          <Icon name={icon} size="lg" color="var(--ds-color-white)" />
        </span>
      )}
      <span className="ds-tabs-menu__label">{label}</span>

      {/* Halo overlay — 80ms in / 180ms out 120ms hold */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: -HALO_WIDTH,
          borderRadius: TABS_RADIUS + HALO_WIDTH,
          border: `${HALO_WIDTH}px solid ${HALO_COLOR}`,
          pointerEvents: "none",
          opacity: pressed ? 1 : 0,
          transition: pressed
            ? "opacity 80ms ease-out"
            : "opacity 180ms ease-out 120ms",
        }}
      />
    </button>
  );
}

// ─── TabFilterBar ─────────────────────────────────────────────────────────────
// The horizontal filter bar with multiple TabFilterChip items

export type TabFilterChipState = "active" | "disabled";

export interface TabFilterChipProps {
  label?: string;
  state?: TabFilterChipState;
  icon?: IconName;
  showIcon?: boolean;
  onClick?: () => void;
}

export function TabFilterChip({
  label = "Filtro",
  state = "active",
  icon = "check",
  showIcon = true,
  onClick,
}: TabFilterChipProps) {
  const isDisabled = state === "disabled";
  const [pressed, setPressed] = useState(false);
  const cancelled = useRef(false);

  return (
    <button
      className={`ds-filter-chip ds-filter-chip--${state}`}
      type="button"
      disabled={isDisabled}
      style={{
        position: "relative",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
      onPointerDown={(e) => {
        if (isDisabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        cancelled.current = false;
        setPressed(true);
        haptic.select();
      }}
      onPointerUp={() => {
        if (isDisabled) return;
        setPressed(false);
        if (!cancelled.current) {
          setTimeout(() => onClick?.(), 100);
        }
      }}
      onPointerLeave={() => {
        if (pressed) {
          cancelled.current = true;
          setPressed(false);
        }
      }}
      onPointerCancel={() => {
        cancelled.current = true;
        setPressed(false);
      }}
    >
      <span className="ds-filter-chip__label">{label}</span>
      {showIcon && (
        <Icon
          name={icon}
          size="md"
          color={state === "active" ? "var(--ds-color-white)" : "var(--ds-color-gray-300)"}
        />
      )}

      {/* Halo overlay */}
      {!isDisabled && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: -HALO_WIDTH,
            borderRadius: TABS_RADIUS + HALO_WIDTH,
            border: `${HALO_WIDTH}px solid ${HALO_COLOR}`,
            pointerEvents: "none",
            opacity: pressed ? 1 : 0,
            transition: pressed
              ? "opacity 80ms ease-out"
              : "opacity 180ms ease-out 120ms",
          }}
        />
      )}
    </button>
  );
}

export interface FilterBarProps {
  chips?: TabFilterChipProps[];
}

export function FilterBar({ chips = [] }: FilterBarProps) {
  return (
    <div className="ds-filter-bar">
      {chips.map((chip, i) => (
        <TabFilterChip key={i} {...chip} />
      ))}
    </div>
  );
}
