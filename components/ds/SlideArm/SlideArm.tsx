'use client';
import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "../Icon/Icon";
import { springs } from "../springs";
import { haptic } from "../haptic";
import { SlideToConfirm } from "../SlideToConfirm/SlideToConfirm";
import "./SlideArm.css";

/**
 * SlideArm — port of P2/Components/PedirBar.swift (the arming wrapper).
 *
 * Tap the compact green pill to "arm" the slider: the bar grows from the
 * trailing edge into a full-width slider, with a cancel X popping in above.
 * Tap cancel or drag-to-confirm to disarm — both reverse the morph.
 *
 * Behavior parity:
 *   • Collapsed: a compact green pill at the trailing edge (collapsedWidth × height).
 *   • Armed: full-width SlideToConfirm + cancel X above (16 px above bar's
 *     top, 24 px from trailing edge).
 *   • Arm:    springs.expanding  on width; cancel X scales-in via springs.popping
 *             (anchor bottom-right so it reads as emerging from the bar corner).
 *   • Disarm: springs.shrinking  on width (near-critically damped — no overshoot
 *             below the collapsedWidth target); cancel X exits with springs.popping.
 *   • The SlideToConfirm is ALWAYS mounted. Its `enabled` prop gates the
 *     gesture so the visible knob is the same DOM node across both states —
 *     no crossfade glitch.
 *   • Tap-to-arm: a transparent halo-press surface sits on top of the
 *     collapsed knob. It intercepts the tap, fires the green halo for the
 *     80 / 180 / 120 ms window, then arms (100 ms onClick delay).
 *
 * Sharp edge: if any ancestor has `overflow: hidden`, the cancel X's
 * pop-in halo and the green tap halo will clip.
 *
 */

const HALO_GREEN = "rgb(133, 166, 41)";
const HALO_BLACK = "rgb(140, 140, 140)";
const HALO_WIDTH = 8;
const PRESS_DELAY_MS = 100;

export interface SlideArmProps {
  label?: string;
  collapsedWidth?: number;
  height?: number;
  cornerRadius?: number;
  onConfirm: () => void;
  /**
   * How long the success state holds before `onConfirm` fires and the
   * SlideArm disarms. Default 800 ms. Bubbles through to the inner
   * SlideToConfirm — keep them in sync.
   */
  successHoldMs?: number;
  className?: string;
}

export function SlideArm({
  label = "PEDIR",
  collapsedWidth = 160,
  height = 80,
  cornerRadius = 24,
  onConfirm,
  successHoldMs = 800,
  className,
}: SlideArmProps) {
  const [isArmed, setIsArmed] = useState(false);

  const arm = () => setIsArmed(true);
  const disarm = () => setIsArmed(false);

  return (
    <div className={`ds-sa${className ? ` ${className}` : ""}`}>
      {/* Cancel X — above the bar, trailing. Only when armed. */}
      <AnimatePresence>
        {isArmed && (
          <motion.div
            initial={{ scale: 0.01, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.01, opacity: 0 }}
            transition={springs.popping}
            className="ds-sa__cancel"
            style={{
              right: 24,
              bottom: height + 16,
              transformOrigin: "bottom right",
            }}
          >
            <HaloPress
              onActivate={disarm}
              cornerRadius={20}
              haloColor={HALO_BLACK}
              ariaLabel="Cancelar"
              style={{
                width: 60,
                height: 40,
                background: "var(--ds-color-black)",
                color: "var(--ds-color-white)",
                borderRadius: 20,
              }}
            >
              {/* DS Icon registry has no X glyph — `close` paints a
                  chevron-down. Rotate `plus` 45° to draw a true X.
                  Promotion candidate: add an `x` (or `close-x`) icon to
                  react/Icon/Icon.tsx. */}
              <span
                aria-hidden
                style={{ display: "inline-flex", transform: "rotate(45deg)" }}
              >
                <Icon name="plus" size="sm" color="currentColor" />
              </span>
            </HaloPress>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bar shell — anchored TRAILING, width morphs collapsed ⇄ full.
          `initial` is explicit so motion doesn't read 100% from the DOM
          (the child SlideToConfirm has width:100%) on first mount. */}
      <motion.div
        initial={{ width: collapsedWidth }}
        animate={{ width: isArmed ? "100%" : collapsedWidth }}
        // losa.md §5: open with `expanding`, close with `shrinking`.
        transition={isArmed ? springs.expanding : springs.shrinking}
        className="ds-sa__shell"
        style={{ height }}
      >
        <SlideToConfirm
          label={label}
          knobWidth={collapsedWidth}
          height={height}
          cornerRadius={cornerRadius}
          enabled={isArmed}
          successHoldMs={successHoldMs}
          onConfirm={() => {
            // SlideToConfirm already lingered for successHoldMs before
            // firing onConfirm — disarm immediately so the SlideArm
            // doesn't double-wait. A consumer that wants to keep the
            // SlideArm visible after the parent action (e.g. a toast)
            // can rely on the slider's brief settling animation +
            // disarm transition reading as one continuous "done" beat.
            onConfirm();
            disarm();
          }}
        />

        {/* Tap-to-arm intercept. Sits on top of the slider's knob only while
            collapsed, so the halo fires before the slider's pointer handlers
            ever see the tap. */}
        {!isArmed && (
          <HaloPress
            onActivate={arm}
            cornerRadius={cornerRadius}
            haloColor={HALO_GREEN}
            ariaLabel={`Armar ${label}`}
            style={{
              position: "absolute",
              inset: 0,
              background: "transparent",
              borderRadius: cornerRadius,
            }}
          />
        )}
      </motion.div>
    </div>
  );
}

/* ─── Local halo-press shim ────────────────────────────────────
 *
 * The DS `Button` always paints a colored fill — there's no ghost variant
 * that's transparent-but-haloed. This local primitive supplies just the
 * halo press contract (80/180/120 timing + 100 ms onClick delay + haptic
 * on touchdown) so SlideArm can have the green tap-halo on its collapsed
 * pill and the black halo on the cancel X without forcing a fill.
 *
 * Promote to `react/PressableSurface/` if another component needs the
 * same "halo only, fill from caller" behavior.
 */
function HaloPress({
  onActivate,
  cornerRadius,
  haloColor,
  ariaLabel,
  style,
  children,
}: {
  onActivate: () => void;
  cornerRadius: number;
  haloColor: string;
  ariaLabel: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={() => {
        setPressed(true);
        haptic.select();
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onClick={() => window.setTimeout(onActivate, PRESS_DELAY_MS)}
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        border:         0,
        padding:        0,
        margin:         0,
        cursor:         "pointer",
        outline:        "none",
        WebkitTapHighlightColor: "transparent",
        userSelect:     "none",
        touchAction:    "manipulation",
        position:       "relative",
        ...style,
      }}
    >
      {children}
      <span
        aria-hidden
        style={{
          position:      "absolute",
          inset:         -HALO_WIDTH / 2,
          borderRadius:  cornerRadius + HALO_WIDTH / 2,
          border:        `${HALO_WIDTH}px solid ${haloColor}`,
          pointerEvents: "none",
          opacity:       pressed ? 1 : 0,
          transition:    pressed
            ? "opacity 80ms ease-out 0ms"
            : "opacity 180ms ease-out 120ms",
        }}
      />
    </button>
  );
}
