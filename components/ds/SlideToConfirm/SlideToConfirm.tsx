'use client';
import React, { useEffect, useRef, useState } from "react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import { Icon } from "../Icon/Icon";
import { springs } from "../springs";
import { haptic } from "../haptic";
import "./SlideToConfirm.css";

/**
 * SlideToConfirm — port of P2/Components/SlideToConfirm.swift.
 *
 * The green knob grows with drag; the black track shows a trailing chevron
 * hint that dims as you slide. Past the threshold, commit slams with a
 * slight overshoot via springs.completing and auto-resets after the success
 * hold via springs.settling.
 *
 * Behavior parity (each row testable against the SwiftUI original):
 *   • Knob width grows with drag  → useTransform(dragX, x => knobWidth + x)
 *   • Rubber-band past 0          → raw × 0.25
 *   • Rubber-band past maxDrag    → max + (raw - max) × 0.2
 *   • Quarter-progress haptics    → ticks at p=0.25 / 0.50 / 0.75 (not at 0 or 1)
 *   • Tap nudge (drag < 4 px)     → +52 px popping → settle back
 *   • Snap back below threshold   → springs.snappy
 *   • Commit slam                 → springs.completing (slight overshoot)
 *   • Auto-reset                  → springs.settling after successHoldMs
 *   • Idle hint bob               → 4 px leftward, 1.1 s easeInOut, infinite
 *   • Pressed lift                → scale 1.02 + heavier shadow
 *
 * Sharp edges:
 *   1. `touch-action: none` on the container (already set) — otherwise
 *      mobile pan-y kills the drag mid-gesture.
 *   2. Pointer capture on the knob — finger drifts outside? Capture keeps
 *      pointermove flowing. Matches iOS gesture stickiness.
 *   3. ResizeObserver on the container — rotation / resize must recompute
 *      maxDrag, otherwise threshold math is wrong.
 *
 * NOT a drop-in replacement for `SlideButton` (which has a fixed-position
 * knob and a wide black track with the label centered). This one grows the
 * knob itself and is meant to be wrapped by `SlideArm` for the "tap a
 * button, it grows into a slider" interaction.
 */

const HINT_BOB_DURATION_S = 1.1;
const NUDGE_KICK_PX = 52;
const NUDGE_HOLD_MS = 180;
const TAP_OFFSET_PX = 4;

export interface SlideToConfirmProps {
  /** Label shown inside the knob at rest. */
  label?: string;
  /** Fires when the user drags past `threshold` and releases. */
  onConfirm: () => void;
  /** Knob at-rest width, px. The pill grows from this. Default 160. */
  knobWidth?: number;
  /** Fraction of available drag past which release commits (0..1). Default 0.72. */
  threshold?: number;
  /** Track + knob height, px. Default 80. */
  height?: number;
  /** Corner radius, px. Default 24. */
  cornerRadius?: number;
  /**
   * Hold the checkmark this long (ms) before firing `onConfirm` and
   * auto-resetting. Default 800. Half the old 1600 ms — long enough to
   * register the success state, short enough not to feel sluggish when
   * the parent reacts (sheet close, navigation, etc).
   */
  successHoldMs?: number;
  /** When false, pointer input is ignored (used by SlideArm while collapsed). */
  enabled?: boolean;
  className?: string;
}

export function SlideToConfirm({
  label = "PEDIR",
  onConfirm,
  knobWidth = 160,
  threshold = 0.72,
  height = 80,
  cornerRadius = 24,
  successHoldMs = 800,
  enabled = true,
  className,
}: SlideToConfirmProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // dragX = delta past knobWidth. MotionValue so the knob's width updates
  // without React re-renders.
  const dragX = useMotionValue(0);

  // Knob's live width — anchored leading, grows with dragX.
  const knobLiveWidth = useTransform(dragX, (x) => knobWidth + x);

  // Available drag = container.width - knobWidth.
  const [maxDrag, setMaxDrag] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Hint chevron in the track fades from 0.22 → 0 as the knob crosses it.
  const hintOpacity = useTransform(dragX, (x) => {
    const p = Math.min(1, Math.max(0, x / Math.max(1, maxDrag)));
    return 0.22 * (1 - p);
  });

  // Inner chevron inside the knob fades 1 → 0.4 across the drag.
  const innerChevronOpacity = useTransform(dragX, (x) => {
    const p = Math.min(1, Math.max(0, x / Math.max(1, maxDrag)));
    return 1 - p * 0.6;
  });

  const pointerStartRef = useRef(0);
  const lastTickRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setMaxDrag(Math.max(0, el.getBoundingClientRect().width - knobWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [knobWidth]);

  // 0.25× past 0 going negative, 0.2× past maxDrag going positive.
  const rubberBand = (raw: number, max: number) => {
    if (raw < 0) return raw * 0.25;
    if (raw > max) return max + (raw - max) * 0.2;
    return raw;
  };

  // Quarter-progress haptics: ticks at p=0.25 / 0.50 / 0.75 only.
  const tickHaptic = (progress: number) => {
    const stage = Math.floor(progress * 4);
    if (stage !== lastTickRef.current && stage > 0 && stage < 4) {
      haptic.drag();
      lastTickRef.current = stage;
    }
  };

  const snapBack = () => {
    animate(dragX, 0, springs.snappy);
    lastTickRef.current = 0;
  };

  const commit = () => {
    haptic.complete();
    animate(dragX, maxDrag, springs.completing);
    setIsConfirmed(true);
    // Linger: keep the checkmark visible for `successHoldMs` so the user
    // sees the success state before downstream actions (closing a sheet,
    // navigating, etc.) tear the slider down. If `onConfirm` fired
    // immediately, a parent that closes-on-success would unmount the
    // slider before the check ever rendered. Firing here, AFTER the
    // hold, gives consumers a clean "the user saw it" guarantee.
    window.setTimeout(() => {
      onConfirm();
      animate(dragX, 0, springs.settling);
      setIsConfirmed(false);
      lastTickRef.current = 0;
    }, successHoldMs);
  };

  const nudge = () => {
    haptic.select();
    animate(dragX, NUDGE_KICK_PX, springs.popping);
    window.setTimeout(() => animate(dragX, 0, springs.settling), NUDGE_HOLD_MS);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || isConfirmed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStartRef.current = e.clientX - dragX.get();
    setIsDragging(true);
    haptic.select();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || isConfirmed) return;
    const raw = e.clientX - pointerStartRef.current;
    const banded = rubberBand(raw, maxDrag);
    dragX.set(banded);
    const progress = Math.max(0, Math.min(1, banded / Math.max(1, maxDrag)));
    tickHaptic(progress);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (isConfirmed) return;
    const x = dragX.get();
    if (Math.abs(x) < TAP_OFFSET_PX) {
      nudge();
      return;
    }
    if (x / Math.max(1, maxDrag) >= threshold) commit();
    else snapBack();
  };

  return (
    <div
      ref={containerRef}
      className={`ds-stc${className ? ` ${className}` : ""}`}
      style={{ height }}
    >
      <div
        className="ds-stc__track"
        style={{ borderRadius: cornerRadius }}
      >
        <motion.div
          aria-hidden
          className="ds-stc__hint"
          style={{ opacity: hintOpacity }}
          animate={isDragging ? { x: 0 } : { x: [-4, 0, -4] }}
          transition={
            isDragging
              ? { duration: 0 }
              : { duration: HINT_BOB_DURATION_S, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <Icon name="arrow-right" size="lg" color="currentColor" />
        </motion.div>
      </div>

      <motion.div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="ds-stc__knob"
        style={{
          height,
          width: knobLiveWidth,
          borderRadius: cornerRadius,
          cursor: enabled ? (isDragging ? "grabbing" : "grab") : "default",
          boxShadow: isDragging
            ? "0 8px 14px rgba(0,0,0,0.18)"
            : "0 3px 6px rgba(0,0,0,0.08)",
        }}
        animate={{ scale: isDragging ? 1.02 : 1 }}
        transition={springs.snappy}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isConfirmed ? (
            <motion.div
              key="check"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={springs.completing}
              className="ds-stc__check"
            >
              <Icon name="check" size="lg" color="currentColor" />
            </motion.div>
          ) : (
            <motion.div
              key="label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="ds-stc__label"
            >
              <span>{label}</span>
              <motion.span
                aria-hidden
                className="ds-stc__inner-chevron"
                style={{ opacity: innerChevronOpacity }}
              >
                <Icon name="arrow-right" size="sm" color="currentColor" />
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
