import { useRef } from 'react'
import { GitGraph, Settings2, Terminal, type LucideIcon } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { InnerTab } from '@git-manager/components'
import {
  REPO_VIEW_IDS,
  useRepoViewTabsStore,
  type RepoViewId,
} from '../../../stores/repoViewTabs.store'

const VIEW_ICONS: Record<RepoViewId, LucideIcon> = {
  graph: GitGraph,
  terminal: Terminal,
  settings: Settings2,
}

/** Module-level maps can't call `t()`, so this holds i18n *keys* resolved inside the component. */
const VIEW_LABEL_KEYS: Record<RepoViewId, string> = {
  graph: 'repoViews.graph',
  terminal: 'repoViews.terminal',
  settings: 'repoViews.settings',
}

interface RepoViewTabsProps {
  /**
   * The repo tab these views belong to — the key its selection is stored under. Always the tab's own
   * repo path, never the linked worktree currently viewed in its place: entering a workspace is a
   * view swap inside the same tab, and it must not hand that tab a second view selection.
   */
  tabPath: string
}

/**
 * The strip of view tabs *inside* one repo tab: graph, terminal, settings. The outer tab bar picks
 * the repository; this one picks what that repository shows, and each repo tab keeps its own
 * selection (see `repoViewTabs.store.ts`).
 */
export function RepoViewTabs({ tabPath }: RepoViewTabsProps) {
  const { t } = useTranslation('git')
  const activeView = useRepoViewTabsStore((s) => s.activeViewFor(tabPath))
  const setActiveView = useRepoViewTabsStore((s) => s.setActiveView)
  const listRef = useRef<HTMLDivElement>(null)

  /** Left/right arrows move between tabs, as expected of a `tablist` (WAI-ARIA tabs pattern). */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    const index = REPO_VIEW_IDS.indexOf(activeView)
    const next = REPO_VIEW_IDS[(index + delta + REPO_VIEW_IDS.length) % REPO_VIEW_IDS.length]
    setActiveView(tabPath, next)
    listRef.current?.querySelector<HTMLElement>(`[data-testid="repo-view-tab-${next}"]`)?.focus()
  }

  // `chrome-surface` + `bg-sidebar`: the same nav palette as the toolbar directly above, so the two
  // read as one piece of chrome rather than as a strip floating over the content.
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={t('repoViews.label')}
      onKeyDown={onKeyDown}
      data-testid="repo-view-tabs"
      className="chrome-surface flex shrink-0 items-center border-b border-border bg-sidebar px-3"
    >
      {REPO_VIEW_IDS.map((id) => {
        const Icon = VIEW_ICONS[id]
        const active = activeView === id
        return (
          <InnerTab
            key={id}
            role="tab"
            id={`repo-view-tab-${id}`}
            aria-selected={active}
            aria-controls={`repo-view-panel-${id}`}
            data-testid={`repo-view-tab-${id}`}
            active={active}
            onClick={() => setActiveView(tabPath, id)}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(VIEW_LABEL_KEYS[id])}
          </InnerTab>
        )
      })}
    </div>
  )
}
