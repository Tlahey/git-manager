import type { ReactNode } from 'react'
import { Download, GitMerge, GitPullRequest, Rocket, Search, Terminal, XCircle } from 'lucide-react'
import type {
  NotchEventModel,
  NotchModel,
  NotchProgressModel,
  NotchRewardModel,
  NotchRewardTier,
  NotchStatusModel,
  NotchTone,
} from '../src'

/**
 * The cards these stories are about.
 *
 * Half of them are things the app already notifies about (a merged PR, a failed check) and half
 * are the ones it cannot represent yet — a running hook, a dev server coming up, a commit scan
 * grinding through a repository. They are here as fixtures rather than as a promise: what they
 * demonstrate is that the model is general enough to carry them.
 */

const TONE_RING: Record<NotchTone, string> = {
  neutral: 'bg-slate-500/15 text-slate-300',
  info: 'bg-indigo-500/15 text-indigo-300',
  accent: 'bg-violet-500/15 text-violet-300',
  success: 'bg-emerald-500/15 text-emerald-300',
  error: 'bg-red-500/15 text-red-300',
  running: 'bg-sky-500/15 text-sky-300',
  highlight: 'bg-purple-500/15 text-purple-300',
}

/** The little round glyph in the header row, mirroring the app's own notification icons. */
export function NotchIcon({ tone, children }: { tone: NotchTone; children: ReactNode }) {
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full ${TONE_RING[tone]}`}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

export const prMerged: NotchEventModel = {
  kind: 'event',
  id: 'pr-231',
  tone: 'highlight',
  eyebrow: 'PULL REQUEST MERGED',
  context: 'Tlahey/git-manager',
  meta: '2 min ago',
  title: 'feat(notch): extract the notification card into a package',
  subtitle: '@Tlahey',
  avatar: { alt: 'Tlahey', fallback: 'TL' },
  badge: '#231',
  actions: [
    { id: 'open', label: 'Open in app', variant: 'primary' },
    { id: 'github', label: 'GitHub' },
  ],
}

export const prMergedIcon = (
  <NotchIcon tone="highlight">
    <GitMerge className="h-3.5 w-3.5" />
  </NotchIcon>
)

export const reviewRequested: NotchEventModel = {
  kind: 'event',
  id: 'pr-232',
  tone: 'accent',
  eyebrow: 'REVIEW REQUESTED',
  context: 'Tlahey/git-manager',
  meta: 'just now',
  title: 'fix(rebase): keep the paused state after a conflict resolution',
  subtitle: '@jane_dev',
  avatar: { alt: 'jane_dev', fallback: 'JA' },
  badge: '#232',
  actions: [
    { id: 'review', label: 'Review', variant: 'primary' },
    { id: 'github', label: 'GitHub' },
  ],
}

export const reviewRequestedIcon = (
  <NotchIcon tone="accent">
    <GitPullRequest className="h-3.5 w-3.5" />
  </NotchIcon>
)

export const ciFailed: NotchEventModel = {
  kind: 'event',
  id: 'pr-230-ci',
  tone: 'error',
  eyebrow: 'CHECKS FAILED',
  context: 'Tlahey/git-manager',
  meta: '5 min ago',
  title: 'typecheck — 2 errors in packages/notch',
  subtitle: '@github-actions',
  avatar: { alt: 'github-actions', fallback: 'GI' },
  badge: '#230',
  actions: [{ id: 'logs', label: 'View logs', variant: 'primary' }],
}

export const ciFailedIcon = (
  <NotchIcon tone="error">
    <XCircle className="h-3.5 w-3.5" />
  </NotchIcon>
)

/** No actions and no badge: the card loses its whole bottom row and gets shorter for it. */
export const minimalEvent: NotchEventModel = {
  kind: 'event',
  id: 'branch-diverged',
  tone: 'neutral',
  eyebrow: 'BRANCH DIVERGED',
  context: 'git-manager',
  meta: '1 h',
  title: 'main is 3 commits ahead and 1 behind origin/main',
}

export const cloneProgress: NotchProgressModel = {
  kind: 'progress',
  id: 'clone-git-manager',
  tone: 'running',
  eyebrow: 'CLONING',
  context: 'github.com/Tlahey/git-manager',
  meta: '00:12',
  title: 'Receiving objects',
  ratio: 0.42,
  detail: '4.2 MB / 18 MB · 1 412 objects',
  actions: [{ id: 'cancel', label: 'Cancel' }],
}

export const cloneProgressIcon = (
  <NotchIcon tone="running">
    <Download className="h-3.5 w-3.5" />
  </NotchIcon>
)

/** No denominator yet — the honest rendering is a travelling sliver, not a bar parked at 0%. */
export const commitScanProgress: NotchProgressModel = {
  kind: 'progress',
  id: 'commit-search',
  tone: 'running',
  eyebrow: 'SEARCHING COMMITS',
  context: 'git-manager',
  title: 'Reading the commits that touched the notch',
  detail: 'quick scan · counting candidates',
  actions: [{ id: 'cancel', label: 'Cancel' }],
}

export const commitScanIcon = (
  <NotchIcon tone="running">
    <Search className="h-3.5 w-3.5" />
  </NotchIcon>
)

export const preCommitFailed: NotchStatusModel = {
  kind: 'status',
  id: 'hook-pre-commit',
  tone: 'error',
  eyebrow: 'PRE-COMMIT HOOK',
  context: 'git-manager',
  meta: '3.4 s',
  title: 'lint-staged exited with code 1 — nothing was committed',
  outputLines: [
    '✖ oxlint --fix apps/desktop/src',
    '  NotchCard.tsx:42  no-unused-vars  "toneRgb" is never read',
    '✖ lint-staged failed',
  ],
  actions: [
    { id: 'output', label: 'Show output', variant: 'primary' },
    { id: 'retry', label: 'Retry' },
  ],
}

export const preCommitFailedIcon = (
  <NotchIcon tone="error">
    <Terminal className="h-3.5 w-3.5" />
  </NotchIcon>
)

export const devServerReady: NotchStatusModel = {
  kind: 'status',
  id: 'task-dev',
  tone: 'success',
  eyebrow: 'DEV SERVER',
  context: 'git-manager · pnpm dev',
  meta: '4.1 s',
  title: 'Vite is listening on http://localhost:5173',
  actions: [
    { id: 'open-browser', label: 'Open', variant: 'primary' },
    { id: 'stop', label: 'Stop' },
  ],
}

export const devServerReadyIcon = (
  <NotchIcon tone="success">
    <Rocket className="h-3.5 w-3.5" />
  </NotchIcon>
)

// ── Rewards ────────────────────────────────────────────────────────────────────────────────────
// The copy is the app's own English strings for four real achievements (`achievements.json` +
// `launchpad.json`), one per tier, so the story is judging the layout at the lengths it will
// actually get rather than at lorem ipsum's.

const REWARDS: Record<NotchRewardTier, NotchRewardModel> = {
  bronze: {
    kind: 'reward',
    id: 'achievement-commit_10',
    tone: 'highlight',
    eyebrow: 'ACHIEVEMENT UNLOCKED · BRONZE TROPHY',
    context: 'Trophy cabinet · 6 / 28',
    meta: 'just now',
    title: 'Commit Regular',
    description: 'Make 10 commits across your Git repositories.',
    reward: 'XP boost',
    tier: 'bronze',
    badge: '+20 XP',
    actions: [{ id: 'rewards', label: 'See rewards', variant: 'primary' }],
  },
  silver: {
    kind: 'reward',
    id: 'achievement-autosquash',
    tone: 'highlight',
    eyebrow: 'ACHIEVEMENT UNLOCKED · SILVER TROPHY',
    context: 'Trophy cabinet · 14 / 28',
    meta: 'just now',
    title: 'History Architect',
    description: "Run an automatic rebase with 'autosquash'.",
    reward: 'Cyberpunk theme',
    tier: 'silver',
    badge: '+30 XP',
    actions: [{ id: 'rewards', label: 'See rewards', variant: 'primary' }],
  },
  gold: {
    kind: 'reward',
    id: 'achievement-pr_50',
    tone: 'highlight',
    eyebrow: 'ACHIEVEMENT UNLOCKED · GOLD TROPHY',
    context: 'Trophy cabinet · 22 / 28',
    meta: 'just now',
    title: 'Merge Master',
    description: 'Have 50 pull requests merged or closed.',
    reward: 'Gold avatar frame',
    tier: 'gold',
    badge: '+80 XP',
    actions: [{ id: 'rewards', label: 'See rewards', variant: 'primary' }],
  },
  platinum: {
    kind: 'reward',
    id: 'achievement-commit_500',
    tone: 'highlight',
    eyebrow: 'ACHIEVEMENT UNLOCKED · PLATINUM TROPHY',
    context: 'Trophy cabinet · 27 / 28',
    meta: 'just now',
    title: 'Git Legend',
    description: 'Make 500 commits across your Git repositories.',
    reward: 'Neon avatar frame',
    tier: 'platinum',
    badge: '+150 XP',
    actions: [{ id: 'rewards', label: 'See rewards', variant: 'primary' }],
  },
}

export const REWARD_TIERS: NotchRewardTier[] = ['bronze', 'silver', 'gold', 'platinum']

/** The reward card for a tier. No header icon on purpose: the medal in the body is the glyph, and a
 *  second trophy in the header is one trophy too many. */
export function rewardSample(tier: NotchRewardTier): NotchRewardModel {
  return REWARDS[tier]
}

/**
 * The cards the playground can send, in the order the buttons appear.
 *
 * One list rather than one story per card: the interesting part is what happens when they land on
 * a notch that is already busy, which you cannot see from separate stories.
 */
export interface NotchSample {
  label: string
  model: NotchModel
  icon?: ReactNode
}

export const NOTCH_SAMPLES: NotchSample[] = [
  { label: 'PR merged', model: prMerged, icon: prMergedIcon },
  { label: 'Review requested', model: reviewRequested, icon: reviewRequestedIcon },
  { label: 'Checks failed', model: ciFailed, icon: ciFailedIcon },
  { label: 'Clone (progress)', model: cloneProgress, icon: cloneProgressIcon },
  { label: 'Commit scan (unknown total)', model: commitScanProgress, icon: commitScanIcon },
  { label: 'Pre-commit failed', model: preCommitFailed, icon: preCommitFailedIcon },
  { label: 'Dev server ready', model: devServerReady, icon: devServerReadyIcon },
  { label: 'No actions', model: minimalEvent },
  // One tier here rather than four buttons: what the playground adds over `Notch/Reward` is the
  // reward landing on a notch that is already busy — a clone running, an error cutting in.
  { label: 'Achievement (gold)', model: rewardSample('gold') },
]
