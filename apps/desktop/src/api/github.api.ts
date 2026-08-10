// Barrel: github.api.ts used to be a single ~1500-line file covering every GitHub sub-domain (pull
// requests, issues, reviews, checks/mergeability, reviewers/assignees/labels, releases, the
// contribution calendar, and device-flow auth). Split in 2026-08 into one file per domain under
// `github/`, mirroring the earlier `git.api.ts` → `git/*.api.ts` split — this barrel keeps every
// existing `from './github.api'` import site working unchanged; migrate call sites to the
// specific domain file gradually rather than all at once.
//
// `GhUser`/`GhLabel` are re-exported explicitly (not via a wildcard) because they live in the
// internal `githubApiShared.ts` kernel alongside `ghFetch`/`ghRequest`/`ghGraphQL`, which were
// never part of this file's public surface and must stay that way.
export type { GhUser, GhLabel } from './github/githubApiShared'
export * from './github/github-pulls.api'
export * from './github/github-issues.api'
export * from './github/github-reviews.api'
export * from './github/github-checks.api'
export * from './github/github-labels.api'
export * from './github/github-releases.api'
export * from './github/github-contributions.api'
export * from './github/github-auth.api'
