import type { ReactNode } from 'react'
import { Alert, type AlertVariant } from '@git-manager/ui'
import { Info, Lightbulb, MessageSquareWarning, OctagonAlert, TriangleAlert } from 'lucide-react'
import { parseMarkdownAlert, type MarkdownAlertKind } from '../markdownAlert'

/**
 * Each GitHub alert kind as an `Alert` variant, an icon and its title.
 *
 * The titles are literal, and stay out of `@git-manager/i18n` on purpose: they are text *in the
 * document*, not a piece of the app's interface. `> [!CAUTION]` is written in the body the user
 * publishes, and GitHub will render it under that same English word — translating the title here
 * would show one thing in the editor and another everywhere the document is read.
 *
 * GitHub gives `important` a purple of its own; the app's tone tokens have no fifth colour and
 * inventing one would mean a new APCA-graded token for a single callout, so it shares `info` with
 * `note` and is told apart by its icon and title — which is how a reader identifies it anyway.
 */
const ALERT_STYLES: Record<
  MarkdownAlertKind,
  { variant: AlertVariant; icon: typeof Info; title: string }
> = {
  note: { variant: 'info', icon: Info, title: 'Note' },
  tip: { variant: 'success', icon: Lightbulb, title: 'Tip' },
  important: { variant: 'info', icon: MessageSquareWarning, title: 'Important' },
  warning: { variant: 'warning', icon: TriangleAlert, title: 'Warning' },
  caution: { variant: 'destructive', icon: OctagonAlert, title: 'Caution' },
}

/** A markdown blockquote: a GitHub alert when it opens with one of the markers, an ordinary quote
 * otherwise. */
export function MarkdownBlockquote({ children }: { children?: ReactNode }) {
  const alert = parseMarkdownAlert(children)

  if (!alert) {
    return (
      <blockquote className="my-2.5 rounded-r border-l-2 border-primary/60 bg-muted/20 py-1.5 pl-3.5 text-muted-foreground italic">
        {children}
      </blockquote>
    )
  }

  const { variant, icon: Icon, title } = ALERT_STYLES[alert.kind]
  return (
    <Alert
      variant={variant}
      className="my-2.5 flex-col gap-1"
      data-testid={`markdown-alert-${alert.kind}`}
    >
      <p className="flex items-center gap-1.5 font-medium">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </p>
      <div className="[&_p]:text-current">{alert.content}</div>
    </Alert>
  )
}
