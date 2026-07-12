/**
 * The assembled mascot as consumers see it (`<OctopusMascot>` → `<git-mascot>`),
 * plus reference-comparison views: side-by-side and an aligned ghost overlay
 * to judge how close the rig is to the brand illustration.
 */

import type { Meta, StoryObj } from '@storybook/react'
import { OctopusMascot } from '../src'
import { MASCOT_LAYOUT, referenceFrame, referenceUrl } from './rigUtils'

const meta: Meta<typeof OctopusMascot> = {
  title: 'Mascot/Assembled',
  component: OctopusMascot,
  argTypes: {
    size: { control: { type: 'range', min: 80, max: 800, step: 10 } },
    animated: { control: 'boolean' },
    eyeTracking: { control: 'boolean' },
  },
  args: { size: 420, animated: true, eyeTracking: true },
}
export default meta

type Story = StoryObj<typeof OctopusMascot>

const dark = {
  background: '#0a1830',
  padding: 24,
  minHeight: '100vh',
  boxSizing: 'border-box' as const,
}

export const Default: Story = {
  render: (args) => (
    <div style={dark}>
      <OctopusMascot {...args} />
    </div>
  ),
}

export const OnLightBackground: Story = {
  render: (args) => (
    <div style={{ ...dark, background: '#eef4f8' }}>
      <OctopusMascot {...args} />
    </div>
  ),
}

export const SideBySideWithReference: Story = {
  render: (args) => (
    <div style={{ ...dark, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <figure style={{ margin: 0 }}>
        <OctopusMascot {...args} />
        <figcaption style={{ color: '#9fb6d4', fontFamily: 'sans-serif', fontSize: 13 }}>
          rig
        </figcaption>
      </figure>
      <figure style={{ margin: 0 }}>
        <img src={referenceUrl} width={args.size} alt="reference" style={{ borderRadius: 8 }} />
        <figcaption style={{ color: '#9fb6d4', fontFamily: 'sans-serif', fontSize: 13 }}>
          référence
        </figcaption>
      </figure>
    </div>
  ),
}

interface OverlayArgs {
  size: number
  refOpacity: number
  refOnTop: boolean
}

/**
 * The reference ghost drawn in the same coordinate space as the live
 * component. The component renders the stage viewBox scaled to `size`px, so
 * the ghost uses the same px-per-stage-unit factor and the alignment frame
 * from rigUtils.
 */
export const ReferenceOverlayOnLive: StoryObj<OverlayArgs> = {
  name: 'Reference overlay (aligned)',
  argTypes: {
    size: { control: { type: 'range', min: 200, max: 800, step: 10 } },
    refOpacity: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    refOnTop: { control: 'boolean' },
  },
  args: { size: 560, refOpacity: 0.45, refOnTop: true },
  render: ({ size, refOpacity, refOnTop }) => {
    const vb = MASCOT_LAYOUT.viewBox
    const k = size / vb.width // px per stage unit, same as the component's own scaling
    const f = referenceFrame()
    const ghost = (
      <img
        src={referenceUrl}
        alt="reference ghost"
        style={{
          position: 'absolute',
          left: (f.left - vb.minX) * k,
          top: (f.top - vb.minY) * k,
          width: f.width * k,
          opacity: refOpacity,
          pointerEvents: 'none',
          zIndex: refOnTop ? 2 : 0,
        }}
      />
    )
    return (
      <div style={dark}>
        <div style={{ position: 'relative', width: size }}>
          {ghost}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <OctopusMascot size={size} animated={false} eyeTracking={false} />
          </div>
        </div>
        <p style={{ color: '#9fb6d4', fontFamily: 'sans-serif', fontSize: 13, maxWidth: 560 }}>
          La référence est alignée via le point de couronne + largeur max de tête
          (MASCOT_LAYOUT.reference). Animations coupées pour comparer à la pose de repos.
        </p>
      </div>
    )
  },
}
