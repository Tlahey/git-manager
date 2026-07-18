import type { CSSProperties, ReactNode } from 'react'
import { parseThemeTokens, type ThemeTokens } from '../src/themeTokens'
import { BUILTIN_THEMES, type ThemeDefinition } from '../src/registry'

// Load every per-theme CSS file as raw text and parse them once, so every story
// renders the exact tokens the app ships (not a hand-copied duplicate) — the same
// engine the CI suite runs. New theme files are picked up automatically.
const rawThemeFiles = import.meta.glob('../src/themes/*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const themesCss = Object.values(rawThemeFiles).join('\n')
export const PARSED_THEMES: Map<string, ThemeTokens> = parseThemeTokens(themesCss)

/** Real, renderable themes in picker order (skips the "system" pseudo-theme). */
export const RENDERABLE_THEMES: ThemeDefinition[] = BUILTIN_THEMES.filter((t) => t.id !== 'system')

/**
 * Builds an inline style that declares every token of a theme as a CSS custom
 * property, so descendants using `hsl(var(--token))` render in that theme without
 * touching `html[data-theme]`. Lets a single page show many themes at once.
 */
export function tokenVars(tokens: ThemeTokens): CSSProperties {
  const style: Record<string, string> = {}
  for (const [key, value] of tokens) style[key] = value
  return style as CSSProperties
}

const hsl = (v: string | undefined) => (v ? `hsl(${v})` : undefined)

/** A rounded token color chip with its name + raw triplet. */
export function TokenChip({ tokens, name }: { tokens: ThemeTokens; name: string }) {
  const value = tokens.get(name)
  const isRadius = name === '--radius'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div
        style={{
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: 6,
          border: '1px solid rgba(128,128,128,0.35)',
          background: isRadius ? 'transparent' : hsl(value),
        }}
      />
      <div style={{ minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 11, lineHeight: 1.3 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ opacity: 0.6 }}>{value ?? '—'}</div>
      </div>
    </div>
  )
}

function Btn({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 'var(--radius)',
        fontSize: 12,
        fontWeight: 600,
        background: `hsl(var(${bg}))`,
        color: `hsl(var(${fg}))`,
      }}
    >
      {children}
    </span>
  )
}

/**
 * A compact "mini-app" that exercises the surfaces the theme most affects: the
 * dark/tinted nav chrome (sidebar rail + tab bar), a content card, the semantic
 * buttons, muted text, and a two-line diff (added/removed) standing in for the
 * code editor. Rendered per theme in the Gallery.
 */
export function MiniApp({ theme }: { theme: ThemeDefinition }) {
  const tokens = PARSED_THEMES.get(theme.id)
  if (!tokens) return <div>Missing tokens for {theme.id}</div>

  return (
    <div
      style={{
        ...tokenVars(tokens),
        border: '1px solid hsl(var(--border))',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
      }}
    >
      <div style={{ display: 'flex', height: 176 }}>
        {/* Sidebar rail (chrome) */}
        <div
          style={{
            width: 132,
            flexShrink: 0,
            background: 'hsl(var(--sidebar-background))',
            color: 'hsl(var(--sidebar-foreground))',
            borderRight: '1px solid hsl(var(--sidebar-border))',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 12,
          }}
        >
          <strong style={{ fontSize: 11, opacity: 0.9 }}>{theme.labelKey.split('.').pop()}</strong>
          <span
            style={{
              padding: '4px 6px',
              borderRadius: 6,
              background: 'hsl(var(--sidebar-accent))',
              color: 'hsl(var(--sidebar-accent-foreground))',
            }}
          >
            main
          </span>
          <span style={{ padding: '4px 6px', color: 'hsl(var(--sidebar-muted-foreground))' }}>
            feature/x
          </span>
          <span style={{ padding: '4px 6px', color: 'hsl(var(--sidebar-muted-foreground))' }}>
            release
          </span>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Tab bar (chrome) */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              padding: '6px 10px',
              background: 'hsl(var(--sidebar-background))',
              color: 'hsl(var(--sidebar-foreground))',
              borderBottom: '1px solid hsl(var(--sidebar-border))',
              fontSize: 11,
            }}
          >
            <span style={{ opacity: 0.65 }}>repo-a</span>
            <span style={{ opacity: 0.65 }}>repo-b</span>
          </div>

          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div
              style={{
                background: 'hsl(var(--card))',
                color: 'hsl(var(--card-foreground))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
                padding: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600 }}>Commit</div>
              <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                feat: add token gallery
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Btn bg="--primary" fg="--primary-foreground">Primary</Btn>
              <Btn bg="--secondary" fg="--secondary-foreground">Secondary</Btn>
              <Btn bg="--destructive" fg="--destructive-foreground">Delete</Btn>
              <Btn bg="--success" fg="--success-foreground">Merge</Btn>
            </div>

            {/* Diff (stands in for the editor) */}
            <div
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 11,
                borderRadius: 6,
                overflow: 'hidden',
                border: '1px solid hsl(var(--border))',
              }}
            >
              <div style={{ padding: '2px 8px', background: 'hsl(var(--primary) / 0.15)' }}>
                + const next = value
              </div>
              <div style={{ padding: '2px 8px', background: 'hsl(var(--destructive) / 0.15)' }}>
                - const prev = value
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
