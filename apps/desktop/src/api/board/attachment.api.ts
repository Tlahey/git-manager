import { saveBoardAttachment as invokeSaveBoardAttachment } from '../../lib/tauri'

/**
 * Card attachments — written into the repository's working tree at `.git-manager/attachments/`,
 * beside the remote board's `board.json`.
 *
 * Not part of `BoardBackend`: the bytes land in the same place whichever backend the card belongs
 * to, and only the *URL written into the markdown* differs (see `app/board/attachmentMarkdown.ts`).
 * Giving each backend its own copy of an identical filesystem write would be duplication, not
 * polymorphism.
 *
 * The file shows up as an ordinary pending change in Source Control. That is deliberate and not an
 * oversight: on a shared GitHub board the attachment *must* be committed for teammates to see it,
 * so no automatic ignore rule would be right for both kinds of board.
 */
export function saveBoardAttachment(
  repoPath: string,
  fileName: string,
  bytes: number[]
): Promise<string> {
  return invokeSaveBoardAttachment(repoPath, fileName, bytes)
}
