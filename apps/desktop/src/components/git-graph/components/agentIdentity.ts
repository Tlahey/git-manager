// Agent identity lookups (accent colour + human label), kept out of `AgentLogo.tsx` so that
// file exports components only — a module mixing the two loses Vite's Fast Refresh
// (`react/only-export-components`).

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
