/**
 * Left padding of a branch or folder row, by depth.
 *
 * Folders go as deep as the branch names do, so the indent is computed rather than picked from a
 * fixed set of Tailwind classes — which is what once capped the nesting at one level. `1.5rem` is
 * the `pl-6` of a top-level row, `1rem` the step the rest of the panel uses. A remote's own node
 * sits at depth 0, its branches at 1 and up.
 */
export function rowIndent(depth: number): string {
  return `${1.5 + depth}rem`
}
