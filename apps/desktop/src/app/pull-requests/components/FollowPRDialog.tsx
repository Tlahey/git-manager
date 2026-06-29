import { useState } from 'react'
import { BookOpen, X } from 'lucide-react'

interface FollowPRDialogProps {
  onAdd: (url: string) => void
  onClose: () => void
}

export function FollowPRDialog({ onAdd, onClose }: FollowPRDialogProps) {
  const [url, setUrl] = useState('')
  const isValid = url.includes('github.com') && url.includes('/pull/')

  function handleAdd() {
    if (isValid) {
      onAdd(url.trim())
      onClose()
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] rounded-xl border border-border bg-card shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Follow a Pull Request</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          type="url"
          value={url}
          autoFocus
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="https://github.com/owner/repo/pull/123"
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!isValid}
            className="h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            Follow PR
          </button>
        </div>
      </div>
    </>
  )
}
