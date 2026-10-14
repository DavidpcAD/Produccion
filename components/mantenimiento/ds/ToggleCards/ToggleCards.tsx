import React, { useEffect, useRef, useState } from "react";
import "./ToggleCards.css";
import { Button } from "../Button/Button";
import { Icon, type IconName } from "../Icon/Icon";

export type ToggleCardsState = "standard" | "pressed";
export type ToggleCardsMode = "normal" | "disabled";
export type ToggleCardsSize = "big" | "small";
export type ToggleCardsVisibility = "open" | "close";

export interface ToggleCardsProps {
  state?: ToggleCardsState;
  mode?: ToggleCardsMode;
  size?: ToggleCardsSize;
  visibility?: ToggleCardsVisibility;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
}

const SIZE_STYLES: Record<ToggleCardsSize, React.CSSProperties> = {
  big:   { width: 60, height: 88, borderRadius: "var(--ds-radius-lg)" },
  small: { width: 60, height: 50, borderRadius: "var(--ds-radius-lg)" },
};

/**
 * ToggleCards — the black squircle toggle used on SelectionDropdown and
 * on UserCard chevrons.
 *
 * Each tap **spins the icon one full rotation** (360°) and swaps the
 * icon source at the midpoint of the spin. Both states land at a
 * multiple of 360° → the icon is rendered at its natural, un-rotated
 * orientation in both rest positions:
 *
 *   • visibility = "open"  → `open` icon (vertical chevron pair, `≷`)
 *     at rotation 0 mod 360°.
 *   • visibility = "close" → `close` icon (chevron-down + bar below,
 *     `∨_`) at rotation 0 mod 360°.
 *
 * Math: each visibility change adds `360°`. Rotation accumulates
 * monotonically — the icon spins in the same direction on every toggle,
 * never reversing visually. The icon source swaps at the midpoint
 * (~SWAP_AT_MS into SPIN_DURATION_MS), so the user sees the outgoing
 * glyph spin halfway out and the incoming glyph spin the rest of the
 * way in, landing un-rotated.
 *
 * No fade, no 3D — pure 2D CSS transform interpolation.
 */
const SPIN_DURATION_MS = 540;
const SWAP_AT_MS = 270; // 50 % of SPIN_DURATION_MS
const SPIN_DELTA_DEG = 540; // 1.5 spins per toggle — close lands at 180° visual

export function ToggleCards({
  mode = "normal",
  size = "big",
  visibility = "open",
  onClick,
  ariaLabel,
}: ToggleCardsProps) {
  // Monotonically-increasing rotation. Both states rest at multiples
  // of 360° → the icon is at its natural orientation in either state.
  const [rotation, setRotation] = useState(0);
  // The icon currently rendered. Lags the visibility prop by SWAP_AT_MS
  // so the swap happens at the midpoint of the spin.
  const [displayedIcon, setDisplayedIcon] = useState<IconName>(
    visibility === "close" ? "close" : "open",
  );
  const prevVisibility = useRef<ToggleCardsVisibility>(visibility);

  useEffect(() => {
    if (prevVisibility.current === visibility) return;

    setRotation((prev) => prev + SPIN_DELTA_DEG);

    const swapTimer = window.setTimeout(() => {
      setDisplayedIcon(visibility === "close" ? "close" : "open");
    }, SWAP_AT_MS);

    prevVisibility.current = visibility;
    return () => window.clearTimeout(swapTimer);
  }, [visibility]);

  return (
    <Button
      layout="icon"
      color={mode === "disabled" ? "gray" : "black"}
      state={mode === "disabled" ? "disabled" : "standard"}
      style={SIZE_STYLES[size]}
      ariaLabel={ariaLabel ?? (visibility === "open" ? "Cerrar card" : "Abrir card")}
      onClick={onClick}
    >
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `rotate(${rotation}deg)`,
          transition: `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
        }}
      >
        <Icon name={displayedIcon} size="md" color="currentColor" />
      </span>
    </Button>
  );
}
