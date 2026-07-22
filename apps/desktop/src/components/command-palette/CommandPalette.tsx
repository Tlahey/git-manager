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
import { useGlobalCommands } from './commands/useGlobalCommands'
import { useCommitCommands } from './commands/useCommitCommands'
import { useStashCommands } from './commands/useStashCommands'
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

interface CommandPaletteProps {
  onOpenSettings: (section: Section) => void
  onCloseSettings: () => void
  onOpenActivityLogs: () => void
}

/**
 * Spotlight-style command palette (⌘K), mounted once at the app root. Open/close state lives in
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
  const selectedCommitOid = useRepoUIStore((s) => s.selectedCommitOid)
  const selectedStashIndex = useRepoUIStore((s) => s.selectedStashIndex)
  const globalCommands = useGlobalCommands({ onOpenSettings, onOpenActivityLogs })
  const commitCommands = useCommitCommands()
  const stashCommands = useStashCommands()
  const lookupCommands = useCommitLookupCommands(search)

  // Lookup (paste-a-sha) first, then commit/stash actions — the most contextual ones.
  const allCommands = [...lookupCommands, ...commitCommands, ...stashCommands, ...globalCommands]

  function run(cmd: PaletteCommand) {
    // Running any non-settings command should return the user to the main view if they triggered it
    // from within Settings; settings commands manage their own section instead.
    if (cmd.group !== 'settings') onCloseSettings()
    cmd.run()
    onDone()
  }

  const groups: { group: PaletteGroup; heading: string }[] = [
    { group: 'lookup', heading: t('commandPalette.group.lookup') },
    {
      group: 'commit',
      heading: t('commandPalette.group.commit', { sha: selectedCommitOid?.slice(0, 7) ?? '' }),
    },
    {
      group: 'stash',
      heading: t('commandPalette.group.stash', { index: selectedStashIndex ?? '' }),
    },
    { group: 'navigation', heading: t('commandPalette.group.navigation') },
    { group: 'repo', heading: t('commandPalette.group.repo') },
    { group: 'settings', heading: t('commandPalette.group.settings') },
  ]

  return (
    <>
      <CommandInput
        data-testid="command-palette-input"
        placeholder={t('commandPalette.placeholder')}
        value={search}
        onValueChange={setSearch}
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
                  value={cmd.title}
                  keywords={cmd.keywords}
                  data-testid={`command-item-${cmd.id}`}
                  onSelect={() => run(cmd)}
                >
                  {cmd.icon}
                  <span>{cmd.title}</span>
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
