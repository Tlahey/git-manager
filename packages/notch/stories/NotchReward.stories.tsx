import { useCallback, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  CONFETTI_PIECE_COUNT,
  CONFETTI_TOTAL_MS,
  MacBookScreen,
  type MacBookWallpaper,
  type NotchRewardTier,
} from '../src'
import {
  DEFAULT_VIEWPORT_HEIGHT,
  DEVICES,
  PresentedNotch,
  StaticNotch,
  StoryButton,
  StorySelect,
} from './notchStoryHelpers'
import { REWARD_TIERS, rewardSample } from './sampleNotchModels'

/**
 * The card that replaces the bottom-right trophy toast.
 *
 * The toast it replaces was a corner of the app window: it only existed while the window was
 * focused, it competed with the diff the user was reading, and it had no way to celebrate — an
 * unlock and a failed fetch looked like the same rectangle in the same corner. In the notch the
 * unlock gets the one piece of screen that is always there, a medal in its own tier's colour, a halo
 * that glows gold rather than purple, and a burst of confetti that lasts a second and a half and
 * then costs nothing.
 *
 * What to look at:
 *
 * - **The burst is clipped by the card, and has to be.** The OS window is the card plus a 26 pt
 *   halo margin; growing it so paper could land on the wallpaper would put a much larger
 *   always-on-top transparent rectangle over the menu bar and swallow clicks that land in it.
 * - **Nothing important is under the camera housing.** The medal starts below the reserved band, and
 *   so does every piece of paper — the burst is aimed at the body, not at the housing.
 * - **The text stays readable while it is happening.** Confetti is painted behind the rows.
 * - **Reduced motion means no confetti at all**, not a slower one: pieces frozen in mid-air read as
 *   debris left on the card.
 */
const meta: Meta = {
  title: 'Notch/Reward',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

const WALLPAPERS: { value: MacBookWallpaper; label: string }[] = [
  { value: 'photo', label: 'busy photo' },
  { value: 'dark', label: 'dark' },
  { value: 'light', label: 'light' },
]

const ZOOMS = {
  '80': { label: '80 %', scale: 0.8, viewportWidth: undefined },
  '100': { label: '100 % — actual size', scale: 1, viewportWidth: 1080 },
} as const
type ZoomId = keyof typeof ZOOMS

const DURATIONS = {
  never: { label: 'until dismissed', ms: null },
  '5000': { label: '5 s — the app default', ms: 5000 },
  '2000': { label: '2 s — cuts the burst off', ms: 2000 },
} as const
type DurationId = keyof typeof DURATIONS

const TIER_OPTIONS = REWARD_TIERS.map((tier) => ({ value: tier, label: tier }))

function RewardStage() {
  const [tier, setTier] = useState<NotchRewardTier>('gold')
  const [wallpaper, setWallpaper] = useState<MacBookWallpaper>('photo')
  const [zoomId, setZoomId] = useState<ZoomId>('80')
  const [durationId, setDurationId] = useState<DurationId>('never')
  const [reduced, setReduced] = useState(false)
  // Bumped on every replay so the card remounts: the entrance slide and the burst both start from
  // the mount, which is exactly how the app gets them (one fresh window per notification).
  const [generation, setGeneration] = useState(0)
  const [onScreen, setOnScreen] = useState(true)
  const [log, setLog] = useState<string[]>([])

  const preset = DEVICES[0]
  const zoom = ZOOMS[zoomId]
  const model = rewardSample(tier)

  const append = useCallback((line: string) => {
    setLog((previous) => [`${new Date().toLocaleTimeString()}  ${line}`, ...previous].slice(0, 6))
  }, [])

  const replay = () => {
    setOnScreen(true)
    setGeneration((n) => n + 1)
    append(`unlocked “${model.title}” (${tier})`)
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <StorySelect label="Tier" value={tier} onChange={setTier} options={TIER_OPTIONS} />
        <StorySelect
          label="Wallpaper"
          value={wallpaper}
          onChange={setWallpaper}
          options={WALLPAPERS}
        />
        <StorySelect
          label="Zoom"
          value={zoomId}
          onChange={setZoomId}
          options={(Object.keys(ZOOMS) as ZoomId[]).map((id) => ({
            value: id,
            label: ZOOMS[id].label,
          }))}
        />
        <StorySelect
          label="Auto-dismiss"
          value={durationId}
          onChange={setDurationId}
          options={(Object.keys(DURATIONS) as DurationId[]).map((id) => ({
            value: id,
            label: DURATIONS[id].label,
          }))}
        />
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          reduced motion
        </label>
      </div>

      <MacBookScreen
        preset={preset}
        wallpaper={wallpaper}
        scale={zoom.scale}
        viewport={{
          ...(zoom.viewportWidth !== undefined ? { width: zoom.viewportWidth } : {}),
          height: DEFAULT_VIEWPORT_HEIGHT,
        }}
      >
        {onScreen && (
          <PresentedNotch
            key={`${tier}-${generation}`}
            model={model}
            preset={preset}
            autoDismissMs={DURATIONS[durationId].ms}
            reducedMotion={reduced}
            onClosed={() => {
              setOnScreen(false)
              append('card closed')
            }}
            onEvent={append}
          />
        )}
      </MacBookScreen>

      <div className="flex flex-wrap gap-2">
        <StoryButton onClick={replay}>unlock it again</StoryButton>
        <StoryButton tone="quiet" onClick={() => setOnScreen(false)}>
          clear
        </StoryButton>
      </div>

      <p className="m-0 max-w-[70ch] text-xs leading-5 text-neutral-400">
        The burst waits for the slide to finish before it goes off — the window is parked above its
        resting spot until then, so an early launch would happen off the top of the screen. It takes{' '}
        <strong className="text-neutral-200">{CONFETTI_TOTAL_MS} ms</strong> at the outside
        (CONFETTI_TOTAL_MS), which is the floor any auto-dismiss has to clear: pick “2 s” above to
        see what cutting it off looks like. {CONFETTI_PIECE_COUNT} pieces, seeded on the
        model&apos;s id — the same achievement always throws the same paper, so nobody can read
        anything into the pattern.
      </p>

      <pre className="m-0 min-h-[72px] w-full rounded-md bg-neutral-900 p-3 font-mono text-[11px] leading-5 text-neutral-400">
        {log.length > 0 ? log.join('\n') : 'no events yet — press “unlock it again”'}
      </pre>
    </div>
  )
}

export const Unlocked: Story = {
  name: 'Unlocked — the card, live',
  render: () => <RewardStage />,
}

function EveryTierStage() {
  const [generation, setGeneration] = useState(0)
  return (
    <div className="flex flex-col gap-4">
      <StoryButton onClick={() => setGeneration((n) => n + 1)}>replay all four</StoryButton>
      <div className="grid grid-cols-2 gap-4">
        {REWARD_TIERS.map((tier) => (
          <figure key={tier} className="m-0 flex flex-col gap-1.5">
            <figcaption className="text-xs text-neutral-400">
              {tier} — {rewardSample(tier).badge}
            </figcaption>
            <StaticNotch
              // Re-keyed on replay: the burst is a CSS animation that runs once per mount.
              key={`${tier}-${generation}`}
              model={rewardSample(tier)}
              preset={DEVICES[0]}
              scale={0.52}
              viewportWidth={980}
              viewportHeight={280}
            />
          </figure>
        ))}
      </div>
    </div>
  )
}

export const EveryTier: Story = {
  name: 'Every tier — medal, halo and paper',
  parameters: {
    docs: {
      description: {
        story:
          'The four tiers, on the busy wallpaper where a soft halo has the hardest time reading. ' +
          'Each tier owns three things at once — the medal, the halo the card glows in, and the ' +
          'palette its confetti is cut from — which is what makes a gold unlock recognisable from ' +
          'across the room and a bronze one quiet.',
      },
    },
  },
  render: () => <EveryTierStage />,
}

function ReducedMotionStage() {
  const [generation, setGeneration] = useState(0)
  return (
    <div className="flex flex-col gap-4">
      <StoryButton onClick={() => setGeneration((n) => n + 1)}>replay both</StoryButton>
      <div className="flex flex-col gap-6">
        {[
          { reduced: false, caption: 'default — prefers-reduced-motion: no-preference' },
          { reduced: true, caption: 'prefers-reduced-motion: reduce' },
        ].map((variant) => (
          <figure key={variant.caption} className="m-0 flex flex-col gap-1.5">
            <figcaption className="text-xs text-neutral-400">{variant.caption}</figcaption>
            <StaticNotch
              key={`${variant.caption}-${generation}`}
              model={rewardSample('gold')}
              preset={DEVICES[0]}
              reducedMotion={variant.reduced}
              scale={0.7}
              viewportWidth={1000}
              viewportHeight={300}
            />
          </figure>
        ))}
      </div>
    </div>
  )
}

export const ReducedMotion: Story = {
  name: 'Reduced motion — what is left of the celebration',
  parameters: {
    docs: {
      description: {
        story:
          'No confetti at all, rather than a slower burst: “reduce motion” is not a request for a ' +
          'quieter animation, and pieces frozen in mid-air read as debris left on the card. What ' +
          'survives is the part that was never motion — the medal, the tier-coloured halo, and an ' +
          'eyebrow that says what was unlocked.',
      },
    },
  },
  render: () => <ReducedMotionStage />,
}
