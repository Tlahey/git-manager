import { useState, createElement } from 'react'
import { Crosshair } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@git-manager/ui'
import { useCommandPaletteStore } from '../../stores/commandPalette.store'
import { useRepoUIStore } from '../../stores/repoUI.store'
import { goToRepoContent } from '../../stores/repoView.store'
import { shortOid } from '../../lib/shortOid'
import { useGlobalCommands } from './commands/useGlobalCommands'
import { useCommitCommands } from './commands/useCommitCommands'
import { useStashCommands } from './commands/useStashCommands'
import { useRefCommands } from './commands/useRefCommands'
import { useFileLookupCommands } from './commands/useFileLookupCommands'
import { highlightMatch } from '@git-manager/components'
import { scoreCommand } from './commandMatch'
import type { Section } from '../../app/settings/SettingsPage'
import type { PaletteCommand, PaletteGroup } from './commands/types'

/** A commit-ish string the user can paste to jump straight to that commit in the graph. */
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i

/**
 * Builds the "focus this commit in the graph" command when the query looks like a SHA. Running it
 * hands the (possibly abbreviated) SHA to `GitGraph` via `pendingGraphSelection`, which resolves it
 * to a loaded commit, selects the row and scrolls it into view. GitHub-open / copy-SHA / reset / …
 * then become reachable through the "Commit" group once the row is selected.
 */
function useCommitLookupCommands(query: string): PaletteCommand[] {
  const { t } = useTranslation('common')
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setPendingGraphSelection = useRepoUIStore((s) => s.setPendingGraphSelection)
  const setActivePrNumber = useRepoUIStore((s) => s.setActivePrNumber)
  const setPrComposer = useRepoUIStore((s) => s.setPrComposer)
  const setPrCreateOpen = useRepoUIStore((s) => s.setPrCreateOpen)

  const sha = query.trim()
  if (!activeRepo || !SHA_PATTERN.test(sha)) return []

  return [
    {
      id: 'lookup-focus-commit',
      group: 'lookup',
      title: t('commandPalette.lookup.focusCommit', { sha: sha.slice(0, 12) }),
      keywords: [sha],
      icon: createElement(Crosshair),
      run: () => {
        // Same clearing, one step out: the commit only exists on the graph, so a SHA typed while the
        // board is on screen has to bring that view back before anything can be focused in it.
        goToRepoContent()
        // The graph cedes its center panel to any open PR view/composer; clear those so the newly
        // focused commit is actually visible (an open file diff clears itself on selection change).
        setActivePrNumber(null)
        setPrComposer(null)
        setPrCreateOpen(false)
        setPendingGraphSelection(sha)
      },
    },
  ]
}

/**
 * A row's title with the part that answered the query marked.
 *
 * Everything it needs comes from the row itself (`highlight`), not from the palette's query, because
 * a row can spell out more than the thing being searched. `checkout ada-boost` is found by typing
 * `ada`: `from` keeps the verb out of the marking, and `query` is the argument alone — which is also
 * what lets a match land anywhere in the branch, `checkout ada-**boost**` included. Marking the
 * whole query across the whole title could only ever find it where it sat flush against the verb.
 */
function MarkedTitle({ command }: { command: PaletteCommand }) {
  const { query, from = 0 } = command.highlight ?? { query: '' }

  return (
    <>
      {command.title.slice(0, from)}
      {highlightMatch(command.title.slice(from), query)}
    </>
  )
}

interface CommandPaletteProps {
  onOpenSettings: (section: Section) => void
  onCloseSettings: () => void
  onOpenActivityLogs: () => void
}

/**
 * Spotlight-style command palette (⌘P), mounted once at the app root. Open/close state lives in
 * `commandPalette.store`; the actual command list is built by the registry hooks only while the
 * dialog is open (they mount inside the dialog content, which Radix unmounts when closed).
 */
export function CommandPalette({
  onOpenSettings,
  onCloseSettings,
  onOpenActivityLogs,
}: CommandPaletteProps) {
  const open = useCommandPaletteStore((s) => s.open)
  const closePalette = useCommandPaletteStore((s) => s.closePalette)

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closePalette()
      }}
      // Our own scorer rather than cmdk's, which accepts any subsequence: `ada` matched a branch
      // that merely had an a, a d and an a scattered through it, and a row could be listed with
      // nothing in it the user had actually typed. See `scoreCommand` for the order it produces.
      filter={scoreCommand}
    >
      {open && (
        <CommandPaletteBody
          onOpenSettings={onOpenSettings}
          onCloseSettings={onCloseSettings}
          onOpenActivityLogs={onOpenActivityLogs}
          onDone={closePalette}
        />
      )}
    </CommandDialog>
  )
}

interface CommandPaletteBodyProps {
  onOpenSettings: (section: Section) => void
  onCloseSettings: () => void
  onOpenActivityLogs: () => void
  onDone: () => void
}

function CommandPaletteBody({
  onOpenSettings,
  onCloseSettings,
  onOpenActivityLogs,
  onDone,
}: CommandPaletteBodyProps) {
  const { t } = useTranslation('common')
  const [search, setSearch] = useState('')
  const mode = useCommandPaletteStore((s) => s.mode)
  // The branch action waiting for its target, or null for the ordinary list — see `RefPickerStep`.
  const refPicker = useCommandPaletteStore((s) => s.refPicker)
  const setRefPicker = useCommandPaletteStore((s) => s.setRefPicker)
  const selectedCommitOid = useRepoUIStore((s) => s.selectedCommitOid)
  const selectedStashIndex = useRepoUIStore((s) => s.selectedStashIndex)
  const globalCommands = useGlobalCommands({ onOpenSettings, onOpenActivityLogs })
  const commitCommands = useCommitCommands()
  const stashCommands = useStashCommands()
  const refCommands = useRefCommands(search)
  const isFilesOnly = mode === 'files'
  const lookupCommands = useCommitLookupCommands(search)
  const fileCommands = useFileLookupCommands(isFilesOnly ? search : '')

  // Lookup (paste-a-sha) first, then file search, then commit/stash actions — the most contextual.
  // Picking a branch for a verb is one question: everything else steps aside until it is answered.
  const allCommands = refPicker
    ? refCommands
    : [
        ...lookupCommands,
        ...fileCommands,
        ...commitCommands,
        ...stashCommands,
        ...refCommands,
        ...globalCommands,
      ]

  function run(cmd: PaletteCommand) {
    // A command that only narrows the palette (a branch verb awaiting its target) leaves the dialog
    // open, and clears the query so the next screen starts from an empty search rather than from
    // the letters that found the verb.
    if (cmd.keepOpen) {
      cmd.run()
      setSearch('')
      return
    }
    // Running any non-settings command should return the user to the main view if they triggered it
    // from within Settings; settings commands manage their own section instead.
    if (cmd.group !== 'settings') onCloseSettings()
    cmd.run()
    onDone()
  }

  /** Leaves the branch picker for the full list, keeping the palette open. */
  function backToCommands() {
    setRefPicker(null)
    setSearch('')
  }

  const groups: { group: PaletteGroup; heading: string }[] = refPicker
    ? [{ group: 'ref', heading: refPicker.label }]
    : isFilesOnly
      ? [
          { group: 'lookup', heading: t('commandPalette.group.lookup') },
          { group: 'files', heading: t('commandPalette.group.files') },
        ]
      : [
          { group: 'lookup', heading: t('commandPalette.group.lookup') },
          {
            group: 'commit',
            heading: t('commandPalette.group.commit', {
              sha: selectedCommitOid ? shortOid(selectedCommitOid) : '',
            }),
          },
          {
            group: 'stash',
            heading: t('commandPalette.group.stash', { index: selectedStashIndex ?? '' }),
          },
          { group: 'ref', heading: t('commandPalette.group.ref') },
          { group: 'navigation', heading: t('commandPalette.group.navigation') },
          { group: 'repo', heading: t('commandPalette.group.repo') },
          { group: 'settings', heading: t('commandPalette.group.settings') },
        ]

  return (
    <>
      <CommandInput
        data-testid="command-palette-input"
        placeholder={
          refPicker
            ? t('commandPalette.placeholderRef')
            : isFilesOnly
              ? t('commandPalette.placeholderFiles')
              : t('commandPalette.placeholder')
        }
        value={search}
        onValueChange={setSearch}
        // The two ways out of the branch picker, both the ones a palette teaches by habit: Escape
        // undoes the step (a second one then closes the dialog, since Radix sees that keypress),
        // and Backspace on an empty query walks back the way it was entered. Escape has to be
        // stopped here or the dialog's own dismiss handler would close the whole palette instead.
        onKeyDown={(event) => {
          if (!refPicker) return
          const atStart = search.length === 0
          if (event.key === 'Escape' || (event.key === 'Backspace' && atStart)) {
            event.preventDefault()
            event.stopPropagation()
            backToCommands()
          }
        }}
      />
      <CommandList data-testid="command-palette">
        <CommandEmpty>{t('commandPalette.empty')}</CommandEmpty>
        {groups.map(({ group, heading }) => {
          const cmds = allCommands.filter((c) => c.group === group)
          if (cmds.length === 0) return null
          return (
            <CommandGroup key={group} heading={heading}>
              {cmds.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  value={cmd.value ?? cmd.title}
                  keywords={cmd.keywords}
                  data-testid={`command-item-${cmd.id}`}
                  onSelect={() => run(cmd)}
                >
                  {cmd.icon}
                  <span>{cmd.highlight ? <MarkedTitle command={cmd} /> : cmd.title}</span>
                  {cmd.subtitle && (
                    <span className="ml-auto truncate pl-2 font-mono text-[11px] text-muted-foreground">
                      {cmd.subtitle}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </>
  )
}
