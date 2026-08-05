import { useCallback, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  dismissCurrentNotch,
  emptyNotchQueue,
  enqueueNotch,
  MacBookScreen,
  notchQueueSize,
  type MacBookWallpaper,
  type NotchQueueState,
} from '../src'
import {
  DEFAULT_VIEWPORT_HEIGHT,
  DEVICES,
  PresentedNotch,
  StoryButton,
  StorySelect,
} from './notchStoryHelpers'
import { NOTCH_SAMPLES, type NotchSample } from './sampleNotchModels'

/**
 * One screen, and buttons that send things at it.
 *
 * This is the story to open. Everything the card can do is reachable from here: each button
 * enqueues a real model, the real queue decides whether it shows now or waits, and the real
 * presenter animates it in and out. What used to be a story per notification kind is a button per
 * notification kind, on a single display — which is also the only way to see the part that matters
 * most, what happens when two of them arrive close together.
 */
const meta: Meta = {
  title: 'Notch/Playground',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

/** Zoom presets. At 1:1 the card renders at exactly the 440×179 points it occupies on a real Mac,
 *  which needs a narrower slice of display to stay on a reasonable canvas. */
const ZOOMS = {
  '60': { label: '60 %', scale: 0.6, viewportWidth: undefined },
  '80': { label: '80 %', scale: 0.8, viewportWidth: undefined },
  '100': { label: '100 % — actual size', scale: 1, viewportWidth: 1080 },
} as const
type ZoomId = keyof typeof ZOOMS

const DURATIONS = {
  '3000': { label: '3 s', ms: 3000 },
  '5000': { label: '5 s', ms: 5000 },
  '12000': { label: '12 s', ms: 12000 },
  never: { label: 'until dismissed', ms: null },
} as const
type DurationId = keyof typeof DURATIONS

const WALLPAPERS: { value: MacBookWallpaper; label: string }[] = [
  { value: 'photo', label: 'busy photo' },
  { value: 'dark', label: 'dark' },
  { value: 'light', label: 'light' },
]

function NotchPlayground() {
  const [deviceId, setDeviceId] = useState(DEVICES[0].id)
  const [wallpaper, setWallpaper] = useState<MacBookWallpaper>('photo')
  const [zoomId, setZoomId] = useState<ZoomId>('80')
  const [durationId, setDurationId] = useState<DurationId>('5000')
  // The samples are queued whole — a sample already *is* a queue entry (it carries a `model`), so
  // its icon and label travel with it instead of being looked up again on every render.
  const [queue, setQueue] = useState<NotchQueueState<NotchSample>>(emptyNotchQueue)
  const [log, setLog] = useState<string[]>([])
  // Bumped on every arrival so re-sending a card that just left remounts the presenter (and
  // replays its entrance) instead of React reusing the previous instance.
  const [generation, setGeneration] = useState(0)

  const preset = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0]
  const zoom = ZOOMS[zoomId]
  const autoDismissMs = DURATIONS[durationId].ms

  const append = useCallback((line: string) => {
    setLog((previous) => [`${new Date().toLocaleTimeString()}  ${line}`, ...previous].slice(0, 8))
  }, [])

  const send = (sample: NotchSample) => {
    setQueue((q) => enqueueNotch(q, sample))
    setGeneration((n) => n + 1)
    append(`sent “${sample.label}”`)
  }

  const closeCurrent = useCallback(() => {
    setQueue(dismissCurrentNotch)
    append('card closed')
  }, [append])

  const current = queue.current

  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <StorySelect
          label="Display"
          value={deviceId}
          onChange={setDeviceId}
          options={DEVICES.map((d) => ({ value: d.id, label: d.label }))}
        />
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
        {current && (
          <PresentedNotch
            // The generation is part of the key so sending the same card twice replays its
            // entrance rather than silently updating a card that is already gone.
            key={`${current.model.id}-${generation}`}
            model={current.model}
            preset={preset}
            autoDismissMs={autoDismissMs}
            onClosed={closeCurrent}
            onEvent={append}
            {...(current.icon !== undefined ? { icon: current.icon } : {})}
          />
        )}
      </MacBookScreen>

      <div className="flex flex-wrap gap-2">
        {NOTCH_SAMPLES.map((sample) => (
          <StoryButton key={sample.model.id} onClick={() => send(sample)}>
            {sample.label}
          </StoryButton>
        ))}
        <StoryButton tone="quiet" onClick={() => setQueue(emptyNotchQueue)}>
          clear the queue
        </StoryButton>
      </div>

      <p className="m-0 max-w-[70ch] text-xs leading-5 text-neutral-400">
        Hover the card to pause its countdown. Send a second one while the first is up: it waits,
        unless it is an error — “Pre-commit failed” and “Checks failed” cut straight in, and the
        card they displaced comes back next instead of being lost.
      </p>

      <div className="flex w-full flex-wrap gap-6 text-xs text-neutral-400">
        <span>
          <strong className="text-neutral-200">on screen:</strong> {current?.label ?? '—'}
        </span>
        <span>
          <strong className="text-neutral-200">waiting ({queue.pending.length}):</strong>{' '}
          {queue.pending.length > 0 ? queue.pending.map((s) => s.label).join(' → ') : '—'}
        </span>
        <span>
          <strong className="text-neutral-200">total:</strong> {notchQueueSize(queue)}
        </span>
      </div>

      <pre className="m-0 min-h-[96px] w-full rounded-md bg-neutral-900 p-3 font-mono text-[11px] leading-5 text-neutral-400">
        {log.length > 0 ? log.join('\n') : 'no events yet — send something'}
      </pre>
    </div>
  )
}

export const Playground: Story = {
  render: () => <NotchPlayground />,
}
