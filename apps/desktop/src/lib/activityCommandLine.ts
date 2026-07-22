/**
 * Maps a correlated action's label (see `lib/activityCorrelation.ts`) to the terminal command it
 * corresponds to — the one you could run yourself in a shell. Shown in the Activity Logs group
 * header so a repository action reads as its git equivalent (e.g. `git.pull` → `git pull`).
 *
 * Only the actions currently wrapped in `runActivity` are mapped; anything unmapped (uncorrelated
 * operations, read-only queries) returns null and keeps showing its raw label/command instead.
 */
const COMMAND_BY_LABEL: Record<string, string> = {
  'git.fetch': 'git fetch',
  'git.pull': 'git pull',
  'git.push': 'git push',
  'git.commit': 'git commit',
  'git.reset': 'git reset',
  'git.checkout': 'git checkout',
  'git.autosquash': 'git rebase -i --autosquash',
  'git.rebaseInteractive': 'git rebase -i',
}

export function activityCommandLine(label: string | undefined): string | null {
  if (!label) return null
  return COMMAND_BY_LABEL[label] ?? null
}
