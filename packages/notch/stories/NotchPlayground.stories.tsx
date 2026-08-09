import { useCallback, useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
  dismissCurrentNotch,
  emptyNotchQueue,
  enqueueNotch,
  MacBookScreen,
  notchQueueSize,
  removeNotch,
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
import {
  AI_RUN_FILE_COUNT,
  AI_RUN_ID,
  aiRunIcon,
  aiRunProgress,
  NOTCH_SAMPLES,
  type NotchSample,
} from './sampleNotchModels'

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

/**
 * How long one file of the sample AI run takes.
 *
 * Far quicker than the real thing — a local model spends seconds per file — because the point is to
 * watch the bar move, not to sit through it. Slow enough that each tick is legible as its own step.
 */
const AI_TICK_MS = 700

/** The AI run as a queue entry, at whatever file it has reached. */
function aiSample(filesRead: number): NotchSample {
  return { label: 'AI run', model: aiRunProgress(filesRead), icon: aiRunIcon }
}

function NotchPlayground() {
  const [deviceId, setDeviceId] = useState(DEVICES[0].id)
  const [wallpaper, setWallpaper] = useState<MacBookWallpaper>('photo')
  const [zoomId, setZoomId] = useState<ZoomId>('80')
  const [durationId, setDurationId] = useState<DurationId>('5000')
  // The samples are queued whole — a sample already *is* a queue entry (it carries a `model`), so
  // its icon and label travel with it instead of being looked up again on every render.
  const [queue, setQueue] = useState<NotchQueueState<NotchSample>>(emptyNotchQueue)
  const [log, setLog] = useState<string[]>([])
  /** Files the sample AI run has read, or `null` when no run is going — which is what stops it. */
  const [filesRead, setFilesRead] = useState<number | null>(null)
  // Bumped on every arrival so re-sending a card that just left remounts the presenter (and
  // replays its entrance) instead of React reusing the previous instance.
  const [generation, setGeneration] = useState(0)

  const preset = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0]
  const zoom = ZOOMS[zoomId]
  const chosenDurationMs = DURATIONS[durationId].ms

  const append = useCallback((line: string) => {
    setLog((previous) => [`${new Date().toLocaleTimeString()}  ${line}`, ...previous].slice(0, 8))
  }, [])

  const send = (sample: NotchSample) => {
    setQueue((q) => enqueueNotch(q, sample))
    setGeneration((n) => n + 1)
    append(`sent “${sample.label}”`)
  }

  /** Starts the sample AI run at its first file. It advances on its own from there. */
  const startAiRun = () => {
    setFilesRead(0)
    setQueue((q) => enqueueNotch(q, aiSample(0)))
    setGeneration((n) => n + 1)
    append(`AI run started — ${AI_RUN_FILE_COUNT} files to read`)
  }

  /**
   * The run reading its files, one every {@link AI_TICK_MS}, with no help from the viewer.
   *
   * A card whose bar only moves when you click a button is not the thing being demonstrated: what
   * the app does is tick on its own for minutes, and every question worth asking here is about what
   * happens *while* it does. Closing it mid-run is the one that matters — the ticks below carry on,
   * exactly as the app's producer carries on describing a card it cannot see has been dismissed,
   * and nothing comes back until the run ends.
   *
   * A timeout per tick rather than one interval: the tick is a state change, so re-arming from the
   * state it produced is what keeps the two from drifting apart.
   */
  useEffect(() => {
    if (filesRead === null) return
    const timer = setTimeout(() => {
      const read = filesRead + 1
      if (read > AI_RUN_FILE_COUNT) {
        // The producer saying "this is over", which is also what lifts a suppression.
        setQueue((q) => removeNotch(q, AI_RUN_ID))
        setFilesRead(null)
        append('AI run finished — its card is retired')
        return
      }
      setFilesRead(read)
      // No generation bump: a tick is an in-place update of the card already on screen, and
      // remounting it would replay the entrance animation twelve times for one operation.
      setQueue((q) => enqueueNotch(q, aiSample(read)))
      append(`AI run — ${read} / ${AI_RUN_FILE_COUNT} files read`)
    }, AI_TICK_MS)
    return () => clearTimeout(timer)
  }, [filesRead, append])

  const closeCurrent = useCallback(() => {
    setQueue(dismissCurrentNotch)
    append('card closed')
  }, [append])

  /** What the app's producers call when an operation is over — and what lifts a suppression. */
  const endOperation = (id: string, label: string) => {
    setQueue((q) => removeNotch(q, id))
    // Ending the AI run has to stop it reading, or the next tick would put its card straight back —
    // which would be the truth (the operation is not over) but not what the button says.
    if (id === AI_RUN_ID) setFilesRead(null)
    append(`“${label}” finished — its card may come back`)
  }

  const current = queue.current
  /**
   * The chosen delay, except for a live card, which the app never times out either.
   *
   * A progress card is a number that changes: one parked at 40 % that vanished after five seconds
   * would have told the user nothing and taken away the only thing tracking the operation. Mirrored
   * here rather than left to the select, because a card that dismissed itself mid-run would then be
   * held out for the rest of it — a state the app cannot reach and the story shouldn't invent.
   */
  const autoDismissMs = current?.model.kind === 'progress' ? null : chosenDurationMs
  // A live card the user closed. Its producer goes on describing it, correctly, for the rest of the
  // run — so without this row its button would look dead, which is exactly the confusion the
  // suppression is meant to *prevent* rather than cause.
  const heldOut = queue.suppressed.map((id) => ({
    id,
    label:
      NOTCH_SAMPLES.find((s) => s.model.id === id)?.label ?? (id === AI_RUN_ID ? 'AI run' : id),
  }))

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
        <StoryButton onClick={startAiRun}>
          {filesRead === null ? 'AI run (12 files)' : 'AI run · start over'}
        </StoryButton>
        <StoryButton
          tone="quiet"
          onClick={() => {
            setQueue(emptyNotchQueue)
            setFilesRead(null)
          }}
        >
          clear the queue
        </StoryButton>
      </div>

      {heldOut.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <span>closed while running — nothing can put it back until its operation ends:</span>
          {heldOut.map((entry) => (
            <StoryButton
              key={entry.id}
              tone="quiet"
              onClick={() => endOperation(entry.id, entry.label)}
            >
              end “{entry.label}”
            </StoryButton>
          ))}
        </div>
      )}

      <p className="m-0 max-w-[70ch] text-xs leading-5 text-neutral-400">
        Hover the card to pause its countdown. Send a second one while the first is up: it waits,
        unless it is an error — “Pre-commit failed” and “Checks failed” cut straight in, and the
        card they displaced comes back next instead of being lost.
      </p>
      <p className="m-0 max-w-[70ch] text-xs leading-5 text-neutral-400">
        “AI run” reads twelve files on its own, one every {AI_TICK_MS} ms: the bar fills and the
        card updates in place rather than arriving twelve times. Close it with the ✕ while it runs —
        the log below goes on ticking, and nothing comes back until the run ends, because a live
        card the user closed stays closed for the whole operation. Any other kind may come straight
        back: a second failed hook is a new event, not the first one refusing to leave.
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
