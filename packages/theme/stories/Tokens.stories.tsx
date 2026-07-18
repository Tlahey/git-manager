import type { Meta, StoryObj } from '@storybook/react'
import { PARSED_THEMES, RENDERABLE_THEMES, TokenChip, tokenVars } from './_shared'
import { THEME_TOKEN_KEYS } from '../src/themeTokens'

// A color-chip table of every canonical token for a chosen theme — the fastest way
// to spot a missing, off, or accidentally-duplicated token. Switch theme with the
// "Theme" toolbar control (top of the canvas).
const meta = {
  title: 'Themes/Token table',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj

export const Tokens: Story = {
  render: (_args, { globals }) => {
    const themeId = (globals.theme as string) ?? 'twilight'
    const theme = RENDERABLE_THEMES.find((t) => t.id === themeId) ?? RENDERABLE_THEMES[0]
    const tokens = PARSED_THEMES.get(theme.id)
    if (!tokens) return <div>No tokens for {theme.id}</div>

    return (
      <div
        style={{
          ...tokenVars(tokens),
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          padding: 20,
          borderRadius: 10,
        }}
      >
        <h3 style={{ margin: '0 0 4px', fontFamily: 'sans-serif' }}>{theme.id}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
          {THEME_TOKEN_KEYS.length} canonical tokens · pick another theme from the Theme toolbar
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 12,
          }}
        >
          {THEME_TOKEN_KEYS.map((name) => (
            <TokenChip key={name} tokens={tokens} name={name} />
          ))}
        </div>
      </div>
    )
  },
}
