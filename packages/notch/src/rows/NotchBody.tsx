import type { CSSProperties } from 'react'
import { Avatar, Progress } from '@git-manager/ui'
import { NOTCH_ROW, statusOutputHeight } from '../notchGeometry'
import { NOTCH_TONE_RGB, toneColor } from '../notchTones'
import {
  STATUS_OUTPUT_MAX_LINES,
  type NotchEventModel,
  type NotchModel,
  type NotchProgressModel,
  type NotchStatusModel,
} from '../types'

/**
 * Row 2 — the only row that differs between kinds.
 *
 * The three bodies live together because they are the same slot rendered three ways, and reading
 * them side by side is how you can tell they stay consistent (same paddings, same type scale, same
 * truncation). Each sizes itself from `NOTCH_ROW`, so the window's height and the card's actual
 * layout can't disagree.
 */

/** Something happened: a face, a title, and who it was. */
export function NotchEventBody({ model }: { model: NotchEventModel }) {
  return (
    <div
      data-testid="notch-event-body"
      style={{ height: NOTCH_ROW.eventBody }}
      className="flex shrink-0 items-center gap-2.5 px-3"
    >
      {model.avatar && (
        <Avatar
          src={model.avatar.src}
          alt={model.avatar.alt}
          size={32}
          fallback={model.avatar.fallback}
          className="bg-white/10 ring-1 ring-white/15"
        />
      )}
      <div className="min-w-0 flex-1">
        <p data-testid="notch-title" className="truncate text-xs font-semibold text-white">
          {model.title}
        </p>
        {model.subtitle !== undefined && (
          <p
            data-testid="notch-subtitle"
            className="truncate text-[11px]"
            style={{ color: toneColor(model.tone) }}
          >
            {model.subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

/** Something is running: a title, a bar, and a count. */
export function NotchProgressBody({ model }: { model: NotchProgressModel }) {
  const indeterminate = model.ratio === undefined
  const percent =
    model.ratio === undefined ? 0 : Math.round(Math.max(0, Math.min(1, model.ratio)) * 100)

  return (
    <div
      data-testid="notch-progress-body"
      style={{ height: NOTCH_ROW.progressBody }}
      className="flex shrink-0 flex-col justify-center gap-1.5 px-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p data-testid="notch-title" className="truncate text-xs font-semibold text-white">
          {model.title}
        </p>
        {!indeterminate && (
          <span
            data-testid="notch-progress-percent"
            className="shrink-0 text-[10px] tabular-nums text-white/45"
          >
            {percent}%
          </span>
        )}
      </div>
      <Progress
        value={percent}
        indeterminate={indeterminate}
        aria-label={model.title}
        className="h-1 bg-white/10"
        // The fill reads the tone off a custom property set on the track, because `Progress` only
        // takes a *class* for its indicator — there is no style hook on the inner element.
        indicatorClassName="bg-[rgb(var(--notch-tone-rgb))]"
        style={{ '--notch-tone-rgb': NOTCH_TONE_RGB[model.tone] } as CSSProperties}
      />
      {model.detail !== undefined && (
        <p data-testid="notch-progress-detail" className="truncate text-[10px] text-white/40">
          {model.detail}
        </p>
      )}
    </div>
  )
}

/** Something finished: the outcome, and the tail of what it printed. */
export function NotchStatusBody({ model }: { model: NotchStatusModel }) {
  const lines = (model.outputLines ?? []).slice(-STATUS_OUTPUT_MAX_LINES)

  return (
    <>
      <div
        data-testid="notch-status-body"
        style={{ height: NOTCH_ROW.statusBody }}
        className="flex shrink-0 items-center px-3"
      >
        <p data-testid="notch-title" className="truncate text-xs font-semibold text-white">
          {model.title}
        </p>
      </div>
      {lines.length > 0 && (
        <pre
          data-testid="notch-status-output"
          style={{
            height: statusOutputHeight(lines.length),
            lineHeight: `${NOTCH_ROW.statusOutputLine}px`,
          }}
          // `py-1.5` is `statusOutputHeight`'s padding term: border-box takes it out of the height,
          // leaving exactly `lines × statusOutputLine` for the text itself.
          className="mx-3 overflow-hidden whitespace-pre py-1.5 font-mono text-[10px] text-white/40"
        >
          {lines.join('\n')}
        </pre>
      )}
    </>
  )
}

/** Picks the body for a model. Exhaustive by construction — a new kind fails to compile here. */
export function NotchBody({ model }: { model: NotchModel }) {
  switch (model.kind) {
    case 'event':
      return <NotchEventBody model={model} />
    case 'progress':
      return <NotchProgressBody model={model} />
    case 'status':
      return <NotchStatusBody model={model} />
  }
}
