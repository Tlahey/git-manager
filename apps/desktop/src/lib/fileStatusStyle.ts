/**
 * The one-letter marker and the colour a changed file gets in every list that shows one.
 *
 * This table was written twice — in `CommitFileList` and in the batch-commit group — with the same
 * letters and the same colours, differing only in font size and in the fact that one of them had
 * forgotten `conflicted` altogether, so a conflicted file in a batch group rendered a blank marker.
 * Size stays with the caller (the two lists are set at different scales on purpose); the letters
 * and the colours are one table, and `conflicted` is now in it.
 *
 * Keyed by `ProcessedFileItem['status']`, a plain string on the DTO side — hence the `Record<string,
 * …>` and the caller-side fallbacks rather than an exhaustive map.
 */

export const FILE_STATUS_LETTER: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  untracked: '?',
  conflicted: 'U',
}

export const FILE_STATUS_COLOR: Record<string, string> = {
  added: 'text-green-500',
  modified: 'text-yellow-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
  untracked: 'text-muted-foreground',
  conflicted: 'text-orange-500',
}
