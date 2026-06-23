import { useState, useCallback } from 'react'

const MAX_HISTORY = 10

export function useCommitMessageHistory() {
  const [history, setHistory] = useState<string[]>([])

  const addMessage = useCallback((msg: string) => {
    if (!msg.trim()) return
    setHistory((prev) => [msg, ...prev.filter((m) => m !== msg)].slice(0, MAX_HISTORY))
  }, [])

  const clearHistory = useCallback(() => setHistory([]), [])

  return { history, addMessage, clearHistory }
}
