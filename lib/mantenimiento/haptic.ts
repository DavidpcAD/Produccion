/**
 * Haptic vocabulary — semantic, not decorative.
 * Pick by meaning (.complete, .delete, .select, .drag), never by feel.
 *
 * Note: only fires on Android Chrome. iOS Safari does not expose Vibration API.
 * No-op silently when unavailable, so callers don't need to guard.
 */
const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
};

export const haptic = {
  /** Successful action — confirm, check, finished */
  complete: () => vibrate([10, 30, 10]),
  /** Tap, selection, light feedback */
  select: () => vibrate(5),
  /** Drag milestone — threshold reached, snap engaged */
  drag: () => vibrate(8),
  /** Removal, destructive action */
  delete: () => vibrate([15, 10, 15]),
};
