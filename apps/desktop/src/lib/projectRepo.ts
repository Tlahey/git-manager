/**
 * Git Manager's **own** repository — the one the app is, not one it opens.
 *
 * Its own module, and at app level rather than inside the feature that currently needs it, because
 * it is a fact about this product rather than about error reporting. Anything that has to point at
 * the project itself — the issue tracker, a "view the changelog" link, a docs URL — reads it from
 * here instead of pasting the slug again, and someone forking the app changes one line.
 *
 * **It must never be derived from the open repository.** `owner/repo` elsewhere in the app comes
 * from a remote's URL, which is exactly what this is not: a bug in Git Manager filed against the
 * user's employer's repository would be both useless and a leak. That is the whole reason this is
 * a constant and not a lookup.
 *
 * One copy lives outside TypeScript and has to be kept in step by hand: the updater endpoint in
 * `src-tauri/tauri.conf.json` (`plugins.updater.endpoints`) names the same repository, and Tauri
 * reads that file at build time, so it cannot import this one.
 */
export const PROJECT_REPO = { owner: 'Tlahey', repo: 'git-manager' } as const

/** The project's page on GitHub. */
export const PROJECT_REPO_URL = `https://github.com/${PROJECT_REPO.owner}/${PROJECT_REPO.repo}`

/** Where a user files — or reads — a report about the app itself. */
export const PROJECT_ISSUES_URL = `${PROJECT_REPO_URL}/issues`
