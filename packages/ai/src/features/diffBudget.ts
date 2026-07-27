import { truncateDiff } from './commitMessage'

/**
 * Spending a fixed character budget across a multi-file diff, instead of cutting the concatenated
 * text at `maxChars` and hoping the interesting part came first.
 *
 * The blind cut is not a theoretical problem. On the changeset that introduced the code-review
 * feature — 39 files, 110 000 characters — an 8000-char head-cut showed the model four files: a
 * documentation page, two one-line additions, and half a test file. Not one line of the feature
 * being reviewed was inside the budget. The review that came back talked about the truncation,
 * because the truncation was the only thing it could see.
 *
 * Two rules fix that:
 *
 * 1. **Priority.** Source code is read before tests, tests before documentation and config, and
 *    generated files last — they are diff noise a reviewer has no opinion about, and a lockfile can
 *    eat an entire budget on its own. That order is a heuristic over *file names*, so a caller who
 *    knows better can correct it per path — see {@link DiffTierOverrides}.
 * 2. **A share per file.** Within the budget every retained file gets its own allocation, so no file
 *    is silently invisible. Files that do not fit at all are *named* rather than dropped in silence:
 *    a reviewer who knows what they did not read is far more useful than one who does not.
 */

/** Review priority of a changed file. Lower sorts first — and is read first. */
export type DiffFileTier = 'source' | 'test' | 'doc' | 'generated'

const TIER_ORDER: Record<DiffFileTier, number> = { source: 0, test: 1, doc: 2, generated: 3 }

/** One file's slice of a unified diff, with its original header line intact. */
export interface DiffFileSection {
  path: string
  tier: DiffFileTier
  /** The verbatim diff text for this file, header included. */
  text: string
}

export interface BudgetedDiff {
  /** The assembled diff: retained files in their original order, each cut to its own allocation. */
  text: string
  /** Paths that did not fit at all, so the prompt can say what was not read. */
  omitted: string[]
  /** Paths that were included but cut short. */
  truncated: string[]
}

/**
 * Below this a file's allocation is not worth spending: a diff section is mostly header, and a
 * couple of hundred characters of one buys nothing a reviewer can act on. Better to omit the file
 * and name it.
 */
const MIN_FILE_CHARS = 400

/** Files whose diff a reviewer has no useful opinion about — machine-written, or churn. */
function isGenerated(path: string): boolean {
  const name = path.split('/').pop() ?? path
  return (
    /^(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|bun\.lockb|composer\.lock)$/.test(
      name
    ) ||
    /\.(snap|min\.js|min\.css|map)$/.test(name) ||
    /(^|\/)(dist|build|coverage|node_modules|target)\//.test(path)
  )
}

function isTest(path: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)__tests__\//.test(path)
}

function isDoc(path: string): boolean {
  return /\.(md|mdx|json|ya?ml|toml|txt)$/.test(path)
}

/**
 * Per-path tier overrides: paths a caller has decided the heuristic gets wrong.
 *
 * A map rather than a predicate because the caller almost always knows the exact paths — it is
 * looking at the same changed-file list the diff came from — and a map cannot accidentally match
 * something it was not shown.
 */
export type DiffTierOverrides = Readonly<Record<string, DiffFileTier>>

/**
 * Which tier a path belongs to. Order matters: a generated file can be a `.json` or a `.snap` that
 * would otherwise read as documentation or a test, so it is checked first.
 *
 * `overrides` is how a caller corrects the heuristic, which is all this is — pattern-matching on
 * names, with no idea what a file means to the project. The cases it gets wrong are real and go both
 * ways: a checked-in JSON schema or a hand-maintained `.min.js` is `generated` and read last though
 * it is the change; a `docs/` page nobody is asking about outranks nothing but still competes. The
 * heuristic cannot be taught to tell those apart from a path, so the decision belongs to whoever
 * knows — a feature that has more context, or a user who says "review this file".
 *
 * Deliberately *not* clamped or validated. An override that promotes a lockfile to `source` is a
 * caller saying they mean it, and the budget's job is to obey; the tiers are a priority order, not a
 * safety property.
 */
export function classifyDiffPath(path: string, overrides?: DiffTierOverrides): DiffFileTier {
  const override = overrides?.[path]
  if (override) return override
  if (isGenerated(path)) return 'generated'
  if (isTest(path)) return 'test'
  if (isDoc(path)) return 'doc'
  return 'source'
}

/**
 * Matches the `diff --git a/<old> b/<new>` line that opens each file's section.
 *
 * The leading `[ +-]?` is not cosmetic. The backend renders its patch through `git2`'s
 * `DiffFormat::Patch` callback and prefixes every line by origin, mapping anything that is not an
 * addition or a deletion to a space — so the file header arrives as `" diff --git a/x b/x"`, not
 * `"diff --git a/x b/x"`. Matching only the bare form would split nothing and silently fall back to
 * the blind cut this module exists to replace.
 */
const FILE_HEADER = /^[ +-]?diff --git a\/(.+?) b\/(.+?)[ \t]*$/gm

/**
 * Splits a unified diff into one section per file. Returns `[]` when the text carries no file
 * header at all, which is the caller's signal to fall back rather than invent structure.
 */
export function splitDiffByFile(diff: string, overrides?: DiffTierOverrides): DiffFileSection[] {
  const starts: { index: number; path: string }[] = []
  FILE_HEADER.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FILE_HEADER.exec(diff)) !== null) {
    // Prefer the new path; a deletion reports `/dev/null` there, so fall back to the old one.
    const newPath = match[2]
    const path = newPath === 'dev/null' || newPath === '/dev/null' ? match[1] : newPath
    starts.push({ index: match.index, path })
  }
  if (starts.length === 0) return []

  return starts.map(({ index, path }, i) => ({
    path,
    tier: classifyDiffPath(path, overrides),
    text: diff.slice(index, starts[i + 1]?.index ?? diff.length),
  }))
}

/**
 * Spends `maxChars` across the diff's files, highest priority first.
 *
 * Allocation is a water-fill: files are visited in priority order and, within a tier, **smallest
 * first**, each offered an equal share of what is left. A file that needs less than its share
 * returns the surplus to the pool, which is what lets a handful of small files be shown whole and
 * still leave room for a large one. When a share drops below {@link MIN_FILE_CHARS} the fill stops
 * and every remaining file — all of them equally or less important — is reported as omitted.
 *
 * Output keeps the diff's **original file order**, not the allocation order: the caller is building
 * a prompt for a human-shaped reader, and a diff reordered by size is harder to follow.
 */
export function budgetDiff(
  diff: string,
  maxChars: number,
  overrides?: DiffTierOverrides
): BudgetedDiff {
  const sections = splitDiffByFile(diff, overrides)
  // No parseable structure (an empty diff, or a format this doesn't know): the old blind cut is
  // still better than dropping the content entirely.
  if (sections.length === 0) {
    return { text: truncateDiff(diff, maxChars), omitted: [], truncated: [] }
  }

  const total = sections.reduce((sum, s) => sum + s.text.length, 0)
  if (total <= maxChars) {
    return { text: diff, omitted: [], truncated: [] }
  }

  const allocation = new Map<DiffFileSection, number>()
  let remaining = maxChars

  // Tier by tier, not one flat pass: a lower tier is only served once every higher one has taken
  // what it needs. A flat equal-share pass looks like priority but isn't — with three files and a
  // 4000 budget it hands a lockfile 1334 characters while the two source files it outranks are
  // themselves being cut at 1333. "Source first" has to mean the lockfile eats the *surplus*, or
  // nothing.
  const tiers = (Object.keys(TIER_ORDER) as DiffFileTier[]).sort(
    (a, b) => TIER_ORDER[a] - TIER_ORDER[b]
  )

  for (const tier of tiers) {
    // Smallest first within the tier: cheap files cost little and are served whole, so the pool
    // keeps what they did not need for the larger ones behind them.
    const inTier = sections
      .filter((s) => s.tier === tier)
      .sort((a, b) => a.text.length - b.text.length)

    // Set when this tier could not be served in full — a file cut short, or one it could not reach.
    let unmetDemand = false

    for (const section of inTier) {
      // Each file takes what it *needs*, not an equal share. Completeness is the objective, and it
      // is not a preference: a file shown through a 700-character window is mostly imports, and the
      // model will report a function as unused because its only call site fell past the cut. A
      // wrong finding costs more than a missing one — an omitted file is at least named as unread.
      //
      // No per-file ceiling is needed to stop one huge file monopolising the budget: smallest-first
      // already serves it last, so it can only ever take what the others left.
      const take = Math.min(section.text.length, remaining)

      // Too little left to show this file usefully. A *whole* file below the minimum is still fine:
      // the minimum is about truncation, where a couple of hundred characters buys only a header.
      if (take < section.text.length && take < MIN_FILE_CHARS) {
        unmetDemand = true
        break
      }
      if (take < section.text.length) unmetDemand = true
      allocation.set(section, take)
      remaining -= take
    }

    // A lower tier is served only out of genuine surplus. Without this, the budget left over by a
    // per-file cap would flow down and hand a lockfile a slice while the source files it outranks
    // are themselves being cut — priority in name only.
    if (unmetDemand || remaining < MIN_FILE_CHARS) break
  }

  // A budget too small for even one file: showing something beats returning an empty diff, which
  // would be strictly worse than the blind cut this replaces.
  if (allocation.size === 0) {
    const [first] = [...sections].sort(
      (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.text.length - b.text.length
    )
    allocation.set(first, Math.min(first.text.length, maxChars))
  }

  const truncated: string[] = []
  const omitted: string[] = []
  const kept: string[] = []

  // Rebuilt in the diff's own order, keyed on the section object: two sections can carry the same
  // path (a rename shows old and new), so matching by string would report the wrong one.
  for (const section of sections) {
    const take = allocation.get(section)
    if (take === undefined) {
      omitted.push(section.path)
      continue
    }
    if (take >= section.text.length) {
      kept.push(section.text)
      continue
    }
    truncated.push(section.path)
    kept.push(
      `${section.text.slice(0, take)}\n[... ${section.path}: truncated, ${take} of ${section.text.length} chars shown]\n`
    )
  }

  return { text: kept.join(''), omitted, truncated }
}
