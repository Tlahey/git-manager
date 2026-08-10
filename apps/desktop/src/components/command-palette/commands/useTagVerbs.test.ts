import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitRef } from '@git-manager/git-types'

vi.mock('@git-manager/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const invalidateQueries = vi.fn()
const { tagsQuery } = vi.hoisted(() => ({ tagsQuery: { current: [] as GitRef[] } }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useQuery: () => ({ data: tagsQuery.current }),
}))

const { apiGetTags, apiPushTag, apiDeleteTag } = vi.hoisted(() => ({
  apiGetTags: vi.fn(),
  apiPushTag: vi.fn(),
  apiDeleteTag: vi.fn(),
}))
vi.mock('../../../api/git.api', () => ({ apiGetTags, apiPushTag, apiDeleteTag }))

import { useTagVerbs } from './useTagVerbs'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useRepoViewStore } from '../../../stores/repoView.store'
import type { RefVerb } from './refCommandRows'
import type { RefPickerVerb } from '../../../stores/commandPalette.store'

const REPO = '/repo'
const INITIAL_UI = useRepoUIStore.getState()

function tag(shortName: string): GitRef {
  return {
    name: `refs/tags/${shortName}`,
    shortName,
    type: 'tag',
    commitOid: `oid-${shortName}`,
  }
}

/** Puts an active repo up with the given tags loaded. */
function setup(tags: GitRef[] = []) {
  tagsQuery.current = tags
  useRepoUIStore.setState({ activeRepo: REPO })
  const { result } = renderHook(() => useTagVerbs())
  return result.current
}

const find = (verbs: RefVerb[], verb: RefPickerVerb) => verbs.find((v) => v.verb === verb)!
const candidates = (verbs: RefVerb[], verb: RefPickerVerb) =>
  find(verbs, verb).targets.map((target) => target.name)

/** Applies a verb to one of its tags, by name. */
const apply = (verbs: RefVerb[], verb: RefPickerVerb, tagName: string) =>
  find(verbs, verb)
    .targets.find((target) => target.name === tagName)!
    .run()

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL_UI, true)
  useRepoViewStore.setState({ view: 'graph', isPanelOpen: true })
  tagsQuery.current = []
  apiPushTag.mockResolvedValue(undefined)
  apiDeleteTag.mockResolvedValue(undefined)
})

describe('useTagVerbs — which verbs exist', () => {
  it('offers none without an active repo', () => {
    const { result } = renderHook(() => useTagVerbs())
    expect(result.current).toEqual([])
  })

  // Three verbs, whatever the size of the tag list — where it used to be three rows *per tag*.
  it('offers the three tag verbs, each over every tag', () => {
    const verbs = setup([tag('v1.0'), tag('v2.0')])
    expect(verbs.map((v) => v.verb)).toEqual(['pushTag', 'deleteTag', 'deleteRemoteTag'])
    for (const verb of verbs) expect(verb.targets.map((t) => t.name)).toEqual(['v1.0', 'v2.0'])
  })

  // An empty target list is how `buildRefCommands` knows not to offer the verb at all.
  it('leaves every verb empty in a repo with no tags', () => {
    for (const verb of setup([])) expect(verb.targets).toEqual([])
  })

  it('names a tag as the palette shows it', () => {
    expect(candidates(setup([tag('v1.0')]), 'pushTag')).toEqual(['v1.0'])
  })
})

describe('useTagVerbs — what applying one does', () => {
  it('pushes a tag', () => {
    apply(setup([tag('v1.0')]), 'pushTag', 'v1.0')
    expect(apiPushTag).toHaveBeenCalledWith(REPO, 'v1.0')
  })

  it('deletes a local tag through the undo-recording wrapper, with its target oid', () => {
    apply(setup([tag('v1.0')]), 'deleteTag', 'v1.0')
    expect(apiDeleteTag).toHaveBeenCalledWith(REPO, 'v1.0', { targetOid: 'oid-v1.0' })
  })

  // Destructive on someone else's clone too: this one opens the confirmation the menus open,
  // rather than deleting outright.
  it('deleting a remote tag opens the confirmation rather than deleting outright', () => {
    apply(setup([tag('v1.0')]), 'deleteRemoteTag', 'v1.0')
    expect(useRepoUIStore.getState().pendingTagDialog).toEqual({
      kind: 'deleteRemote',
      tagName: 'v1.0',
      oid: 'oid-v1.0',
      remote: 'origin',
    })
  })
})

describe('useTagVerbs — where the result is seen', () => {
  // The palette opens on any view, and a pushed tag shows on the graph.
  it('pushing a tag lands on the content view', () => {
    const verbs = setup([tag('v1.0')])
    useRepoViewStore.setState({ view: 'board' })
    apply(verbs, 'pushTag', 'v1.0')
    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  // Its dialog is mounted outside the view switch, so it opens on the board as it is — dragging the
  // user to the graph to confirm a deletion would be a detour, not a destination.
  it('a remote-tag deletion opens its confirmation without moving the user', () => {
    const verbs = setup([tag('v1.0')])
    useRepoViewStore.setState({ view: 'board' })
    apply(verbs, 'deleteRemoteTag', 'v1.0')
    expect(useRepoViewStore.getState().view).toBe('board')
  })
})
