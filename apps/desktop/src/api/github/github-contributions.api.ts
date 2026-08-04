import type { DayCommit } from '../../app/pull-requests/types'

/** Fetch full-year contribution calendar via GitHub GraphQL API */
export async function fetchGitHubContributions(
  username: string,
  token: string
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

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        from: oneYearAgo.toISOString(),
        to: now.toISOString(),
      },
    }),
  })

  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`)
  const json = await res.json()

  if (json?.errors) {
    throw new Error(json.errors.map((e: { message: string }) => e.message).join(', '))
  }

  const weeks = json?.data?.user?.contributionsCollection?.contributionCalendar?.weeks ?? []
  const days: DayCommit[] = []
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      days.push({ date: day.date, commits: day.contributionCount })
    }
  }
  return days
}
