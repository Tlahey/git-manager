import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  MARKDOWN_COMMANDS,
  MarkdownToolbar,
  type MarkdownCommandId,
  type MarkdownToolbarLabels,
} from '@git-manager/components'

interface MarkdownFormattingBarProps {
  onCommand: (command: MarkdownCommandId) => void
  disabled?: boolean
  className?: string
}

/**
 * The app's translated skin over `MarkdownToolbar`.
 *
 * The toolbar itself is i18n-agnostic — `packages/components` deliberately has no dependency on the
 * locales — so resolving its labels is the app's job, and this is the one place that does it. Every
 * command's label lives under the same key prefix as its id, which is what keeps the two in step:
 * adding a command to the registry without its `markdown.command.*` key shows up immediately as a
 * raw key in the tooltip.
 */
export function MarkdownFormattingBar({
  onCommand,
  disabled,
  className,
}: MarkdownFormattingBarProps) {
  const { t } = useTranslation('git')

  const labels = useMemo<MarkdownToolbarLabels>(
    () => ({
      commands: Object.fromEntries(
        Object.keys(MARKDOWN_COMMANDS).map((command) => [command, t(`markdown.command.${command}`)])
      ) as Record<MarkdownCommandId, string>,
      headings: t('markdown.toolbar.headings'),
      alerts: t('markdown.toolbar.alerts'),
      more: t('markdown.toolbar.more'),
      sections: {
        text: t('markdown.section.text'),
        blocks: t('markdown.section.blocks'),
        inserts: t('markdown.section.inserts'),
      },
    }),
    [t]
  )

  return (
    <MarkdownToolbar
      onCommand={onCommand}
      labels={labels}
      disabled={disabled}
      className={className}
    />
  )
}
