import { SidePanelOverlay } from '@git-manager/components'
import { DialogDescription, DialogTitle, ScrollArea } from '@git-manager/ui'
import type { OutdatedPackage } from '@git-manager/git-types'
import { PackageChangelog } from './PackageChangelog'
import { UpgradeRiskReport } from './UpgradeRiskReport'

/**
 * The release notes for one pending update, in a right-anchored panel over the app.
 *
 * An overlay rather than an inline expansion because release notes are long: they
 * would push the rest of the list off screen and turn a scannable table into a
 * document. `SidePanelOverlay` gives it a full-height scrollable column, a resizable
 * edge, and the focus trap / Escape handling a hand-rolled panel would drop.
 *
 * Rendered only while an entry is selected, so the fetch follows the click and a
 * reopened panel starts on the right package rather than the previous one.
 */
export function PackageChangelogPanel({
  entry,
  repoPath,
  token,
  onClose,
}: {
  entry: OutdatedPackage
  repoPath: string
  token?: string
  onClose: () => void
}) {
  return (
    <SidePanelOverlay
      open
      onClose={onClose}
      testIdPrefix="package-changelog"
      widthRatios={{ initial: 0.42, min: 0.28, max: 0.85 }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 space-y-1 border-b border-border/60 px-5 py-4 pr-10">
          <DialogTitle className="truncate font-mono text-sm" title={entry.name}>
            {entry.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            <span className="font-mono">{entry.current}</span>
            <span aria-hidden>→</span>
            <span className="font-mono font-medium">{entry.latest}</span>
          </DialogDescription>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-5 py-4">
            <PackageChangelog
              repoPath={repoPath}
              name={entry.name}
              from={entry.current}
              to={entry.latest}
              token={token}
            />
            {/* Below the notes on purpose: the assessment is *about* them. It reads
                the same SWR key rather than being handed the data, so the two share
                one fetch without the panel having to lift state between them. */}
            <UpgradeRiskReport entry={entry} repoPath={repoPath} token={token} />
          </div>
        </ScrollArea>
      </div>
    </SidePanelOverlay>
  )
}
