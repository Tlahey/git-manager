import type { TFunction } from '@git-manager/i18n'
import type { SidebarRow, SidebarSection } from '../sidebar/types'
import type { PrFilterGroup } from '../hooks/useRepoPrFilters'
import type { IssueFilterGroup } from '../hooks/useRepoIssues'
import { prFilterLabel } from '../stores/prFilters.store'
import { issueFilterLabel } from '../stores/issueFilters.store'

/**
 * The two sidebar sections that are GitHub rather than git.
 *
 * Every other section lists something the repository itself holds — branches, tags, stashes,
 * worktrees, submodules — and can only be empty or filtered away. These two are network data, and
 * that gives them three states the others have no equivalent of: this is not a GitHub repo, no
 * account is connected, the request is still in flight. Those states are *reachability*, not
 * matching, which is why the search box never hides them.
 *
 * Extracted from `useSidebarRows`'s single 485-line `useMemo` because they are the two blocks in it
 * that answer a different question from the rest, and because as pure functions the state ordering
 * below can be read — and tested — without standing up the whole sidebar.
 */

/** What both builders need from the sidebar around them. */
export interface SidebarSectionContext {
  t: TFunction
  /** The left panel's search text. Only used to decide whether a *matched-nothing* section hides. */
  q: string
  isOpen: boolean
  /** Open state of a sub-group, with the section's own default when the user has not touched it. */
  subOpen: (id: string, def?: boolean) => boolean
}

interface PrSectionData {
  groups: PrFilterGroup[]
  /** De-duplicated across groups: the saved filters overlap by design. */
  count: number
  isGithub: boolean
  isConnected: boolean
  loading: boolean
  /** Branch currently checked out, so a PR row can mark itself as the one you are on. */
  selectedBranch: string | null
}

export function buildPrSection(
  { t, q, isOpen, subOpen }: SidebarSectionContext,
  { groups, count, isGithub, isConnected, loading, selectedBranch }: PrSectionData
): SidebarSection | null {
  const rows: SidebarRow[] = []

  if (isOpen) {
    if (!isGithub) {
      rows.push({ kind: 'message', id: 'pr:nogithub', text: t('sidebar.prs.noGithub') })
    } else if (!isConnected) {
      // Signed out: say so, and say where to fix it. Checked before everything below because
      // nothing below can happen — no request is made without a token (see `usePullRequests`), so
      // the saved views would otherwise sit here empty, or each report GitHub's transport error as
      // if its own query were at fault.
      rows.push({ kind: 'message', id: 'pr:noaccount', text: t('sidebar.prs.noAccount') })
    } else if (loading) {
      rows.push({
        kind: 'message',
        id: 'pr:loading',
        text: t('sidebar.prs.loading'),
        loading: true,
      })
    } else if (groups.length === 0) {
      rows.push({ kind: 'message', id: 'pr:nofilters', text: t('sidebar.prFilters.none') })
    } else {
      // Every saved filter is rendered, empty included: a saved view that vanished when it matched
      // nothing would read as a bug, and its header is the only way back to editing or deleting it.
      groups.forEach((group, index) => {
        const gid = `pr-filter:${group.filter.id}`
        // Only the first saved view is expanded by default: the others are one click away and each
        // costs a screenful in a section that shares the panel's height with the rest.
        const gopen = subOpen(gid, index === 0)
        rows.push({
          kind: 'subgroup',
          id: gid,
          label: prFilterLabel(group.filter, t),
          count: group.prs.length,
          isOpen: gopen,
          filter: group.filter,
          canMoveUp: index > 0,
          canMoveDown: index < groups.length - 1,
        })
        if (!gopen) return
        if (group.error) {
          // GitHub rejected this one query (a typo'd qualifier, a rate limit) — say so on the group
          // itself rather than leaving it silently empty next to working ones.
          rows.push({
            kind: 'message',
            id: `${gid}:error`,
            text: t('sidebar.prFilters.queryError', { error: group.error }),
          })
          return
        }
        if (group.prs.length === 0) {
          rows.push({ kind: 'message', id: `${gid}:empty`, text: t('sidebar.prs.empty') })
          return
        }
        for (const pr of group.prs) {
          rows.push({
            // The same PR can appear under several filters, so the row id has to carry the filter —
            // ids are React keys and must stay unique across the section.
            kind: 'pr',
            id: `pr:${group.filter.id}:${pr.number}`,
            pr,
            isSelected: !!pr.headRef && selectedBranch === pr.headRef,
            depth: 1,
          })
        }
      })
    }
  }

  // Hidden while actively filtering down to zero matches; the reachability states above stay
  // visible regardless of the filter, since they are not about matching.
  const hideForFilter = q && isGithub && isConnected && !loading && count === 0
  if (hideForFilter) return null

  return { key: 'prs', title: 'Pull Requests', count: count || undefined, isOpen, rows }
}

interface IssueSectionData {
  groups: IssueFilterGroup[]
  count: number
  isGithub: boolean
  isConnected: boolean
  loading: boolean
}

/**
 * Mirrors {@link buildPrSection}, with one difference worth keeping: this section stays visible
 * when the repository simply has no issues, because its header carries the "new issue" action.
 */
export function buildIssueSection(
  { t, q, isOpen, subOpen }: SidebarSectionContext,
  { groups, count, isGithub, isConnected, loading }: IssueSectionData
): SidebarSection | null {
  const rows: SidebarRow[] = []

  if (isOpen) {
    if (!isGithub) {
      rows.push({ kind: 'message', id: 'issue:nogithub', text: t('sidebar.issues.noGithub') })
    } else if (!isConnected) {
      // Same order and same reason as the PR section: signed out is checked first, because with no
      // token nothing is fetched and every state below would be a lie.
      rows.push({ kind: 'message', id: 'issue:noaccount', text: t('sidebar.issues.noAccount') })
    } else if (loading) {
      rows.push({
        kind: 'message',
        id: 'issue:loading',
        text: t('sidebar.issues.loading'),
        loading: true,
      })
    } else if (groups.length === 0) {
      rows.push({ kind: 'message', id: 'issue:nofilters', text: t('sidebar.issueFilters.none') })
    } else {
      groups.forEach((group, index) => {
        const gid = `issue-filter:${group.filter.id}`
        const gopen = subOpen(gid, index === 0)
        rows.push({
          kind: 'subgroup',
          id: gid,
          label: issueFilterLabel(group.filter, t),
          count: group.issues.length,
          isOpen: gopen,
          filter: group.filter,
          canMoveUp: index > 0,
          canMoveDown: index < groups.length - 1,
        })
        if (!gopen) return
        if (group.error) {
          rows.push({
            kind: 'message',
            id: `${gid}:error`,
            text: t('sidebar.issueFilters.queryError', { error: group.error }),
          })
          return
        }
        if (group.issues.length === 0) {
          rows.push({ kind: 'message', id: `${gid}:empty`, text: t('sidebar.issues.empty') })
          return
        }
        for (const issue of group.issues) {
          // The same issue can match several filters, so the row id has to carry the filter.
          rows.push({ kind: 'issue', id: `issue:${group.filter.id}:${issue.id}`, issue })
        }
      })
    }
  }

  const hideForFilter = q && isGithub && isConnected && !loading && count === 0
  if (hideForFilter) return null

  return { key: 'issues', title: 'Issues', count: count || undefined, isOpen, rows }
}
