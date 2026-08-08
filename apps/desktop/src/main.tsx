import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/app-error-boundary/AppErrorBoundary'
import { ConflictMergeWindow } from './components/merge-editor/ConflictMergeWindow'
import { FixupCommitWindow } from './components/git-graph/fixup/FixupCommitWindow'
import { RebasingCommitWindow } from './components/rebase-editor/RebasingCommitWindow'
import { ActionJournalWindow } from './app/action-journal/ActionJournalWindow'
import { NotchWindow } from './app/notch/NotchWindow'
import type { NotchPayload } from './lib/notifications/notchWindow'
import { initI18n } from '@git-manager/i18n'
import { useSettingsStore } from './stores/settings.store'
import { hydrateConfigStores, registerConfigFlushOnUnload } from './lib/appConfig'
import { useRepoUIStore } from './stores/repoUI.store'
import { useBisectUIStore } from './stores/bisectUI.store'
import { useNotchQueueStore } from './stores/notchQueue.store'
import { useGameStore } from './stores/game.store'
import { hideAppSplash } from './lib/appSplash'
import { shortOid as toShortOid } from './lib/shortOid'
import '@git-manager/ui/globals.css'
import '@git-manager/editor/styles.css'
import './index.css'

// WebdriverIO's Tauri plugin auto-initializes on import and must load before tests run.
// import.meta.env.VITE_E2E is a build-time constant, so this branch (and the whole
// @wdio/tauri-plugin chunk) is dead-code-eliminated from every non-e2e build.
const e2eSetup =
  import.meta.env.VITE_E2E === 'true' ? import('@wdio/tauri-plugin') : Promise.resolve()

// e2e-only debug hook: lets step definitions read live Zustand state directly (e.g.
// `selectedCommitOid`) instead of inferring it from a DOM attribute, which can't tell "React
// state never changed" apart from "the DOM just hasn't reflected it yet". Same dead-code-elimination
// guarantee as the wdio plugin above — stripped from every non-e2e build.
if (import.meta.env.VITE_E2E === 'true') {
  ;(window as unknown as { __e2eRepoUIStore: typeof useRepoUIStore }).__e2eRepoUIStore =
    useRepoUIStore
  // Exposed for the bisect e2e steps: reading `pendingBadOid`/`pendingGoodOid` confirms a
  // graph-row pick actually filled a slot (row clicks are intercepted during setup, so the
  // repoUI `selectedCommitOid` bridge stays untouched and can't be used as the signal).
  ;(window as unknown as { __e2eBisectUIStore: typeof useBisectUIStore }).__e2eBisectUIStore =
    useBisectUIStore
  // Exposed so the suite's `Before` hook can force settings (theme, row height, ...) on the *live*
  // store, not just in localStorage: the app window is shared across every feature in the run, and
  // a scenario whose own Given steps never navigate (e.g. "the git-manager application is running",
  // used by most Settings scenarios) never re-hydrates from localStorage — it would otherwise keep
  // whatever a previous scenario last set live (e.g. the theme-picker scenario ending on "dark").
  ;(window as unknown as { __e2eSettingsStore: typeof useSettingsStore }).__e2eSettingsStore =
    useSettingsStore
  // Exposed for the git-hooks e2e steps: a refused hook's card lands on the notch, which is a
  // *separate* WebviewWindow, and driving a second window over this provider is fragile enough
  // (a click in it throws, and the command after it self-closes) to make it the wrong place to
  // assert from. The queue in this window is where the card is actually produced — real hook,
  // real AppError, real parse, real enqueue — so reading it here tests the whole chain and stops
  // exactly at the window boundary.
  ;(window as unknown as { __e2eNotchQueueStore: typeof useNotchQueueStore }).__e2eNotchQueueStore =
    useNotchQueueStore
  // Exposed so the suite's `Before` hook can retire a live trophy toast: achievements unlock as a
  // side effect of ordinary git actions, and the toast lives on `recentUnlock` in the live store —
  // clearing the persisted game-store key alone leaves the previous scenario's toast on screen
  // (4.5s lifetime, i.e. well into the next scenario), where it bleeds into visual captures.
  ;(window as unknown as { __e2eGameStore: typeof useGameStore }).__e2eGameStore = useGameStore
}

// Read the configuration off disk before anything reads it, then initialize i18n with the persisted
// language choice. Every configuration-backed store is created with `skipHydration` because the file
// (`~/.git-manager/settings.json`, see lib/appConfig/) is read asynchronously — without this gate
// the app would paint its first frame with no tabs, in the default language and theme, and only
// then become itself. It never rejects: a missing or unreadable file leaves the defaults in place.
e2eSetup
  .then(() => hydrateConfigStores())
  .then(() => {
    registerConfigFlushOnUnload()
    return initI18n(useSettingsStore.getState().settings.language)
  })
  .then(() => {
    const params = new URLSearchParams(window.location.search)
    const windowKind = params.get('window')
    const repoPath = params.get('repoPath')
    const filePath = params.get('filePath')
    const oid = params.get('oid')
    const shortOid = params.get('shortOid')
    const subject = params.get('subject')
    const baseOid = params.get('baseOid')
    const payload = params.get('payload')

    let content: React.ReactNode
    // The main App window keeps the splash up until it's actually ready (see
    // useAppReadySplash); the dedicated merge/rebase/fixup windows have no such
    // startup load, so they drop the splash on their first frame.
    let isAppWindow = false

    /**
     * Closes a secondary window that cannot render what it was opened for.
     *
     * A `?window=` value states what this window IS. Whenever one of them can't be honoured —
     * missing `repoPath`/`oid`, an unparseable notch payload, a kind we don't know — the only
     * outcome that must never happen is falling through to `<App />`: that puts the *entire
     * application* inside a window sized and titled for something else. It has now happened
     * twice — once in the notch (the whole app in a small transparent always-on-top strip over
     * the menu bar, undismissable), and once in the "Commit Changes" window, which came back
     * showing the Launchpad. Rendering nothing and closing is strictly better than either.
     */
    function closeUnrenderableWindow(reason: string) {
      console.error(`Closing the "${windowKind}" window: ${reason}`)
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().close())
        .catch((e) => console.warn('Failed to close an unrenderable window:', e))
    }

    if (windowKind === 'merge' && repoPath && filePath) {
      content = <ConflictMergeWindow repoPath={repoPath} filePath={filePath} />
    } else if (windowKind === 'rebase' && repoPath && baseOid) {
      content = <RebasingCommitWindow repoPath={repoPath} baseOid={baseOid} />
    } else if (windowKind === 'fixup' && repoPath && oid) {
      content = (
        <FixupCommitWindow
          repoPath={repoPath}
          targetOid={oid}
          targetShortOid={shortOid ?? toShortOid(oid)}
          targetSubject={subject ?? ''}
        />
      )
    } else if (windowKind === 'actions') {
      // No parameter: the journal is app-wide, reading the activity log rather than a repository.
      content = <ActionJournalWindow />
    } else if (windowKind === 'notch') {
      // A card whose content cannot be read is a card with nothing to draw. The window is closed
      // rather than left blank, since nothing else would ever retire it: an empty card never
      // announces a dismissal.
      let parsed: NotchPayload | null = null
      try {
        parsed = payload ? (JSON.parse(payload) as NotchPayload) : null
      } catch (e) {
        console.error('Invalid notch payload:', e)
      }
      content = parsed ? <NotchWindow {...parsed} /> : null
      if (!parsed) closeUnrenderableWindow('its payload is missing or unparseable')
    } else if (windowKind) {
      // A named window whose parameters didn't survive (a reload that dropped the query string, a
      // navigation into an existing window, a malformed URL). See `closeUnrenderableWindow`.
      content = null
      closeUnrenderableWindow('it is unknown, or its required parameters are missing')
    } else {
      content = <App />
      isAppWindow = true
    }

    ReactDOM.createRoot(document.getElementById('root')!).render(
      // The boundary is the difference between one crashed view and a silently blank window: an
      // uncaught commit-phase error otherwise unmounts everything under #root (seen on WKWebView
      // as "NotFoundError: The object can not be found here" during full e2e runs).
      <React.StrictMode>
        <AppErrorBoundary>{content}</AppErrorBoundary>
      </React.StrictMode>
    )
    if (!isAppWindow) requestAnimationFrame(hideAppSplash)
  })
