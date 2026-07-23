'use client';
import React, { useRef, useState } from "react";
import { Icon, IconName } from "../Icon/Icon";
import { haptic } from "../haptic";

// Figma pressed stroke colors — exact from setButtons component set (node 434-2434)
const HALO_COLOR: Record<ButtonColor, string> = {
  green: "rgb(136, 160, 36)",      // #88A024 — green-200
  black: "rgba(0, 0, 0, 0.8)",    // black at 80% opacity (Figma)
  white: "rgb(243, 243, 243)",     // #F3F3F3 — surface
  red:   "rgb(201, 108, 108)",     // #C96C6C — red-100
  gray:  "rgb(235, 235, 235)",     // #EBEBEB — gray-100
};

// Figma stroke widths: all 8px except gray (disabled) which is 2px
const HALO_WIDTH_MAP: Record<ButtonColor, number> = {
  green: 8,
  black: 8,
  white: 8,
  red:   8,
  gray:  2,
};

// Figma pressed body color overrides (only red changes during press)
const PRESSED_BG: Partial<Record<ButtonColor, string>> = {
  red: "rgb(187, 74, 74)", // #BB4A4A — red-200
};

// border-radius del halo según size + layout + per-color width
// sm+icon → círculo de 44px → radio = 22px → halo = 22+w
// sm+label → pill → radius-xl = 32px → halo = 32+w
// md+icon  → cuadrado 56px → radius-lg = 16px → halo = 16+w
// md+label → mismo
function haloRadius(size: ButtonSize, layout: ButtonLayout, w: number): number {
  if (size === "sm" && layout === "icon") return 22 + w;
  if (size === "sm") return 32 + w;
  return 16 + w;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Background color / semantic intent of the button */
export type ButtonColor = "green" | "red" | "white" | "black" | "gray";

/** Which side (if any) to place the icon */
export type ButtonLayout = "label" | "icon-left" | "icon-right" | "icon";

export type ButtonState = "standard" | "pressed" | "disabled";

/** md = 56px (default), sm = 44px compacto */
export type ButtonSize = "md" | "sm";

// Legacy compat
export type ButtonVariant = "primary" | "secondary" | "disabled";

export interface ButtonProps {
  /** Button label text */
  label?: string;
  /** Background color — maps directly to Figma Color prop */
  color?: ButtonColor;
  /** Icon placement */
  layout?: ButtonLayout;
  /** Icon name (from Icon component) */
  icon?: IconName;
  /** Interaction state */
  state?: ButtonState;
  /** md = 56 px (default) · sm = 44 px compacto, sombra ligera */
  size?: ButtonSize;
  /** @deprecated Use color instead */
  variant?: ButtonVariant;
  onClick?: () => void;
  /** Full-width block */
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  style?: React.CSSProperties;
  ariaLabel?: string;
  /**
   * Override the icon + label content with a custom node. Useful when a
   * consumer needs to animate the icon swap (e.g. ToggleCards crossfade)
   * but wants to keep the DS halo + haptic + sizing. If provided, the
   * `icon` and `label` props are ignored.
   */
  children?: React.ReactNode;
}

// Map legacy variant → color
const VARIANT_COLOR: Record<ButtonVariant, ButtonColor> = {
  primary: "green",
  secondary: "black",
  disabled: "gray",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Button({
  label = "Button",
  color,
  layout = "label",
  icon,
  state = "standard",
  size = "md",
  variant,
  onClick,
  fullWidth = false,
  type = "button",
  style,
  ariaLabel,
  children,
}: ButtonProps) {
  // Resolve color: explicit prop wins, then legacy variant, then default
  const resolvedColor: ButtonColor =
    color ?? (variant ? VARIANT_COLOR[variant] : "green");

  const isDisabled = state === "disabled" || resolvedColor === "gray";

  const classes = [
    "ds-btn",
    `ds-btn--${resolvedColor}`,
    `ds-btn--${state}`,
    `ds-btn--${size}`,
    layout !== "label" ? `ds-btn--layout-${layout}` : "",
    fullWidth ? "ds-btn--full" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const iconEl = icon ? (
    <Icon name={icon} size="md" color="currentColor" />
  ) : null;

  const [pressed, setPressed] = useState(false);
  const cancelled = useRef(false);

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-label={ariaLabel}
      style={{
        position: "relative",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
        ...style,
        ...(pressed && PRESSED_BG[resolvedColor]
          ? { backgroundColor: PRESSED_BG[resolvedColor] }
          : {}),
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
      {children ?? (
        <>
          {(layout === "icon-left" || layout === "icon") && iconEl}
          {layout !== "icon" && label && (
            <span className="ds-btn__label">{label}</span>
          )}
          {layout === "icon-right" && iconEl}
        </>
      )}

      {/* Halo overlay — 80ms in / 180ms out 120ms hold. Sits OUTSIDE the button. */}
      {!isDisabled && (() => {
        const hw = HALO_WIDTH_MAP[resolvedColor];
        return (
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: -hw,
              borderRadius: haloRadius(size, layout, hw),
              border: `${hw}px solid ${HALO_COLOR[resolvedColor]}`,
              pointerEvents: "none",
              opacity: pressed ? 1 : 0,
              transition: pressed
                ? "opacity 80ms ease-out"
                : "opacity 180ms ease-out 120ms",
            }}
          />
        );
      })()}
    </button>
  );
}