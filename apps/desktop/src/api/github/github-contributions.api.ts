import type { DayCommit } from '../../lib/github/types'
import { ghGraphQL } from './githubApiShared'

/** Fetch full-year contribution calendar via GitHub GraphQL API */
export async function fetchGitHubContributions(
  username: string,
  accountId: string
): Promise<DayCommit[]> {
  const now = new Date()
  const oneYearAgo = new Date(now)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const query = `query($login:String!, $from:DateTime!, $to:DateTime!) {
    user(login:$login) {
      contributionsCollection(from:$from, to:$to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }`

  const data = await ghGraphQL<{
    user?: {
      contributionsCollection?: {
        contributionCalendar?: {
          weeks?: Array<{ contributionDays: Array<{ date: string; contributionCount: number }> }>
        }
      }
    }
  }>(query, { login: username, from: oneYearAgo.toISOString(), to: now.toISOString() }, accountId)

  const weeks = data?.user?.contributionsCollection?.contributionCalendar?.weeks ?? []
  const days: DayCommit[] = []
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      days.push({ date: day.date, commits: day.contributionCount })
    }
  }
  return days
}
