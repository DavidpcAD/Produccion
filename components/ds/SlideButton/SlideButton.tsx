'use client';
import React, { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useAnimationControls,
  useMotionValue,
  useTransform,
} from "motion/react";
import { springs } from "../springs";
import { haptic } from "../haptic";
import { Icon } from "../Icon/Icon";
import "./SlideButton.css";

export type SlideButtonMode  = "guardar" | "eliminar";
export type SlideButtonState = "standard" | "pressed";

export interface SlideButtonProps {
  /** Texto centrado en el track (ej. "Pedir", "Confirmar"). */
  label?: string;
  /** Texto cuando se confirma. */
  confirmedLabel?: string;
  /** Cuánto del recorrido necesita el knob para confirmar (0-1). Default 0.72. */
  threshold?: number;
  /** Callback cuando el usuario completa el deslizamiento. */
  onConfirm: () => void;
  /** Bloquea el gesto y atenúa el botón. */
  disabled?: boolean;
  /** Texto alternativo cuando está disabled. */
  disabledLabel?: string;
  /** ms que el estado "confirmado" permanece visible antes de resetear. Default 1800. */
  confirmedHoldMs?: number;
  /** Reset automático después de confirmar. Default true. */
  autoReset?: boolean;
  /** guardar (verde) o eliminar (rojo). Default "guardar". */
  mode?: SlideButtonMode;
  /** Para Storybook: fuerza el halo visible sin interacción. */
  state?: SlideButtonState;
  className?: string;
}

/* Figma node 997-3096 dimensions — full component is 282 wide (242 frame +
 * breathing room for the press halo). Knob is a 80×80 squircle with a
 * right-chevron inside; track is a black rounded rect with "Pedir" centered.
 */
const COMPONENT_WIDTH = 282;
const HEIGHT = 80;
const KNOB_SIZE = 80;

/* Drag mechanics */
const TAP_OFFSET_PX = 4;          /* offsets below this are taps, not drags */
const NUDGE_DISTANCE_PX = 32;
const NUDGE_HOLD_MS = 180;
const NUDGE_KICK = { type: "spring", stiffness: 800, damping: 15 } as const;
const NUDGE_RETURN = { type: "spring", stiffness: 320, damping: 24 } as const;

/**
 * SlideButton — deslizar para confirmar.
 *
 * Figma: 997-3096. Knob 80×80 (chevron-right inside) + black track con
 * "Pedir" centrado.
 *
 * Hot-path discipline (see DESIGN.md / GPU_TRANSFORMS.md):
 *  - Knob position    → motion `x` (GPU translate3d)
 *  - Track reveal     → clip-path `inset(...)` (GPU-composited; the track's
 *                        left edge follows the knob exactly so disarm reads
 *                        as "the bar flows into the knob")
 *  - Label opacity    → useTransform(x)  (no React renders during drag)
 *  - Press halo       → outer stroke on knob, opacity fade (no layout)
 *
 * Gestures:
 *  - Drag ≥ threshold → onConfirm fires, success state holds, auto-resets
 *  - Drag < threshold → snap back via springs.snappy
 *  - Tap (no drag)    → nudge: bouncy kick right + spring back, hints at
 *                        slide-ability for first-time users
 *
 * Haptics: select on touchdown (instant), drag on snap-back, complete on
 * success.
 */
export function SlideButton({
  label = "Pedir",
  confirmedLabel = "Confirmado",
  threshold = 0.72,
  onConfirm,
  disabled = false,
  disabledLabel,
  confirmedHoldMs = 1800,
  autoReset = true,
  mode = "guardar",
  state = "standard",
  className,
}: SlideButtonProps) {
  const reversed = mode === "eliminar";
  const maxDrag = COMPONENT_WIDTH - KNOB_SIZE;

  const x = useMotionValue(reversed ? maxDrag : 0);
  const knobScale = useMotionValue(1);
  const controls = useAnimationControls();
  const [confirmed, setConfirmed] = useState(false);
  const [dragging, setDragging] = useState(false);

  const trackClip = useTransform(x, (v) =>
    reversed
      ? `inset(0 ${maxDrag - v}px 0 0 round 16px)`
      : `inset(0 0 0 ${v}px round 16px)`,
  );

  const labelOpacity = useTransform(x, (v) => {
    if (maxDrag <= 0) return 1;
    const progress = reversed ? (maxDrag - v) / maxDrag : v / maxDrag;
    return Math.max(0, 1 - progress * 1.6);
  });

  const nudgeTimerRef = useRef<number | null>(null);
  const clearNudgeTimer = () => {
    if (nudgeTimerRef.current != null) {
      window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = null;
    }
  };
  useEffect(() => () => clearNudgeTimer(), []);

  const nudge = () => {
    if (disabled || confirmed) return;
    haptic.select();
    clearNudgeTimer();
    const rest = reversed ? maxDrag : 0;
    const nudgeTarget = reversed ? maxDrag - NUDGE_DISTANCE_PX : NUDGE_DISTANCE_PX;
    animate(x, nudgeTarget, NUDGE_KICK);
    animate(knobScale, 1.04, NUDGE_KICK);
    nudgeTimerRef.current = window.setTimeout(() => {
      nudgeTimerRef.current = null;
      animate(x, rest, NUDGE_RETURN);
      animate(knobScale, 1, NUDGE_RETURN);
    }, NUDGE_HOLD_MS);
  };

  const handleDragEnd = (
    _: unknown,
    info: { offset: { x: number } },
  ) => {
    setDragging(false);
    if (disabled) return;

    if (Math.abs(info.offset.x) < TAP_OFFSET_PX) {
      nudge();
      return;
    }

    const progress = reversed ? -info.offset.x / maxDrag : info.offset.x / maxDrag;
    if (progress > threshold) {
      clearNudgeTimer();
      haptic.complete();
      setConfirmed(true);
      controls.start({ x: reversed ? 0 : maxDrag, transition: springs.completing });
      onConfirm();
      if (autoReset) {
        window.setTimeout(() => {
          x.set(reversed ? maxDrag : 0);
          setConfirmed(false);
        }, confirmedHoldMs);
      }
    } else {
      haptic.drag();
      controls.start({ x: reversed ? maxDrag : 0, transition: springs.snappy });
    }
  };

  const visibleLabel = disabled ? (disabledLabel ?? label) : label;
  const visibleConfirmedLabel = reversed && confirmedLabel === "Confirmado" ? "Eliminado" : confirmedLabel;

  return (
    <div
      className={`ds-slide ds-slide--${mode} ds-slide--${state}${disabled ? " ds-slide--disabled" : ""}${className ? ` ${className}` : ""}`}
      style={{ width: COMPONENT_WIDTH, height: HEIGHT }}
      aria-live="polite"
    >
      {/* Black track — visible region tracks the knob's left edge via clip-path. */}
      <motion.div
        aria-hidden
        className="ds-slide__track"
        style={{
          clipPath: trackClip,
          willChange: "clip-path",
          transform: "translateZ(0)",
        }}
      />

      {/* "Pedir" label centered in the track — fades as the knob crosses it. */}
      <motion.span
        aria-hidden
        className="ds-slide__label"
        style={{
          opacity: labelOpacity,
          paddingLeft:  reversed ? 0        : KNOB_SIZE,
          paddingRight: reversed ? KNOB_SIZE : 0,
        }}
      >
        {visibleLabel}
      </motion.span>

      {/* Confirmed overlay — covers the component on success. */}
      <AnimatePresence>
        {confirmed && (
          <motion.div
            key="confirm"
            className="ds-slide__confirm"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={springs.completing}
          >
            <Icon name="check" size="lg" color="currentColor" />
            {visibleConfirmedLabel && <span>{visibleConfirmedLabel}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Knob — fixed 80×80, translates via GPU. */}
      <motion.button
        type="button"
        className="ds-slide__knob"
        drag={confirmed || disabled ? false : "x"}
        dragConstraints={{ left: 0, right: maxDrag }}
        dragElastic={reversed ? { left: 0.15, right: 0.2 } : { left: 0.2, right: 0.15 }}
        dragMomentum={false}
        dragTransition={{ bounceStiffness: 600, bounceDamping: 30 }}
        style={{
          x,
          scale: knobScale,
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          willChange: "transform",
          translateZ: 0,
        }}
        animate={controls}
        onPointerDown={() => {
          if (disabled || confirmed) return;
          haptic.select();
          clearNudgeTimer();
        }}
        onDragStart={() => {
          setDragging(true);
          clearNudgeTimer();
        }}
        onDragEnd={handleDragEnd}
        data-dragging={dragging || undefined}
        aria-label={`Deslizar para ${label.toLowerCase()}`}
        disabled={disabled}
      >
        {/* Press halo — outer ring in green-200, fades in on press */}
        <span aria-hidden className="ds-slide__halo" />
        <Icon name={reversed ? "back" : "arrow-right"} size="lg" color="currentColor" />
      </motion.button>
    </div>
  );
}
