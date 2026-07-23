import { Button, Separator } from '@git-manager/ui'
import { FileCode, FolderOpen, Terminal, X } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useSettingsStore } from '../../../stores/settings.store'
import { FilterableSetting, Highlight } from './settingsSearch'

/** Derives a human-readable app name from a picked `.app` bundle (or executable) path. */
function appLabel(path: string): string {
  const base = path.split('/').pop() || path
  return base.replace(/\.app$/, '')
}

export function ExternalToolsSection() {
  const { settings, updateSettings } = useSettingsStore()

  const tools = settings.externalTools || { externalTerminalCommand: '' }
  const git = settings.git

  function updateTools(partial: Partial<typeof tools>) {
    updateSettings({ externalTools: { ...tools, ...partial } })
  }

  function updateGit(partial: Partial<typeof git>) {
    updateSettings({ git: { ...git, ...partial } })
  }

  async function pickApplication(title: string) {
    const selected = await open({
      multiple: false,
      directory: false,
      title,
      defaultPath: '/Applications',
      filters: [{ name: 'Application', extensions: ['app'] }],
    })
    return typeof selected === 'string' ? selected : null
  }

  async function handlePickEditorApp() {
    const selected = await pickApplication("Sélectionner l'application de l'éditeur")
    if (selected) updateGit({ externalEditorCommand: selected })
  }

  async function handlePickTerminalApp() {
    const selected = await pickApplication("Sélectionner l'application du terminal")
    if (selected) updateTools({ externalTerminalCommand: selected })
  }

  return (
    <div className="space-y-6">
      {/* External Editor */}
      <FilterableSetting
        className="space-y-3"
        testId="setting-external-editor"
        match="external editor éditeur code externe vscode ide application"
      >
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          <Highlight text="Éditeur de code externe" />
        </h4>
        {git.externalEditorCommand ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2">
            <span
              className="truncate font-mono text-xs text-foreground"
              data-testid="externalEditor-value"
            >
              {appLabel(git.externalEditorCommand)}
            </span>
            <div className="flex shrink-0 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={handlePickEditorApp}
                data-testid="externalEditor-change"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Changer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => updateGit({ externalEditorCommand: '' })}
                title="Retirer l'application"
                data-testid="externalEditor-clear"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={handlePickEditorApp}
            data-testid="externalEditor-select"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Sélectionner mon éditeur…
          </Button>
        )}
      </FilterableSetting>

      {/* External Terminal */}
      <FilterableSetting
        className="space-y-3"
        testId="setting-external-terminal"
        match="external terminal externe iterm terminal.app application shell console"
      >
        <Separator className="mb-3" />
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <Highlight text="Terminal externe" />
        </h4>
        {tools.externalTerminalCommand ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2">
            <span
              className="truncate font-mono text-xs text-foreground"
              data-testid="externalTerminal-value"
            >
              {appLabel(tools.externalTerminalCommand)}
            </span>
            <div className="flex shrink-0 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={handlePickTerminalApp}
                data-testid="externalTerminal-change"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Changer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground"
                onClick={() => updateTools({ externalTerminalCommand: '' })}
                title="Retirer l'application"
                data-testid="externalTerminal-clear"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={handlePickTerminalApp}
            data-testid="externalTerminal-select"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Sélectionner mon terminal…
          </Button>
        )}
      </FilterableSetting>
    </div>
  )
}
