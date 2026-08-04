/**
 * The data a notch card renders — deliberately **serializable**, with no functions and no React
 * nodes anywhere in it.
 *
 * That constraint is not stylistic. The desktop app shows the card in a *separate* webview window
 * whose content is baked into the window's URL at creation time (`?payload=<json>`), so anything
 * that can't survive `JSON.stringify` can't reach the card. Hence: actions are `{ id, label }`
 * descriptors the host resolves through an `onAction(id)` callback, and the per-kind icon is a
 * component prop rather than a model field.
 *
 * Copy is **already translated** when it gets here. The package never calls `t()` — it has no i18n
 * dependency at all, the same rule `packages/components` follows — so every string below is what
 * the user will read.
 */

/**
 * The card's colour signal: the halo around it, and the accent on its eyebrow line.
 *
 * Generic on purpose. The palette used to be keyed by concrete GitHub PR event types
 * (`pr_merged`, `ci_failed`, …), which is what made it impossible to raise a card for anything
 * that isn't a pull request. A tone says how the event *feels* — the consumer maps its own domain
 * types onto one.
 */
export type NotchTone =
  /** Nothing in particular; the fallback. */
  | 'neutral'
  /** Something appeared or is now pending. */
  | 'info'
  /** Someone wants something from you. */
  | 'accent'
  /** It worked. */
  | 'success'
  /** It failed, and you probably have to do something. */
  | 'error'
  /** It is happening right now. */
  | 'running'
  /** It worked, and it mattered — the end of a long road. */
  | 'highlight'

/**
 * Which shape of card to render.
 *
 * - `event` — fire and forget: something happened, here it is, it fades on its own.
 * - `progress` — a live card, updated in place while an operation runs, closing when it ends.
 * - `status` — the outcome of an operation, optionally with the tail of its output.
 * - `reward` — the user unlocked something, and the card celebrates it.
 */
export type NotchKind = 'event' | 'progress' | 'status' | 'reward'

/**
 * The medal a reward carries — its colour, and the palette its confetti is thrown in.
 *
 * Four values rather than a {@link NotchTone} because a tone says how an event *feels* and every
 * reward feels the same way (good); what differs is how *rare* it was, and the seven tones have no
 * way to say "bronze". Mirrors the app's own `AchievementTier` without depending on it — the same
 * ranking any gamified surface uses, which is why it is allowed in a domain-agnostic package.
 */
export type NotchRewardTier = 'bronze' | 'silver' | 'gold' | 'platinum'

/** A button in the card's action row. `id` is what comes back through `onAction`. */
export interface NotchAction {
  id: string
  label: string
  /** `primary` is the filled button; `ghost` is the quiet one. Defaults to `ghost`. */
  variant?: 'primary' | 'ghost'
}

interface NotchModelBase {
  /**
   * Stable identity for this card. Two models sharing an id are the *same* notification: the queue
   * coalesces them (an update replaces the card in place instead of queueing a second one), which
   * is what lets a progress card tick without flickering.
   */
  id: string
  tone: NotchTone
  /** The small uppercase eyebrow: what kind of thing this is ("REVIEW REQUESTED", "PRE-COMMIT"). */
  eyebrow: string
  /** Where it happened — a repository, a worktree, a package. Shown under the eyebrow. */
  context?: string
  /** Right-aligned in the header: a relative time, an elapsed duration, a version. */
  meta?: string
  /** Buttons in the action row. An empty/omitted list drops the row entirely (shorter card). */
  actions?: NotchAction[]
  /** Right-aligned badge in the action row (`#231`, `3 files`). */
  badge?: string
}

/** Something happened. The shape the GitHub PR notifications use. */
export interface NotchEventModel extends NotchModelBase {
  kind: 'event'
  title: string
  subtitle?: string
  /** A face for the body row; falls back to `fallback` initials when `src` is absent or broken. */
  avatar?: { src?: string; alt: string; fallback: string }
}

/** Something is running. */
export interface NotchProgressModel extends NotchModelBase {
  kind: 'progress'
  title: string
  /** `0`–`1`. Omit for an indeterminate bar — which is the honest rendering when the total isn't
   *  known yet (a clone before the server announces its object count, a hook that just started). */
  ratio?: number
  /** The count under the bar: "12 / 48 commits", "4.2 MB / 18 MB". */
  detail?: string
}

/** Something finished. */
export interface NotchStatusModel extends NotchModelBase {
  kind: 'status'
  title: string
  /** The tail of the process output, rendered monospace. Trim it before passing it in — the card
   *  shows the last {@link STATUS_OUTPUT_MAX_LINES} and nothing more. */
  outputLines?: string[]
}

/**
 * Something was unlocked.
 *
 * The one card whose subject is the *user* rather than a repository, which is what earns it a shape
 * of its own: it gets a medal in place of an avatar, its accent comes from its {@link tier} instead
 * of its tone, and it is the only card allowed to throw confetti.
 */
export interface NotchRewardModel extends NotchModelBase {
  kind: 'reward'
  /** What was unlocked — the achievement's name. */
  title: string
  /** What earned it ("Merged 50 pull requests"). */
  description?: string
  /** What it grants ("Aurora theme"), rendered in the tier's own colour. XP goes in `badge`. */
  reward?: string
  /**
   * Which medal, and which confetti palette.
   *
   * Purely visual: the medal is decorative and a colour cannot be read aloud, so a card whose tier
   * matters should also say it in its {@link NotchModelBase.eyebrow} — where it is a translated
   * string rather than a hue.
   */
  tier: NotchRewardTier
  /**
   * Whether to celebrate. Defaults to `true` — the card exists to celebrate.
   *
   * `false` is for showing a reward the user has already seen (a replay from the rewards list),
   * where confetti would be a second announcement of old news. A user who asked their system for
   * reduced motion gets no confetti whatever this says.
   */
  confetti?: boolean
}

export type NotchModel = NotchEventModel | NotchProgressModel | NotchStatusModel | NotchRewardModel

/** How many output lines a `status` card shows; the rest is what "Show output" is for. */
export const STATUS_OUTPUT_MAX_LINES = 3
