import type { SVGProps } from "react";

/**
 * AdelanteMark — the canonical Adelante mark, as a single 2-path SVG.
 *
 * Fill is `currentColor` so the mark recolors via the parent's `color`
 * CSS property. No inline hex, no `<defs>`, no `<style>` — recoloring is
 * the consumer's job (see `~/Desktop/ICON.md` §2 for the three
 * appearance-mode recipes: Light / Dark / Tinted).
 *
 * One mark, every project, every size, every appearance mode:
 *
 *   • Default (light)  →  green-100 on white / page bg
 *   • Dark             →  black on green-100
 *   • Tinted           →  #111 on #F3F3F3
 *
 * Source artwork: `~/Desktop/adelante-icon.svg` (currentColor-fill).
 * iOS parity: the same path coordinates render the AppIcon at 60% canvas
 * width (see ICON.md §4).
 *
 * **Don't** override the `fill` attribute inline — recolor by setting
 * `color:` on the parent. Otherwise every appearance mode needs its own
 * copy of the SVG.
 */
export function AdelanteMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 163 71"
      fill="currentColor"
      role="img"
      aria-label="Adelante"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 0H45.645L87.8835 70.7845H41.4411L0 0ZM72.5219 20.6455H118.403L133.203 45.715H162.804L148.004 70.7845H102.257L72.5219 20.6455Z"
      />
    </svg>
  );
}
