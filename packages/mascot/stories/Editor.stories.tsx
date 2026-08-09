/**
 * Layout editor — the parts → JSON workflow:
 *
 *   1. the package's parts (`assets/parts/*.png`, one file per element) and
 *      the layout (`assets/layout.json`) are loaded on startup — the
 *      editor's initial state IS the current rig (any part can be replaced
 *      by loading another PNG over it),
 *   2. place each part on the 1000×1000 stage (drag, scale, rotation, flip,
 *      opacity, pivot + animation params), with the brand reference aligned
 *      as an overlay; the "Layers" panel lists the placements in paint order
 *      (top = front) and reorders by drag-and-drop,
 *   3. export the JSON → `assets/layout.json`, then
 *      `pnpm --filter @git-manager/mascot generate` regenerates
 *      `src/generated/{sprites,layout}.ts`, which the apps consume.
 *
 * Unlike the old packed-sheet editor, there's no chroma-key step: every part
 * file is already genuinely transparent. Each part is still auto-trimmed to
 * its bounding box (padded a few px) exactly like `scripts/generate.mjs`, so
 * the slice shown here matches what generation will actually ship.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { ReferenceOverlay, SPRITES, Stage } from './rigUtils'
import { LayersPanel } from './LayersPanel'
import layoutJson from '../assets/layout.json'

const meta: Meta = { title: 'Mascot/Layout editor' }
export default meta

/* the package's own parts (assets/parts/*.png), keyed by filename */
const bundledParts = import.meta.glob('../assets/parts/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
const bundledPartUrl = (file: string): string | undefined =>
  bundledParts[Object.keys(bundledParts).find((k) => k.endsWith(`/${file}`)) ?? '']

const PAD = 4

/* ── document model (this is the exported JSON's shape) ─────────────────── */

interface Part {
  id: string
  role: 'tentacle' | 'head' | 'eye' | 'eyelid' | 'mouth' | 'other'
  file: string
}

interface Placement {
  zone: string
  x: number
  y: number
  scale: number
  rot: number
  flip: boolean
  opacity: number
  pivot: { x: number; y: number }
  anim: { amp: number; dur: number; delay: number }
}

interface Doc {
  version: 2
  parts: Part[]
  stage: { width: number; height: number }
  /** paint order: first = furthest back, last = furthest front */
  placements: Placement[]
}

/** The committed layout (assets/layout.json) as the editor's starting document. */
function initialDoc(): Doc {
  return structuredClone(layoutJson) as Doc
}

/* ── trimming (canvas crop to the alpha bounding box, padded) ───────────── */

/** Mirrors scripts/generate.mjs's trim+pad, in-browser, so the editor shows
 * exactly what generation will ship. No chroma-key step: parts are already
 * genuinely transparent. */
function trimImage(img: HTMLImageElement): { uri: string; w: number; h: number } {
  const full = document.createElement('canvas')
  full.width = img.naturalWidth
  full.height = img.naturalHeight
  const fctx = full.getContext('2d')!
  fctx.drawImage(img, 0, 0)
  const { data } = fctx.getImageData(0, 0, full.width, full.height)

  let x0 = full.width,
    y0 = full.height,
    x1 = -1,
    y1 = -1
  for (let y = 0; y < full.height; y++) {
    for (let x = 0; x < full.width; x++) {
      if (data[(y * full.width + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return { uri: full.toDataURL(), w: full.width, h: full.height }
  x0 = Math.max(0, x0 - PAD)
  y0 = Math.max(0, y0 - PAD)
  x1 = Math.min(full.width - 1, x1 + PAD)
  y1 = Math.min(full.height - 1, y1 + PAD)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')!.drawImage(full, x0, y0, w, h, 0, 0, w, h)
  return { uri: out.toDataURL(), w, h }
}

/* ── the editor ─────────────────────────────────────────────────────────── */

const panel: CSSProperties = {
  background: '#0d1b33',
  border: '1px solid #24406a',
  borderRadius: 10,
  padding: 12,
  color: '#cfe3f5',
  fontSize: 12,
}
const label: CSSProperties = { color: '#7d95b5', display: 'block', marginTop: 6 }
const num: CSSProperties = {
  width: 64,
  background: '#0a1426',
  color: '#cfe3f5',
  border: '1px solid #2a4a78',
  borderRadius: 4,
  padding: '2px 4px',
}

function Editor() {
  const [doc, setDoc] = useState<Doc>(initialDoc)
  const [slices, setSlices] = useState<Record<string, { uri: string; w: number; h: number }>>({})
  const [selPart, setSelPart] = useState<number | null>(null)
  const [refOpacity, setRefOpacity] = useState(0.35)
  const [pivotMode, setPivotMode] = useState(false)
  const [animate, setAnimate] = useState(false)
  const [importText, setImportText] = useState('')
  const dragRef = useRef<{ idx: number; dx: number; dy: number } | null>(null)
  const partEls = useRef<Map<number, HTMLImageElement>>(new Map())

  const STAGE_W = 560

  const uriFor = (partId: string): string | null =>
    slices[partId]?.uri ??
    (SPRITES as Record<string, { uri: string } | undefined>)[partId]?.uri ??
    null
  const widthFor = (partId: string): number =>
    slices[partId]?.w ?? (SPRITES as Record<string, { w: number } | undefined>)[partId]?.w ?? 300

  const loadPart = (id: string, file: File) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setSlices((s) => ({ ...s, [id]: trimImage(img) }))
      setDoc((d) => ({
        ...d,
        parts: d.parts.map((p) => (p.id === id ? { ...p, file: file.name } : p)),
      }))
    }
    img.src = url
  }

  /* the package's own parts (assets/parts/*.png) are loaded on mount */
  useEffect(() => {
    for (const part of doc.parts) {
      const url = bundledPartUrl(part.file)
      if (!url) continue
      const img = new Image()
      img.onload = () => setSlices((s) => ({ ...s, [part.id]: trimImage(img) }))
      img.src = url
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  /* sway preview: mutates transforms directly, no re-render */
  useEffect(() => {
    if (!animate) {
      for (const [idx, el] of partEls.current) {
        const p = doc.placements[idx]
        if (p) el.style.transform = baseTransform(p)
      }
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      for (const [idx, el] of partEls.current) {
        const p = doc.placements[idx]
        if (!p) continue
        const w = p.anim.amp
          ? p.anim.amp * Math.sin(((t - p.anim.delay) / p.anim.dur) * Math.PI * 2)
          : 0
        const ox = p.pivot.x - p.x
        const oy = p.pivot.y - p.y
        el.style.transform = `translate(${ox}px,${oy}px) rotate(${w}deg) translate(${-ox}px,${-oy}px) ${baseTransform(p)}`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animate, doc])

  const baseTransform = (p: Placement) => `${p.flip ? 'scale(-1,1) ' : ''}rotate(${p.rot}deg)`

  const patchPart = (idx: number, patch: Partial<Placement>) =>
    setDoc((d) => ({
      ...d,
      placements: d.placements.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    }))

  const movePart = (idx: number, dir: number) =>
    setDoc((d) => {
      const arr = [...d.placements]
      const j = idx + dir
      if (j < 0 || j >= arr.length) return d
      ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
      setSelPart(j)
      return { ...d, placements: arr }
    })

  const reorderPart = (from: number, to: number) => {
    if (from === to) return
    // keep the selection on the same placement across the reindexing
    if (selPart !== null) {
      if (selPart === from) setSelPart(to)
      else if (from < selPart && selPart <= to) setSelPart(selPart - 1)
      else if (to <= selPart && selPart < from) setSelPart(selPart + 1)
    }
    setDoc((d) => {
      const arr = [...d.placements]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return { ...d, placements: arr }
    })
  }

  const addToStage = (partId: string) => {
    setDoc((d) => ({
      ...d,
      placements: [
        ...d.placements,
        {
          zone: partId,
          x: 400,
          y: 400,
          scale: 0.56,
          rot: 0,
          flip: false,
          opacity: 1,
          pivot: { x: 500, y: 450 },
          anim: { amp: 0, dur: 3.5, delay: 0 },
        },
      ],
    }))
    setSelPart(doc.placements.length)
  }

  const sel = selPart !== null ? doc.placements[selPart] : null
  const exportJson = useMemo(() => JSON.stringify(doc, null, 2), [doc])

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: 14,
        background: '#060d1c',
        minHeight: '100vh',
        boxSizing: 'border-box',
        fontFamily: 'sans-serif',
        alignItems: 'flex-start',
      }}
    >
      {/* ── parts ── */}
      <div style={{ ...panel, width: 220 }}>
        <strong>1. Parts</strong>
        <p style={{ color: '#7d95b5', margin: '6px 0' }}>
          one file per element — already transparent, no chroma-key step
        </p>
        {doc.parts.map((part) => {
          const slice = slices[part.id]
          const onStage = doc.placements.some((p) => p.zone === part.id)
          return (
            <div
              key={part.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 0',
                borderTop: '1px solid #16294a',
              }}
            >
              {slice ? (
                <img
                  src={slice.uri}
                  alt={part.id}
                  style={{ width: 32, height: 32, objectFit: 'contain' }}
                />
              ) : (
                <span style={{ width: 32, height: 32 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  <code>{part.id}</code> <span style={{ color: '#7d95b5' }}>{part.role}</span>
                </div>
                <label style={{ display: 'block' }}>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ fontSize: 10, width: '100%' }}
                    onChange={(e) => e.target.files?.[0] && loadPart(part.id, e.target.files[0])}
                  />
                </label>
              </div>
              {!onStage && (
                <button
                  onClick={() => addToStage(part.id)}
                  disabled={!slice}
                  style={{
                    background: '#16345c',
                    color: '#cfe3f5',
                    border: 'none',
                    borderRadius: 4,
                    padding: '3px 6px',
                    fontSize: 10,
                  }}
                >
                  add
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── stage ── */}
      <div style={{ ...panel, width: STAGE_W + 24 }}>
        <strong>2. Stage</strong>
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            margin: '6px 0',
            flexWrap: 'wrap',
          }}
        >
          <label>
            reference
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={refOpacity}
              onChange={(e) => setRefOpacity(+e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={animate}
              onChange={(e) => setAnimate(e.target.checked)}
            />{' '}
            animate
          </label>
          <button
            onClick={() => setPivotMode((v) => !v)}
            style={{
              background: pivotMode ? '#ff5470' : '#16345c',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '3px 8px',
            }}
          >
            {pivotMode ? 'click the stage to place the pivot' : 'place pivot'}
          </button>
        </div>
        <div
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            if (pivotMode && sel && selPart !== null) {
              const r = (e.currentTarget.firstChild as HTMLElement).getBoundingClientRect()
              const kStage = STAGE_W / doc.stage.width
              patchPart(selPart, {
                pivot: {
                  x: Math.round((e.clientX - r.left) / kStage),
                  y: Math.round((e.clientY - r.top) / kStage),
                },
              })
              setPivotMode(false)
            }
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current
            if (!drag) return
            const r = (e.currentTarget.firstChild as HTMLElement).getBoundingClientRect()
            const kStage = STAGE_W / doc.stage.width
            patchPart(drag.idx, {
              x: Math.round((e.clientX - r.left) / kStage - drag.dx),
              y: Math.round((e.clientY - r.top) / kStage - drag.dy),
            })
          }}
          onPointerUp={() => (dragRef.current = null)}
        >
          <Stage width={STAGE_W}>
            {doc.placements.map((p, idx) => {
              const uri = uriFor(p.zone)
              const w = widthFor(p.zone)
              if (!uri) return null
              const kStage = STAGE_W / doc.stage.width
              return (
                <img
                  key={`${p.zone}-${idx}`}
                  ref={(el) => {
                    if (el) partEls.current.set(idx, el)
                    else partEls.current.delete(idx)
                  }}
                  src={uri}
                  alt={p.zone}
                  onPointerDown={(e) => {
                    if (pivotMode) return
                    e.stopPropagation()
                    setSelPart(idx)
                    const stageBox = (
                      e.currentTarget.parentElement as HTMLElement
                    ).getBoundingClientRect()
                    dragRef.current = {
                      idx,
                      dx: (e.clientX - stageBox.left) / kStage - p.x,
                      dy: (e.clientY - stageBox.top) / kStage - p.y,
                    }
                  }}
                  style={{
                    position: 'absolute',
                    left: p.x,
                    top: p.y,
                    width: w * p.scale,
                    opacity: p.opacity,
                    transformOrigin: '0 0',
                    transform: baseTransform(p),
                    outline: selPart === idx ? '2px dashed #35e0c2' : 'none',
                    cursor: 'grab',
                  }}
                />
              )
            })}
            {sel && (
              <div
                style={{
                  position: 'absolute',
                  left: sel.pivot.x - 7,
                  top: sel.pivot.y - 7,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid #ff5470',
                  pointerEvents: 'none',
                  zIndex: 9,
                }}
              />
            )}
            <ReferenceOverlay opacity={refOpacity} />
          </Stage>
        </div>
        <p style={{ color: '#7d95b5', margin: '6px 0 0' }}>
          drag a part to move it · click to select
        </p>
      </div>

      {/* ── layers (paint order) ── */}
      <div style={{ ...panel, width: 220 }}>
        <strong>3. Layers</strong>
        <LayersPanel
          layers={doc.placements.map((p) => ({ zone: p.zone, x: p.x, y: p.y }))}
          selected={selPart}
          uriFor={uriFor}
          onSelect={setSelPart}
          onReorder={reorderPart}
        />
      </div>

      {/* ── inspector + JSON ── */}
      <div style={{ ...panel, width: 300 }}>
        <strong>4. Selected part</strong>
        {sel && selPart !== null ? (
          <div>
            <p style={{ margin: '6px 0' }}>
              <code>{sel.zone}</code> — layer {selPart + 1}/{doc.placements.length}{' '}
              <button onClick={() => movePart(selPart, -1)} title="send backward">
                ▼ back
              </button>{' '}
              <button onClick={() => movePart(selPart, +1)} title="bring forward">
                ▲ front
              </button>
            </p>
            {(
              [
                ['x', sel.x],
                ['y', sel.y],
                ['scale', sel.scale],
                ['rot', sel.rot],
                ['opacity', sel.opacity],
              ] as const
            ).map(([k, v]) => (
              <label key={k} style={label}>
                {k}{' '}
                <input
                  style={num}
                  type="number"
                  step={k === 'scale' || k === 'opacity' ? 0.05 : 1}
                  value={v}
                  onChange={(e) => patchPart(selPart, { [k]: +e.target.value })}
                />
              </label>
            ))}
            <label style={label}>
              <input
                type="checkbox"
                checked={sel.flip}
                onChange={(e) => patchPart(selPart, { flip: e.target.checked })}
              />{' '}
              flip
            </label>
            <label style={label}>
              pivot{' '}
              <input
                style={num}
                type="number"
                value={sel.pivot.x}
                onChange={(e) =>
                  patchPart(selPart, { pivot: { ...sel.pivot, x: +e.target.value } })
                }
              />{' '}
              <input
                style={num}
                type="number"
                value={sel.pivot.y}
                onChange={(e) =>
                  patchPart(selPart, { pivot: { ...sel.pivot, y: +e.target.value } })
                }
              />
            </label>
            <label style={label}>
              anim amp/dur/delay{' '}
              <input
                style={{ ...num, width: 44 }}
                type="number"
                step={0.2}
                value={sel.anim.amp}
                onChange={(e) =>
                  patchPart(selPart, { anim: { ...sel.anim, amp: +e.target.value } })
                }
              />
              <input
                style={{ ...num, width: 44 }}
                type="number"
                step={0.1}
                value={sel.anim.dur}
                onChange={(e) =>
                  patchPart(selPart, { anim: { ...sel.anim, dur: +e.target.value } })
                }
              />
              <input
                style={{ ...num, width: 44 }}
                type="number"
                step={0.05}
                value={sel.anim.delay}
                onChange={(e) =>
                  patchPart(selPart, { anim: { ...sel.anim, delay: +e.target.value } })
                }
              />
            </label>
            <button
              style={{
                marginTop: 8,
                background: '#5c1626',
                color: '#ffb3c0',
                border: 'none',
                borderRadius: 4,
                padding: '3px 8px',
              }}
              onClick={() => {
                setDoc((d) => ({ ...d, placements: d.placements.filter((_, i) => i !== selPart) }))
                setSelPart(null)
              }}
            >
              delete part
            </button>
          </div>
        ) : (
          <p style={{ color: '#7d95b5' }}>
            click a part on the stage (or “add” from the parts list)
          </p>
        )}

        <hr style={{ border: 0, borderTop: '1px solid #24406a', margin: '12px 0' }} />
        <strong>5. JSON</strong>
        <textarea
          readOnly
          value={exportJson}
          style={{
            width: '100%',
            height: 140,
            background: '#0a1426',
            color: '#9fe8d5',
            border: '1px solid #2a4a78',
            fontSize: 10,
            marginTop: 6,
          }}
        />
        <button
          style={{
            background: '#16345c',
            color: '#cfe3f5',
            border: 'none',
            borderRadius: 4,
            padding: '3px 8px',
            marginTop: 4,
          }}
          onClick={() => navigator.clipboard.writeText(exportJson)}
        >
          copy export
        </button>
        <label style={label}>import:</label>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="paste an exported JSON here"
          style={{
            width: '100%',
            height: 60,
            background: '#0a1426',
            color: '#cfe3f5',
            border: '1px solid #2a4a78',
            fontSize: 10,
          }}
        />
        <button
          style={{
            background: '#16345c',
            color: '#cfe3f5',
            border: 'none',
            borderRadius: 4,
            padding: '3px 8px',
            marginTop: 4,
          }}
          onClick={() => {
            try {
              const d = JSON.parse(importText) as Doc
              if (d.version !== 2 || !Array.isArray(d.placements))
                throw new Error('unexpected format')
              setDoc(d)
              setSelPart(null)
            } catch (err) {
              alert(`Import failed: ${String(err)}`)
            }
          }}
        >
          apply import
        </button>
      </div>
    </div>
  )
}

export const LayoutEditor: StoryObj = {
  name: 'Layout editor',
  render: () => <Editor />,
}
