// Shared shape of the per-cell APCA matrix results that the browser-side tests
// (matrix.tsx) attach to Vitest task meta, and the node-side reporter
// (vitest-apca-reporter.ts) turns into the apca-report.{json,md} artifacts.
// Type-only — safe to import from both sides.

/** One failing axe node, with whatever data the check attached (APCA Lc, fg/bg, …). */
export interface ViolationNodeRecord {
  /** axe rule id, e.g. `color-contrast-apca-bronze`. */
  rule: string
  /** CSS selector path to the node. */
  target: string
  /** Truncated outer HTML of the node. */
  html: string
  /** Human-readable check message (Lc, fg/bg, font size/weight, threshold). */
  message: string
  /** Raw check data, e.g. { apcaContrast, apcaThreshold, fgColor, bgColor, … }. */
  data?: Record<string, unknown>
  /**
   * True when this node was matched by the matrix's documented exempt list (e.g. the
   * intentionally-muted decorative chips): recorded and reported, but NOT asserted on.
   */
  exempt?: boolean
}

/** Everything one theme × surface cell of the matrix produced. */
export interface ApcaCellMeta {
  theme: string
  surface: string
  violations: ViolationNodeRecord[]
}

// Vitest's TaskMeta is declared in @vitest/runner (only re-exported by 'vitest'),
// which pnpm's strict layout makes unresolvable from here — so a `declare module`
// augmentation cannot apply. Both sides cast task.meta to this instead.
export interface ApcaTaskMeta {
  /** Set by runA11yMatrix for each theme × surface test. */
  apca?: ApcaCellMeta
}
