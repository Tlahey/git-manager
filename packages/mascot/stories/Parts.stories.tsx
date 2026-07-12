/**
 * Every sprite of the sheet in its own frame — for checking the slicing
 * (chroma-key edges, cropped bounds) and each part's drawing against the
 * reference. Hover a card to zoom the part and reveal its bounding box.
 */

import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { SPRITES } from './rigUtils'

const meta: Meta = { title: 'Mascot/Parts' }
export default meta

const LABELS: Record<string, string> = {
  head: 'tête (sans visage)',
  eye: 'pupille (réutilisée ×2)',
  eyelid: 'paupière / bouche',
  t1: 'bras supérieur gauche',
  t4: 'bras supérieur droit',
  t3: 'tentacule extérieure gauche',
  t2: 'tentacule extérieure droite',
  t5: 'tentacule milieu gauche',
  t8: 'tentacule milieu droite (sombre, flippée)',
  t7: 'tentacule intérieure gauche',
  t6: 'tentacule intérieure droite',
}

function PartCard({ name, background }: { name: keyof typeof SPRITES; background: string }) {
  const [hover, setHover] = useState(false)
  const s = SPRITES[name]
  return (
    <figure
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 10,
        background,
        border: hover ? '1px solid #35e0c2' : '1px solid #24406a',
        transition: 'border-color 0.15s',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          height: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <img
          src={s.uri}
          alt={name}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            outline: hover ? '1px dashed #35e0c2' : 'none',
            transform: hover ? 'scale(1.15)' : 'none',
            transition: 'transform 0.15s',
          }}
        />
      </div>
      <figcaption style={{ color: '#cfe3f5', fontSize: 13, marginTop: 8 }}>
        <strong>{name}</strong> — {LABELS[name] ?? ''}
        <br />
        <span style={{ color: '#7d95b5', fontSize: 12 }}>
          {s.w}×{s.h}px
        </span>
      </figcaption>
    </figure>
  )
}

interface GalleryArgs {
  background: 'dark' | 'light' | 'checker'
}

export const Gallery: StoryObj<GalleryArgs> = {
  argTypes: { background: { control: 'radio', options: ['dark', 'light', 'checker'] } },
  args: { background: 'dark' },
  render: ({ background }) => {
    const bg =
      background === 'dark'
        ? '#0a1830'
        : background === 'light'
          ? '#eef4f8'
          : 'repeating-conic-gradient(#e8e8e8 0% 25%, #ffffff 0% 50%) 0 0 / 20px 20px'
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
          padding: 20,
          background: '#060d1c',
          minHeight: '100vh',
          boxSizing: 'border-box',
        }}
      >
        {(Object.keys(SPRITES) as (keyof typeof SPRITES)[]).map((name) => (
          <PartCard key={name} name={name} background={bg} />
        ))}
      </div>
    )
  },
}
