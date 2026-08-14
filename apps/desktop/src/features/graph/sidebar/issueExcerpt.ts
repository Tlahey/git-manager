import { markdownToPlainText } from '../../../components/markdown/markdownPlainText'

/** Longest excerpt the hover card shows before trailing off into an ellipsis. */
export const EXCERPT_LENGTH = 260

/**
 * A short plain-text opening of an issue's markdown body, for the hover preview.
 *
 * The stripping itself is `markdownToPlainText`, shared with the board card's own preview — see
 * that module for why a preview drops the structure rather than truncating it. What is left here is
 * the part that belongs to a hover card: the length it has to fit in.
 */
export function issueExcerpt(body: string | undefined, maxLength = EXCERPT_LENGTH): string {
  const text = markdownToPlainText(body)
  if (!text) return ''

  if (text.length <= maxLength) return text
  // Cut on a word boundary when there is one close enough, so the excerpt doesn't end mid-word.
  const clipped = text.slice(0, maxLength)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}
