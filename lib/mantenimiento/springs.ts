/**
 * Spring vocabulary — semantic, never inline.
 * Mirrors the iOS prototype's `Springs.swift`.
 *
 * Rule: pick by *meaning* of the interaction, not visual speed.
 * Adding a new spring? Use a semantic name (what it does), not a descriptor (how it feels).
 */
export const springs = {
  /** Fast response — taps, immediate feedback */
  snappy: { type: "spring", stiffness: 400, damping: 30 },
  /** Confirm, check, success */
  completing: { type: "spring", stiffness: 300, damping: 28 },
  /** Removal, warning, destructive */
  deleting: { type: "spring", stiffness: 500, damping: 25 },
  /** Card expand, reveal, drawer open — softened para evitar overshoot */
  expanding: { type: "spring", stiffness: 170, damping: 30 },
  /** Return to rest, dismiss, settle */
  settling: { type: "spring", stiffness: 150, damping: 28 },
  /**
   * Near-critically damped — shrink without overshoot. Mirror of `expanding`
   * for the "close" side of symmetric morphs. From P2/Motion/Springs.swift
   * (SwiftUI response 0.42 / damping 0.98).
   */
  shrinking: { type: "spring", stiffness: 224, damping: 29, mass: 1 },
  /**
   * Bouncy pop-in for ephemera — cancel buttons, badges, menu items entering
   * from scale 0.01. From P2/Motion/Springs.swift (SwiftUI 0.32 / 0.55).
   */
  popping: { type: "spring", stiffness: 385, damping: 22, mass: 1 },
} as const;

export type SpringName = keyof typeof springs;
