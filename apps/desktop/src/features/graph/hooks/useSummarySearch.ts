import { useCallback, useState } from 'react'
import type { SummarySearchAnswer } from '@git-manager/ai'
import { summarySearchService } from '../../../api/ai.api'
import { useSettingsStore } from '../../../stores/settings.store'
import type { StoredDailySummary } from '../../../stores/dailySummary.store'
import { searchDailySummaries } from '../../../lib/searchDailySummaries'
import { summaryPlainText } from '../../../lib/dailySummaryMarkdown'

/**
 * How many of the local scorer's best matches the model is allowed to read.
 *
 * The cap is what keeps "ask the archive" a single bounded call instead of a retrieval system: the
 * lexical scorer has already decided which days are plausible, and a model given the 12 best has
 * everything a model given all 400 would use. The prompt trims further if even these overflow.
 */
const LLM_CANDIDATE_LIMIT = 12

/**
 * Asking the archive a question.
 *
 * Searching the briefings is **the model's job only**. There is deliberately no text filter beside
 * it any more: a lexical box over one's own briefings mostly fails, because you remember what you
 * did ("the merge editor") and not the words the model happened to write about it ("three-way
 * conflict view"). Two search affordances where one works also leaves the user guessing which is
 * which, so the panel offers the one that answers the question it was actually asked.
 *
 * `searchDailySummaries` survives, but demoted from a user-facing filter to a **shortlister**: it
 * picks which days the model reads. That is a job lexical ranking is genuinely good at — narrowing
 * 60 candidates to 12 — and it costs nothing.
 */
export function useSummarySearch(entries: StoredDailySummary[]) {
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)

  const [answer, setAnswer] = useState<SummarySearchAnswer | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim()) return
      setIsAsking(true)
      setAskError(null)
      setAnswer(null)
      try {
        const ranked = searchDailySummaries(entries, question)
        // A question whose words appear nowhere still deserves an answer over the recent archive
        // rather than an empty shortlist the model can only refuse.
        const shortlist = (ranked.length > 0 ? ranked.map((r) => r.entry) : entries).slice(
          0,
          LLM_CANDIDATE_LIMIT
        )
        const result = await summarySearchService.run(aiConnection, {
          question,
          candidates: shortlist.map((entry) => ({
            repo: entry.repoName,
            date: entry.date,
            text: summaryPlainText(entry.summary),
          })),
          language,
          contextTokens: aiConnection.contextTokens,
        })
        setAnswer(result)
      } catch (err) {
        setAskError(String(err))
      } finally {
        setIsAsking(false)
      }
    },
    [entries, aiConnection, language]
  )

  const clearAnswer = useCallback(() => {
    setAnswer(null)
    setAskError(null)
  }, [])

  return { answer, isAsking, askError, ask, clearAnswer }
}
