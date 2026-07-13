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

interface CommandPaletteProps {
  onOpenSettings: (section: Section) => void
  onCloseSettings: () => void
}

/**
 * Spotlight-style command palette (⌘K), mounted once at the app root. Open/close state lives in
 * `commandPalette.store`; the actual command list is built by the registry hooks only while the
 * dialog is open (they mount inside the dialog content, which Radix unmounts when closed).
 */
export function CommandPalette({ onOpenSettings, onCloseSettings }: CommandPaletteProps) {
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
          onDone={closePalette}
        />
      )}
    </CommandDialog>
  )
}

interface CommandPaletteBodyProps {
  onOpenSettings: (section: Section) => void
  onCloseSettings: () => void
  onDone: () => void
}

function CommandPaletteBody({ onOpenSettings, onCloseSettings, onDone }: CommandPaletteBodyProps) {
  const { t } = useTranslation('common')
  const selectedCommitOid = useRepoUIStore((s) => s.selectedCommitOid)
  const selectedStashIndex = useRepoUIStore((s) => s.selectedStashIndex)
  const globalCommands = useGlobalCommands({ onOpenSettings })
  const commitCommands = useCommitCommands()
  const stashCommands = useStashCommands()

  // Commit/stash actions first — they're the most contextual when a row is selected.
  const allCommands = [...commitCommands, ...stashCommands, ...globalCommands]

  function run(cmd: PaletteCommand) {
    // Running any non-settings command should return the user to the main view if they triggered it
    // from within Settings; settings commands manage their own section instead.
    if (cmd.group !== 'settings') onCloseSettings()
    cmd.run()
    onDone()
  }

  const groups: { group: PaletteGroup; heading: string }[] = [
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
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </>
  )
}
