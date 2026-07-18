import type { Meta, StoryObj } from '@storybook/react'
import { MiniApp, RENDERABLE_THEMES } from './_shared'

// Renders every built-in theme side by side as a mini-app sample (nav chrome +
// content card + semantic buttons + a diff), so theme integrity is verifiable at
// a glance — and Twilight's dark menu vs light content reads in context.
const meta = {
  title: 'Themes/Gallery',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

export const AllThemes: Story = {
  render: () => (
    <div style={{ padding: 20, background: '#111', minHeight: '100vh' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 16,
        }}
      >
        {RENDERABLE_THEMES.map((theme) => (
          <div key={theme.id}>
            <div style={{ color: '#ddd', fontSize: 12, marginBottom: 6, fontFamily: 'sans-serif' }}>
              {theme.id}
              {theme.isDark ? ' · dark' : ' · light'}
            </div>
            <MiniApp theme={theme} />
          </div>
        ))}
      </div>
    </div>
  ),
}
