// Brand glyph for the AI coding agent detected working in a worktree — rendered inside that
// worktree's dashed "// WIP" ring in the commit graph (see GraphCell). Purely presentational: it
// takes an agent id string (from `WorktreeAgentActivity.agent`) and a pixel size, and falls back to
// a generic robot mark for any agent it doesn't have a dedicated glyph for yet. Today the backend
// only emits `'claude'`, but the registry is open so more detectors slot in without touching
// callers.

import { Bot } from 'lucide-react'

/** Brand accent per agent — used for the glyph so each agent reads at a glance even at 16px. */
const AGENT_COLORS: Record<string, string> = {
  claude: '#D97757',
  gpt: '#10A37F',
  gemini: '#4285F4',
  grok: '#111111',
  copilot: '#6E40C9',
}

export function agentColor(agent: string): string {
  return AGENT_COLORS[agent] ?? 'hsl(var(--muted-foreground))'
}

/** Human label for the agent, for tooltips/aria. */
export function agentLabel(agent: string): string {
  switch (agent) {
    case 'claude':
      return 'Claude'
    case 'gpt':
      return 'GPT'
    case 'gemini':
      return 'Gemini'
    case 'grok':
      return 'Grok'
    case 'copilot':
      return 'Copilot'
    default:
      return 'Agent'
  }
}

/** Stylized Anthropic "burst": tapered rays radiating from the centre. Approximation, not the exact
 * trademark — enough to read as Claude at graph scale. */
function ClaudeGlyph({ size, color }: { size: number; color: string }) {
  const c = size / 2
  const rays = 12
  const inner = size * 0.12
  const outer = size * 0.46
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g stroke={color} strokeWidth={Math.max(1, size * 0.09)} strokeLinecap="round">
        {Array.from({ length: rays }).map((_, i) => {
          const a = (i / rays) * Math.PI * 2
          return (
            <line
              key={i}
              x1={c + Math.cos(a) * inner}
              y1={c + Math.sin(a) * inner}
              x2={c + Math.cos(a) * outer}
              y2={c + Math.sin(a) * outer}
            />
          )
        })}
      </g>
    </svg>
  )
}

interface AgentLogoProps {
  agent: string
  /** Rendered glyph box in pixels. */
  size: number
}

export function AgentLogo({ agent, size }: AgentLogoProps) {
  const color = agentColor(agent)
  if (agent === 'claude') {
    return <ClaudeGlyph size={size} color={color} />
  }
  // No dedicated glyph yet → generic robot in the agent's accent colour.
  return <Bot style={{ width: size, height: size, color }} aria-hidden="true" />
}
