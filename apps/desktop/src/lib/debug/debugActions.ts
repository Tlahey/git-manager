/**
 * Everything the app can be made to do on purpose, for testing it by hand — in one list.
 *
 * These affordances used to be scattered: four "Test …" buttons inside the notification bell, a
 * fifth inside a Settings panel, each with its own hardcoded fixture and its own styling. That
 * arrangement had two costs. Finding them meant knowing where they were hidden, and *adding* one
 * meant editing whatever component happened to be nearest — so the notch, the queue and the
 * transfer cards shipped with no way to trigger them at all short of provoking the real event.
 *
 * A registry, like `notificationRegistry.ts` and `ruleRegistry.ts` before it: a new test action is
 * one entry here, and the menu picks it up.
 *
 * ## Two shapes, on purpose
 *
 * Most entries raise exactly **one card**, and those declare how to *build* it rather than how to
 * show it — so the menu can offer each of them a choice of surface (the notch, or a macOS banner
 * when the card can be expressed as one). An action that decided its own surface would be testing
 * the display setting instead of the card.
 *
 * The rest are `effect` actions: sending three cards at once, clearing the queue, driving the
 * transfer store. They have no single card to aim, so they get one button.
 *
 * ## Development only
 *
 * The whole module is behind `import.meta.env.DEV` at its single call site, so it is
 * dead-code-eliminated from every production build. That is also why the copy here is **not**
 * translated, against the app's usual hard rule: no user ever sees these strings, and a French
 * translation of "Send an error card" would be work with no reader. Everything a *user* can see
 * still goes through `t()`.
 */

import type { TFunction } from '@git-manager/i18n'
import type { NotchModel } from '@git-manager/notch'
import { nativeSpecFor, type NotchRequest } from '../notifications/notchDelivery'
import { notchRequestFromNotification } from '../notifications/notchModel'
import { apiSendNativeNotification } from '../../api/notification.api'
import { useAiActivityStore } from '../../stores/aiActivity.store'
import { useNotificationStore, type AppNotification } from '../../stores/notification.store'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import { useRemoteProgressStore } from '../../stores/remoteProgress.store'
import { useSettingsStore } from '../../stores/settings.store'

export type DebugActionGroup =
  | 'Notifications'
  | 'Notch cards'
  | 'Notch queue'
  | 'Transfers'
  | 'AI runs'

/** Where a card action aims its card. */
export type DebugSurface = 'notch' | 'native'

interface DebugActionBase {
  id: string
  group: DebugActionGroup
  label: string
  /** One line on what to watch for once it runs. */
  hint: string
}

/** Raises one card, which the caller can aim at a surface. */
export interface DebugCardAction extends DebugActionBase {
  kind: 'card'
  /**
   * Whether this card has a banner form — declared rather than derived from `build`.
   *
   * Deriving it meant *calling* `build` to ask the question, and `build` is not pure for the
   * notification entries: it records into the notification store, exactly as the GitHub watcher
   * would. So merely rendering the menu added four notifications to the bell. Declaring it costs
   * one boolean, which a test pins against the real answer.
   */
  nativeCapable: boolean
  /** Not pure for the notification entries — call it once, when the card is actually delivered. */
  build: (t: TFunction) => NotchRequest
}

/** Does something that is not a single card — several at once, or a store mutation. */
export interface DebugEffectAction extends DebugActionBase {
  kind: 'effect'
  run: (t: TFunction) => void | Promise<void>
}

export type DebugAction = DebugCardAction | DebugEffectAction

/** A demo repository path, so transfer cards have a plausible name on them. */
const DEMO_REPO = '/Users/dev/Workspace/git-manager'

/**
 * Shows a card on the surface asked for, and nowhere else.
 *
 * `forceSurface` rather than the ordinary policy: these buttons exist to *aim* a card, and one
 * that quietly went to a banner because that is the user's setting would be testing the setting.
 */
export async function deliverDebugCard(
  request: NotchRequest,
  surface: DebugSurface
): Promise<void> {
  if (surface === 'native') {
    await apiSendNativeNotification(nativeSpecFor(request))
    return
  }
  useNotchQueueStore.getState().enqueue({ ...request, forceSurface: 'notch' })
}

/** Whether this card has a banner form at all — a live progress card does not. */
export function supportsNativeSurface(action: DebugAction): boolean {
  return action.kind === 'card' && action.nativeCapable
}

/**
 * Builds the request for a bell notification, through the app's own adapter.
 *
 * The notification is added to the store first, exactly as the GitHub watcher would, so these
 * exercise the real path — the bell's unread count included — rather than a shortcut to a card.
 */
function notificationRequest(
  notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>,
  t: TFunction
): NotchRequest {
  const created = useNotificationStore.getState().addNotification(notification)
  return notchRequestFromNotification(created, t)
}

/** An ambient card built straight from a model, for the shapes with no domain behind them. */
function card(model: NotchModel, importance: NotchRequest['importance'] = 'ambient'): NotchRequest {
  return { model, importance }
}

/**
 * The one real picture these fixtures are entitled to: the signed-in user's own.
 *
 * The `review` fixture used to hardcode `avatars.githubusercontent.com/u/1`, which is not a
 * placeholder at all — it is an actual GitHub account, so the card put a stranger's face on an
 * invented pull request. No account connected means no picture, and the card falls back to the
 * author's initials like every other faceless notification.
 */
function selfAvatar(): string | undefined {
  const github = useSettingsStore.getState().settings.github
  const account = github?.accounts?.find((a) => a.id === github.activeAccountId)
  return account?.user?.avatarUrl || undefined
}

// Only `review` carries a picture, and only when there is a real one to carry (see `selfAvatar`).
// The others deliberately have none — a bot author is the realistic faceless case — so between
// them the two paths of the card's avatar slot are both exercised.
const PR_FIXTURES = {
  review: {
    type: 'review_requested',
    repo: 'git-manager',
    fullName: 'Tlahey/git-manager',
    prNumber: 247,
    prTitle: 'feat: Add support for dev-mode test notifications',
    prId: 'debug-pr-review',
    author: 'antoine',
    url: 'https://github.com/Tlahey/git-manager/pull/247',
    targetTab: 'waiting',
  },
  merged: {
    type: 'pr_merged',
    repo: 'git-manager',
    fullName: 'Tlahey/git-manager',
    prNumber: 244,
    prTitle: 'fix: Memory leak in GraphRow',
    prId: 'debug-pr-merge',
    author: 'marie',
    url: 'https://github.com/Tlahey/git-manager/pull/244',
    targetTab: 'prs',
  },
  ciGreen: {
    type: 'ci_success',
    repo: 'git-manager',
    fullName: 'Tlahey/git-manager',
    prNumber: 250,
    prTitle: 'ci: Add automatic lint and code style check',
    prId: 'debug-pr-ci-green',
    author: 'github-actions',
    url: 'https://github.com/Tlahey/git-manager/pull/250',
    targetTab: 'prs',
  },
  ciRed: {
    type: 'ci_failed',
    repo: 'git-manager',
    fullName: 'Tlahey/git-manager',
    prNumber: 251,
    prTitle: 'test: Add integration tests for Tauri bridge',
    prId: 'debug-pr-ci-red',
    author: 'github-actions',
    url: 'https://github.com/Tlahey/git-manager/pull/251',
    targetTab: 'prs',
  },
} satisfies Record<string, Omit<AppNotification, 'id' | 'createdAt' | 'read'>>

export const DEBUG_ACTIONS: DebugAction[] = [
  // ── Notifications ───────────────────────────────────────────────────────────────────────────
  {
    id: 'notify-review',
    kind: 'card',
    nativeCapable: true,
    group: 'Notifications',
    label: 'Review requested',
    hint: 'Lavender halo, and your own avatar when an account is connected.',
    build: (t) => {
      const src = selfAvatar()
      return notificationRequest(
        { ...PR_FIXTURES.review, ...(src ? { authorAvatar: src } : {}) },
        t
      )
    },
  },
  {
    id: 'notify-merged',
    kind: 'card',
    nativeCapable: true,
    group: 'Notifications',
    label: 'Pull request merged',
    hint: 'Purple halo — the one tone reserved for a long road ending well.',
    build: (t) => notificationRequest(PR_FIXTURES.merged, t),
  },
  {
    id: 'notify-ci-green',
    kind: 'card',
    nativeCapable: true,
    group: 'Notifications',
    label: 'Checks passed',
    hint: 'Green halo, and the avatar falls back to initials (bot author).',
    build: (t) => notificationRequest(PR_FIXTURES.ciGreen, t),
  },
  {
    id: 'notify-ci-red',
    kind: 'card',
    nativeCapable: true,
    group: 'Notifications',
    label: 'Checks failed',
    hint: 'Red halo. On the notch, sent while another card is up, it cuts in front of it.',
    build: (t) => notificationRequest(PR_FIXTURES.ciRed, t),
  },

  // ── Notch cards ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'notch-progress-determinate',
    kind: 'card',
    nativeCapable: false,
    group: 'Notch cards',
    label: 'Progress — with a total',
    hint: 'A bar at 40 %, and no auto-dismiss: a live card ends when its producer says so.',
    build: () =>
      card({
        kind: 'progress',
        id: 'debug-progress',
        tone: 'running',
        eyebrow: 'Cloning',
        context: 'git-manager',
        title: 'Receiving objects',
        ratio: 0.4,
        detail: '1 240 / 3 100 objects · 4.2 MB',
        actions: [{ id: 'cancel', label: 'Cancel' }],
      }),
  },
  {
    id: 'notch-progress-indeterminate',
    kind: 'card',
    nativeCapable: false,
    group: 'Notch cards',
    label: 'Progress — total unknown',
    hint: 'The travelling sliver, for an operation that cannot count yet.',
    build: () =>
      card({
        kind: 'progress',
        id: 'debug-progress-indeterminate',
        tone: 'running',
        eyebrow: 'Searching commits',
        context: 'git-manager',
        title: 'Reading the commits that touched the notch',
        detail: 'quick scan · counting candidates',
      }),
  },
  {
    id: 'notch-status-success',
    kind: 'card',
    nativeCapable: false,
    group: 'Notch cards',
    label: 'Status — success',
    hint: 'Terminal card with an Open action.',
    build: () =>
      card({
        kind: 'status',
        id: 'debug-status-ok',
        tone: 'success',
        eyebrow: 'Dev server',
        context: 'git-manager · pnpm dev',
        meta: '4.1 s',
        title: 'Vite is listening on http://localhost:5173',
        actions: [{ id: 'activate', label: 'Open', variant: 'primary' }],
      }),
  },
  {
    id: 'notch-status-failure',
    kind: 'card',
    nativeCapable: true,
    group: 'Notch cards',
    label: 'Status — failure with output',
    hint: 'Three lines of process output, and a taller card to fit them.',
    build: () =>
      card(
        {
          kind: 'status',
          id: 'debug-status-failed',
          tone: 'error',
          eyebrow: 'Pre-commit hook',
          context: 'git-manager',
          meta: '3.4 s',
          title: 'lint-staged exited with code 1 — nothing was committed',
          outputLines: [
            '✖ oxlint --fix apps/desktop/src',
            '  NotchCard.tsx:42  no-unused-vars  "toneRgb" is never read',
            '✖ lint-staged failed',
          ],
          actions: [{ id: 'show-output', label: 'Show output', variant: 'primary' }],
        },
        'key'
      ),
  },
  {
    id: 'notch-unhandled-action',
    kind: 'card',
    nativeCapable: false,
    group: 'Notch cards',
    label: 'Card with an unhandled action',
    hint: 'Pressing its button should log a warning, not fail silently.',
    build: () =>
      card({
        kind: 'status',
        id: 'debug-unhandled',
        tone: 'neutral',
        eyebrow: 'Debug',
        title: 'This button has no registered handler',
        actions: [{ id: 'nobody-listens', label: 'Press me', variant: 'primary' }],
      }),
  },

  // ── Notch queue ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'queue-burst',
    kind: 'effect',
    group: 'Notch queue',
    label: 'Send three at once',
    hint: 'They queue instead of destroying each other; watch them come out in order.',
    run: (t) => {
      const queue = useNotchQueueStore.getState()
      for (const fixture of [PR_FIXTURES.review, PR_FIXTURES.merged, PR_FIXTURES.ciGreen]) {
        queue.enqueue({ ...notificationRequest(fixture, t), forceSurface: 'notch' })
      }
    },
  },
  {
    id: 'queue-preempt',
    kind: 'effect',
    group: 'Notch queue',
    label: 'Interrupt with an error',
    hint: 'A progress card, then an error: the error cuts in and the progress comes back after.',
    run: () => {
      const queue = useNotchQueueStore.getState()
      queue.enqueue({
        model: {
          kind: 'progress',
          id: 'debug-preempted',
          tone: 'running',
          eyebrow: 'Pushing',
          context: 'git-manager',
          title: 'Writing objects',
          ratio: 0.6,
        },
        importance: 'ambient',
        forceSurface: 'notch',
      })
      queue.enqueue({
        model: {
          kind: 'status',
          id: 'debug-preemptor',
          tone: 'error',
          eyebrow: 'Pre-commit hook',
          context: 'git-manager',
          title: 'lint-staged failed',
        },
        importance: 'key',
        forceSurface: 'notch',
      })
    },
  },
  {
    id: 'queue-clear',
    kind: 'effect',
    group: 'Notch queue',
    label: 'Clear the queue',
    hint: 'Empties it and closes the window, whatever was showing.',
    run: () => useNotchQueueStore.getState().clear(),
  },

  // ── Transfers ───────────────────────────────────────────────────────────────────────────────
  // These drive the real store the fetch/pull/push cards read, so they exercise the whole path —
  // gating settings included — without needing a remote, a network, or a repository at all.
  {
    id: 'transfer-fetch-running',
    kind: 'effect',
    group: 'Transfers',
    label: 'Fetch in flight',
    hint: 'Respects the "Fetch" toggle in Settings › Notifications.',
    run: () => {
      const store = useRemoteProgressStore.getState()
      store.start(DEMO_REPO, 'fetch')
      store.report({
        repoPath: DEMO_REPO,
        operation: 'fetch',
        phase: 'receiving',
        completed: 320,
        total: 1000,
        bytes: 3 * 1024 * 1024,
      })
    },
  },
  {
    id: 'transfer-fetch-background',
    kind: 'effect',
    group: 'Transfers',
    label: 'Scheduled fetch in flight',
    hint: 'The auto-fetch. Should show NO progress card — it runs every interval, focused or not.',
    run: () => {
      const store = useRemoteProgressStore.getState()
      store.start(DEMO_REPO, 'fetch', true)
      store.report({
        repoPath: DEMO_REPO,
        operation: 'fetch',
        phase: 'receiving',
        completed: 320,
        total: 1000,
        bytes: 3 * 1024 * 1024,
      })
    },
  },
  {
    id: 'transfer-fetch-background-failed',
    kind: 'effect',
    group: 'Transfers',
    label: 'Scheduled fetch that failed',
    hint: 'The auto-fetch offline. Should leave no card and no banner at all — same contract as a manual fetch’s own silent failure.',
    run: () => {
      const store = useRemoteProgressStore.getState()
      store.start(DEMO_REPO, 'fetch', true)
      store.finish(DEMO_REPO, 'fetch', {
        kind: 'error',
        message: 'unable to access the remote: Could not resolve host',
      })
    },
  },
  {
    id: 'transfer-fetch-empty',
    kind: 'effect',
    group: 'Transfers',
    label: 'Fetch that found nothing',
    hint: 'Should leave no card at all — the app fetches on a timer.',
    run: () => {
      const store = useRemoteProgressStore.getState()
      store.start(DEMO_REPO, 'fetch')
      store.finish(DEMO_REPO, 'fetch', { kind: 'success', updatedRefs: [] })
    },
  },
  {
    id: 'transfer-fetch-updated',
    kind: 'effect',
    group: 'Transfers',
    label: 'Fetch that updated branches',
    hint: 'Terminal card naming how many moved.',
    run: () => {
      const store = useRemoteProgressStore.getState()
      store.start(DEMO_REPO, 'fetch')
      store.finish(DEMO_REPO, 'fetch', {
        kind: 'success',
        updatedRefs: ['main → a1b2c3d', 'dev → 9f8e7d6'],
      })
    },
  },
  {
    id: 'transfer-push-failed',
    kind: 'effect',
    group: 'Transfers',
    label: 'Push that was rejected',
    hint: 'Error card with the tail of git’s message.',
    run: () => {
      const store = useRemoteProgressStore.getState()
      store.start(DEMO_REPO, 'push')
      store.finish(DEMO_REPO, 'push', {
        kind: 'error',
        message:
          'failed to push some refs\n! [rejected] main -> main (non-fast-forward)\nhint: integrate the remote changes first',
      })
    },
  },

  // ── AI runs ─────────────────────────────────────────────────────────────────────────────────
  // These drive the real activity store the AI card reads, so they exercise the whole path —
  // including the grace period that carries the card across the gaps in a map phase — with no
  // provider, no model and no repository. Shows regardless of focus, so click one and watch the
  // notch right here.
  {
    id: 'ai-file-analysis',
    kind: 'effect',
    group: 'AI runs',
    label: 'File analysis, file by file',
    hint: 'Ticks 1→8 over 8 s, one begin/end per file.',
    run: async () => {
      const store = useAiActivityStore.getState()
      const total = 8
      for (let done = 0; done < total; done++) {
        // One run per file, exactly as `summarizeFiles` produces them — the gaps between them are
        // the thing the card's grace period exists to survive.
        const runId = store.begin('file-summary', {
          repoPath: DEMO_REPO,
          panel: { kind: 'working' },
        })
        store.setProgress({ featureId: 'file-summary', completed: done, total })
        await new Promise((resolve) => setTimeout(resolve, 900))
        store.end(runId)
        store.setProgress({ featureId: 'file-summary', completed: done + 1, total })
      }
    },
  },
  {
    id: 'ai-streaming-run',
    kind: 'effect',
    group: 'AI runs',
    label: 'A single streaming run',
    hint: 'No steps to count, so an indeterminate bar. Ends after 6 s.',
    run: async () => {
      const store = useAiActivityStore.getState()
      const runId = store.begin('code-review', { repoPath: DEMO_REPO, panel: { kind: 'working' } })
      await new Promise((resolve) => setTimeout(resolve, 6000))
      store.end(runId)
    },
  },
  {
    id: 'ai-clear-runs',
    kind: 'effect',
    group: 'AI runs',
    label: 'Force every run to end',
    hint: 'For a run left hanging by a reload. The card goes after the grace period.',
    run: () => useAiActivityStore.setState({ runs: [], progress: null }),
  },
]

/** The groups in the order they should be shown, with no empties. */
export function debugActionGroups(
  actions: DebugAction[] = DEBUG_ACTIONS
): { group: DebugActionGroup; actions: DebugAction[] }[] {
  const groups: DebugActionGroup[] = [
    'Notifications',
    'Notch cards',
    'Notch queue',
    'Transfers',
    'AI runs',
  ]
  return groups
    .map((group) => ({ group, actions: actions.filter((action) => action.group === group) }))
    .filter((entry) => entry.actions.length > 0)
}
