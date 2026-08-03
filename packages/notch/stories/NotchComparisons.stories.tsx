import type { Meta, StoryObj } from '@storybook/react'
import type { NotchTone } from '../src'
import { DEVICES, StaticNotch } from './notchStoryHelpers'
import { prMerged, prMergedIcon } from './sampleNotchModels'

/**
 * The two questions the playground can't answer, because they need cards side by side.
 *
 * Both are cropped to the top of the display: the card lives in the first ~180 points of a screen
 * that is 982 tall, so a thumbnail of the whole thing shows a rectangle you can't read.
 */
const meta: Meta = {
  title: 'Notch/Comparisons',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

export const EveryDisplay: Story = {
  name: 'Every display — including one with no notch',
  parameters: {
    docs: {
      description: {
        story:
          'The card is placed by the same `computeNotchPlacement` the app calls, so this is the ' +
          'real centring on each machine. The external monitor is the one worth staring at: with ' +
          'no camera housing the reserved band is just the strip overlapping a shorter menu bar, ' +
          'and the layout has to still make sense.',
      },
    },
  },
  render: () => (
    <div className="flex flex-col gap-6">
      {DEVICES.map((preset) => (
        <figure key={preset.id} className="m-0 flex flex-col gap-2">
          <figcaption className="text-xs text-neutral-400">
            {preset.label} — {preset.width}×{preset.height} pt
          </figcaption>
          <StaticNotch
            model={prMerged}
            icon={prMergedIcon}
            preset={preset}
            scale={0.62}
            viewportHeight={300}
          />
        </figure>
      ))}
    </div>
  ),
}

const TONES: NotchTone[] = ['neutral', 'info', 'accent', 'success', 'error', 'running', 'highlight']

export const EveryTone: Story = {
  name: 'Every tone — the halo palette',
  parameters: {
    docs: {
      description: {
        story:
          'Tones replaced a palette keyed by concrete GitHub PR types, which is what made it ' +
          'impossible to colour a card for anything that is not a pull request. The seven values ' +
          'are the previous eight de-duplicated: nothing changed colour in the move. Shown on the ' +
          'busy wallpaper, which is where a soft halo has the hardest time reading.',
      },
    },
  },
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      {TONES.map((tone) => (
        <figure key={tone} className="m-0 flex flex-col gap-1.5">
          <figcaption className="text-xs text-neutral-400">{tone}</figcaption>
          <StaticNotch
            model={{ ...prMerged, tone, eyebrow: tone.toUpperCase() }}
            preset={DEVICES[0]!}
            scale={0.42}
            viewportWidth={900}
            viewportHeight={260}
          />
        </figure>
      ))}
    </div>
  ),
}
