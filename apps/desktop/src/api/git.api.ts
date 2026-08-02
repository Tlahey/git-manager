// Barrel: git.api.ts used to be a single ~1250-line file covering every git sub-domain (commit,
// fixup, patch, stash, branch, remote, log, bisect, rebase). Split in 2026-08 into one file per
// domain under `git/`, mirroring the Rust backend's own `services/git_*.rs` split — this barrel
// keeps every existing `from '../api/git.api'` import site working unchanged; migrate call sites
// to the specific domain file gradually rather than all at once.
export * from './git/git-commit.api'
export * from './git/git-fixup.api'
export * from './git/git-rollback.api'
export * from './git/git-patch.api'
export * from './git/git-stash.api'
export * from './git/git-branch.api'
export * from './git/git-remote.api'
export * from './git/git-log.api'
export * from './git/git-bisect.api'
export * from './git/git-rebase.api'
