import { Input, Separator } from '@git-manager/ui'
import { GitPullRequest, GitCompare, FileCode, Terminal } from 'lucide-react'
import { useSettingsStore } from '../../../stores/settings.store'

export function ExternalToolsSection() {
  const { settings, updateSettings } = useSettingsStore()

  const tools = settings.externalTools || {
    mergeTool: 'integrated',
    mergeToolCommand: '',
    diffTool: 'integrated',
    diffToolCommand: '',
    externalTerminal: 'system',
    externalTerminalCommand: '',
  }
  const git = settings.git

  function updateTools(partial: Partial<typeof tools>) {
    updateSettings({ externalTools: { ...tools, ...partial } })
  }

  function updateGit(partial: Partial<typeof git>) {
    updateSettings({ git: { ...git, ...partial } })
  }

  return (
    <div className="space-y-6">
      {/* Merge Tool */}
      <div className="space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          Outil de fusion (Merge Tool)
        </h4>
        <div className="space-y-2">
          <select
            value={tools.mergeTool}
            onChange={(e) => updateTools({ mergeTool: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-3 font-sans text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="integrated">Éditeur de fusion intégré</option>
            <option value="vscode">VS Code</option>
            <option value="meld">Meld</option>
            <option value="kdiff3">KDiff3</option>
            <option value="custom">Commande personnalisée</option>
          </select>

          {tools.mergeTool === 'custom' && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">
                Commande de fusion personnalisée
              </label>
              <Input
                value={tools.mergeToolCommand}
                onChange={(e) => updateTools({ mergeToolCommand: e.target.value })}
                placeholder="Ex: meld $LOCAL $BASE $REMOTE --output $MERGED"
                className="h-8 font-mono text-xs"
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Diff Tool */}
      <div className="space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <GitCompare className="h-4 w-4 text-muted-foreground" />
          Outil de comparaison (Diff Tool)
        </h4>
        <div className="space-y-2">
          <select
            value={tools.diffTool}
            onChange={(e) => updateTools({ diffTool: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-3 font-sans text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="integrated">Comparateur intégré</option>
            <option value="vscode">VS Code</option>
            <option value="delta">git-delta</option>
            <option value="custom">Commande personnalisée</option>
          </select>

          {tools.diffTool === 'custom' && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">
                Commande de comparaison personnalisée
              </label>
              <Input
                value={tools.diffToolCommand}
                onChange={(e) => updateTools({ diffToolCommand: e.target.value })}
                placeholder="Ex: diffmerge $LOCAL $REMOTE"
                className="h-8 font-mono text-xs"
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* External Editor */}
      <div className="space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          Éditeur de code externe
        </h4>
        <div className="space-y-2">
          <select
            value={git.externalEditor}
            onChange={(e) => updateGit({ externalEditor: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-3 font-sans text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="vscode">VS Code</option>
            <option value="cursor">Cursor</option>
            <option value="sublime">Sublime Text</option>
            <option value="intellij">IntelliJ IDEA</option>
            <option value="custom">Commande personnalisée</option>
          </select>

          {git.externalEditor === 'custom' && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">
                Commande de l&apos;éditeur
              </label>
              <Input
                value={git.externalEditorCommand}
                onChange={(e) => updateGit({ externalEditorCommand: e.target.value })}
                placeholder="Ex: /usr/local/bin/code"
                className="h-8 font-mono text-xs"
              />
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* External Terminal */}
      <div className="space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          Terminal externe
        </h4>
        <div className="space-y-2">
          <select
            value={tools.externalTerminal}
            onChange={(e) => updateTools({ externalTerminal: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-3 font-sans text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="system">Terminal système par défaut</option>
            <option value="iterm2">iTerm2</option>
            <option value="warp">Warp</option>
            <option value="alacritty">Alacritty</option>
            <option value="custom">Commande personnalisée</option>
          </select>

          {tools.externalTerminal === 'custom' && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">
                Commande du terminal
              </label>
              <Input
                value={tools.externalTerminalCommand}
                onChange={(e) => updateTools({ externalTerminalCommand: e.target.value })}
                placeholder="Ex: alacritty --working-directory $PATH"
                className="h-8 font-mono text-xs"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
