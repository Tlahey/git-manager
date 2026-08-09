import { useMemo } from 'react'
import { useAssignableUsers } from '../../../hooks/usePrEditCandidates'

/**
 * Resolves a card assignee's picture, for the whole board at once.
 *
 * A card's assignee is a GitHub login on a remote board and free text on a local one, so a picture
 * exists only when the two happen to coincide — which is why this returns `undefined` freely and the
 * avatar falls back to coloured initials (`CommitAvatar`). That fallback is the normal case on a
 * local board, not a failure.
 *
 * Resolved once here rather than per card: the lookup is a single request for the repo's
 * collaborators, and a fifty-card board must not turn that into a hook instance per tile.
 */
export function useBoardAssigneeAvatars(
  repoPath: string
): (assignee: string) => string | undefined {
  const { users } = useAssignableUsers(repoPath, true)

  const byLogin = useMemo(() => {
    const map = new Map<string, string>()
    for (const user of users) map.set(user.login.toLowerCase(), user.avatar_url)
    return map
  }, [users])

  return useMemo(() => (assignee: string) => byLogin.get(assignee.toLowerCase()), [byLogin])
}
