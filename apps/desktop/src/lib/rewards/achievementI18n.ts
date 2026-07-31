/** Builds the `launchpad` namespace key for one achievement's translatable text — see the doc
 *  comment on `AchievementDefinition` in `types.ts` for why title/description/reward aren't
 *  fields on the achievement data itself. */
export function achievementI18nKey(id: string, field: 'title' | 'description' | 'reward'): string {
  return `rewards.achievements.${id}.${field}`
}
