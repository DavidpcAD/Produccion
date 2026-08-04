'use client';
import React, { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  type PanInfo,
  type Variants,
} from "motion/react";
import { Icon, type IconName } from "../Icon/Icon";
import { springs } from "../springs";
import { haptic } from "../haptic";
import "./Sheet.css";

/**
 * Sheet — generic FAB → bottom-sheet morph surface.
 *
 * Port of `react/screens/LosaFlotante/LosaFlotante.tsx → NuevoUsuarioSheet`,
 * extracted as a reusable DS primitive. The behavior contract lives in
 * `~/Desktop/SHEET_MORPH.md`. The Sheet itself owns:
 *
 *   • 3-state machine (`closed | open | fullScreen`)
 *   • Two-phase morph (width grows first, height 180 ms later) via SHEET_VARIANTS
 *   • Drag-to-dismiss (offset.y > 120 OR velocity.y > 600)
 *   • Scroll-to-fullscreen with hysteresis (12 px enter / 2 px exit)
 *   • Scrim that closes on tap
 *   • Drag-handle close button at the top
 *   • Cascade entrance for the body (`staggerChildren: 0.06, delayChildren: 0.38`)
 *   • Centered max-width on desktop (402 px)
 *
 * The consumer supplies:
 *
 *   • `open` + `onOpen` + `onDismiss` — state ownership stays in the parent
 *   • `fab` — what the closed-state surface looks like (color + icon + aria-label)
 *   • Children composed of `Sheet.Header`, `Sheet.Body`, `Sheet.Footer`
 *     (any subset; ordering inside the JSX doesn't matter — Sheet inspects
 *     `child.type` and places them in fixed slots)
 *
 * Slot layout when open:
 *
 *   ┌──────────────────────────┐
 *   │ drag-handle close button │ ← built in, never the consumer's concern
 *   │ Sheet.Header             │ ← inside the cascade container
 *   │ Sheet.Body  (scrollable) │ ← the only scroll surface
 *   │ Sheet.Footer (sticky)    │ ← outside scroll, anchored bottom
 *   └──────────────────────────┘
 *
 * Pair with `~/Desktop/SHEET_MORPH.md` for the full behavior contract
 * and `losa.md` §7.3–§7.6 for the animation patterns.
 */

const CASCADE_CONTAINER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.38 } },
};

const CASCADE_ITEM: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: springs.expanding },
};

// FAB closed dims — match P2/Components/BottomActionBar.swift.
const FAB_WIDTH = 84;
const FAB_HEIGHT = 80;
const FAB_RIGHT = 24;
const FAB_BOTTOM = 24;
const FAB_RADIUS = 24;

// Sheet open dims.
const SHEET_HEIGHT_VH = "82vh";
const SHEET_RADIUS = 32;
const SHEET_MAX_WIDTH = 402;

// Drag-to-dismiss thresholds (testable, see SHEET_MORPH.md §4).
const DISMISS_OFFSET = 120;
const DISMISS_VELOCITY = 600;

// Scroll-to-fullscreen hysteresis (SHEET_MORPH.md §3).
const FS_ENTER = 12;
const FS_EXIT = 2;

export interface SheetFab {
  /** CSS color for the FAB background (any var() or hex). */
  background: string;
  /** CSS color for the FAB icon. */
  color: string;
  /** DS Icon name to paint inside the FAB. */
  iconName: IconName;
  /** Accessible label for the FAB tap target. */
  ariaLabel: string;
}

export interface SheetProps {
  open: boolean;
  /** Tap the FAB. Parent flips `open` → true. */
  onOpen: () => void;
  /** Scrim tap, drag-down, or drag-handle close. Parent flips `open` → false. */
  onDismiss: () => void;
  /** What the closed-state surface looks like. */
  fab: SheetFab;
  /**
   * Composed children: `<Sheet.Header />`, `<Sheet.Body>…</Sheet.Body>`,
   * `<Sheet.Footer>…</Sheet.Footer>`. Any subset, any order in the JSX —
   * Sheet places them in fixed slots.
   */
  children?: React.ReactNode;
  className?: string;
}

export function Sheet({
  open,
  onOpen,
  onDismiss,
  fab,
  children,
  className,
}: SheetProps) {
  const [fullScreen, setFullScreen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Slot resolution — pluck Header / Body / Footer by component type.
  let header: React.ReactNode = null;
  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === SheetHeader) header = child;
    else if (child.type === SheetBody) body = child;
    else if (child.type === SheetFooter) footer = child;
  });

  // Reset fullScreen whenever the sheet closes.
  useEffect(() => {
    if (!open) setFullScreen(false);
  }, [open]);

  // Native scroll listener with hysteresis. motion's drag/animate on the
  // same element makes onScroll unreliable — go through the DOM ref.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !open) return;
    const onScroll = () => {
      const top = el.scrollTop;
      setFullScreen((prev) => {
        if (!prev && top > FS_ENTER) return true;
        if (prev && top <= FS_EXIT) return false;
        return prev;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);

  const animateTo = !open ? "closed" : fullScreen ? "fullScreen" : "open";

  const handleDragEnd = (
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (!open) return;
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) {
      onDismiss();
    }
  };

  // Variants reference FAB props so the closed surface paints with the
  // consumer's color, not a hardcoded green.
  const sheetVariants: Variants = {
    closed: {
      width: FAB_WIDTH,
      height: FAB_HEIGHT,
      right: FAB_RIGHT,
      bottom: FAB_BOTTOM,
      backgroundColor: fab.background,
      borderRadius: FAB_RADIUS,
      transition: {
        // Reverse symmetry: height collapses first, width after delay.
        width: { delay: 0.18, ...springs.shrinking },
        right: { delay: 0.18, ...springs.shrinking },
        height: springs.shrinking,
        bottom: springs.shrinking,
        borderRadius: springs.shrinking,
        backgroundColor: { duration: 0.28 },
      },
    },
    open: {
      width: "100%",
      height: SHEET_HEIGHT_VH,
      right: 0,
      bottom: 0,
      backgroundColor: "var(--ds-color-white)",
      borderRadius: SHEET_RADIUS,
      transition: {
        width: springs.expanding,
        right: springs.expanding,
        height: { delay: 0.18, ...springs.expanding },
        bottom: { delay: 0.18, ...springs.expanding },
        borderRadius: { delay: 0.28, ...springs.expanding },
        backgroundColor: { duration: 0.28, delay: 0.1 },
      },
    },
    fullScreen: {
      width: "100%",
      height: "100vh",
      right: 0,
      bottom: 0,
      backgroundColor: "var(--ds-color-white)",
      borderRadius: 0,
      transition: springs.expanding,
    },
  };

  return (
    <>
      <AnimatePresence>
        {open ? (
          <motion.button
            key="scrim"
            type="button"
            aria-label="Cerrar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            onClick={onDismiss}
            className="ds-sheet__scrim"
          />
        ) : null}
      </AnimatePresence>

      <motion.div
        key="sheet-surface"
        className={`ds-sheet${className ? ` ${className}` : ""} losa-stack`}
        style={{
          maxWidth: open ? SHEET_MAX_WIDTH : undefined,
          left: open ? "50%" : "auto",
          x: open ? "-50%" : 0,
          touchAction: open ? "auto" : "manipulation",
          color: open ? "var(--ds-color-black)" : fab.color,
        }}
        initial="closed"
        animate={animateTo}
        variants={sheetVariants}
        drag={open ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragStart={() => haptic.drag()}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence initial={false} mode="wait">
          {open ? (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.28 } }}
              exit={{ opacity: 0 }}
              className="ds-sheet__content"
            >
              {/* Drag-handle close button — built in, always rendered. */}
              <div className="ds-sheet__handle">
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={onDismiss}
                  className="ds-sheet__handle-btn"
                >
                  <Icon name="close" size="md" color="var(--ds-color-gray-500)" />
                </button>
              </div>

              {/* Scrollable body wrapped in cascade. Each slot gets its own
                  `motion.div` with `CASCADE_ITEM` HERE (not inside the slot
                  components), so the motion.divs are direct children of the
                  cascade container — variants propagate correctly. If we
                  wrapped them inside SheetHeader/SheetBody, the function-
                  component boundary would break variant inheritance. */}
              <motion.div
                ref={bodyRef}
                className="ds-sheet__body"
                variants={CASCADE_CONTAINER}
                initial="hidden"
                animate="show"
                exit="hidden"
              >
                {header ? (
                  <motion.div
                    variants={CASCADE_ITEM}
                    className="ds-sheet__title-row"
                  >
                    {header}
                  </motion.div>
                ) : null}
                {body ? (
                  <motion.div
                    variants={CASCADE_ITEM}
                    className="ds-sheet__pane-wrap"
                  >
                    {body}
                  </motion.div>
                ) : null}
              </motion.div>

              {/* Footer pinned outside the scroll body. */}
              {footer}
            </motion.div>
          ) : (
            <motion.button
              key="fab"
              type="button"
              aria-label={fab.ariaLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.24 } }}
              exit={{ opacity: 0 }}
              onPointerDown={() => haptic.select()}
              onClick={onOpen}
              className="ds-sheet__fab"
            >
              <Icon name={fab.iconName} size="lg" color="currentColor" />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

/* ─── Slots ──────────────────────────────────────────────────
 *
 * Each slot is a thin wrapper that just renders its children with the
 * right class. Sheet identifies them by component reference (`child.type
 * === SheetHeader`) so consumers can compose them in any order.
 */

export interface SheetHeaderProps {
  /** DS Icon to paint inside the avatar bubble at the top of the sheet. */
  iconName?: IconName;
  /** Uppercase title shown next to the icon. */
  title?: string;
  /** Custom node — overrides `iconName` + `title` if provided. */
  children?: React.ReactNode;
}

export function SheetHeader({
  iconName = "user",
  title,
  children,
}: SheetHeaderProps) {
  // Plain JSX — no motion. Sheet wraps this in the cascade motion.div so
  // variants flow correctly (function-component boundaries break inheritance).
  return (
    children ?? (
      <>
        <span className="ds-sheet__avatar">
          <Icon name={iconName} size="lg" color="currentColor" />
        </span>
        {title ? <h2 className="ds-sheet__title">{title}</h2> : null}
      </>
    )
  );
}

export interface SheetBodyProps {
  children?: React.ReactNode;
  className?: string;
}

export function SheetBody({ children, className }: SheetBodyProps) {
  // Plain JSX — Sheet handles the cascade motion wrapper.
  return (
    <div className={`ds-sheet__pane${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

export interface SheetFooterProps {
  children?: React.ReactNode;
  className?: string;
}

export function SheetFooter({ children, className }: SheetFooterProps) {
  return (
    <div className={`ds-sheet__footer${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

// Attach slots as members of Sheet for the dot-notation API.
Sheet.Header = SheetHeader;
Sheet.Body = SheetBody;
Sheet.Footer = SheetFooter;
