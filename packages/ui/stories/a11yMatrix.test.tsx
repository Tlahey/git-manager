// The rendered-DOM accessibility gate for the UI showcase: runs the Overview story
// through axe + APCA Bronze on every theme × surface. All the machinery (axe/APCA
// config, the composeStory + render + assert loop, the per-node reporter) lives in
// @git-manager/storybook-a11y — this file just points it at the story.
import { runA11yMatrix } from '@git-manager/storybook-a11y/testing'
import meta, { Overview } from './Components.stories'

runA11yMatrix({
  meta,
  story: Overview,
  name: 'Overview',
  // Muted-decorative policy: text rendered in the `muted-foreground` role — the
  // inactive Chip and the neutral "draft" Tag — is intentionally low-contrast (graded
  // to the 3.0 UI bar, not 4.5), so it's exempt from the strict APCA Bronze gate.
  // These nodes are still recorded and surfaced in apca-report.md (not silently
  // dropped). ACTIONS are never muted — the input "Clear" button uses text-foreground.
  exemptHtmlIncludes: ['text-muted-foreground'],
})
