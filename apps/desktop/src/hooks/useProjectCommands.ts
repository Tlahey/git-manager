import useSWR from 'swr'
import type { ProjectCommand } from '@git-manager/git-types'
import { apiGetProjectCommands } from '../api/shell.api'

/**
 * The project's declared runnable commands (today: package.json scripts, translated to the detected
 * package manager) for the given repo, used to autocomplete task commands. Empty when no repo is
 * open or the project declares none.
 */
export function useProjectCommands(repoPath: string | null): ProjectCommand[] {
  const { data } = useSWR<ProjectCommand[], Error>(
    repoPath ? ['project-commands', repoPath] : null,
    () => apiGetProjectCommands(repoPath as string),
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  )
  return data ?? []
}
