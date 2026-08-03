import { describe, it, expect } from 'vitest'
import { describeGitCommand, isGitCommandOperation } from './gitCommandCatalog'

/** The rendered lines of one operation, for terser assertions. */
function lines(command: string, args?: unknown): string[] {
  return describeGitCommand(command, args)?.lines ?? []
}

describe('isGitCommandOperation', () => {
  it('accepts operations that change the repository', () => {
    expect(isGitCommandOperation('create_commit')).toBe(true)
    expect(isGitCommandOperation('push_branch')).toBe(true)
    expect(isGitCommandOperation('stash_pop')).toBe(true)
  })

  it('rejects the reads the app performs continuously', () => {
    // This is the filter that keeps the journal a list of actions rather than an IPC trace, so the
    // polled reads matter as much as the writes.
    expect(isGitCommandOperation('get_repo_status')).toBe(false)
    expect(isGitCommandOperation('get_log')).toBe(false)
    expect(isGitCommandOperation('get_commit_diff')).toBe(false)
  })

  it('rejects the undo/redo plumbing, whose commands nobody would type', () => {
    expect(isGitCommandOperation('snapshot_file')).toBe(false)
    expect(isGitCommandOperation('restore_file_blob')).toBe(false)
    expect(isGitCommandOperation('pin_object')).toBe(false)
  })
})

describe('describeGitCommand', () => {
  it('returns null for an uncatalogued command', () => {
    expect(describeGitCommand('get_log', { path: '/repo' })).toBeNull()
  })

  it('renders staging operations against the file path', () => {
    expect(lines('stage_file', { path: '/repo', filePath: 'src/app.ts' })).toEqual([
      'git add -- src/app.ts',
    ])
    expect(lines('unstage_file', { filePath: 'src/app.ts' })).toEqual([
      'git restore --staged -- src/app.ts',
    ])
    expect(lines('discard_file_changes', { filePath: 'src/app.ts' })).toEqual([
      'git restore -- src/app.ts',
    ])
  })

  it('quotes only the values that need it, so a path with a space stays runnable', () => {
    expect(lines('stage_file', { filePath: 'my notes.md' })).toEqual([`git add -- 'my notes.md'`])
    // The POSIX way to put a quote inside a quoted string: close, escape, reopen.
    expect(lines('stage_file', { filePath: "it's.md" })).toEqual(["git add -- 'it'\\''s.md'"])
  })

  it('uses a placeholder rather than emitting a command with a hole in it', () => {
    expect(lines('stage_file', {})).toEqual(['git add -- <file>'])
    expect(lines('revert_commit', {})).toEqual(['git revert <commit>'])
  })

  it('renders a commit from its subject line only', () => {
    expect(lines('create_commit', { message: 'feat: add thing\n\nlong body here' })).toEqual([
      `git commit -m 'feat: add thing'`,
    ])
    expect(lines('create_commit', { message: 'fix: oops', amend: true })).toEqual([
      `git commit --amend -m 'fix: oops'`,
    ])
  })

  it('shortens a full oid the way a human would write it', () => {
    expect(lines('cherry_pick_commit', { oid: 'a'.repeat(40) })).toEqual([
      `git cherry-pick ${'a'.repeat(7)}`,
    ])
    // An already-short ref is left alone rather than cut again.
    expect(lines('cherry_pick_commit', { oid: 'HEAD~2' })).toEqual(['git cherry-pick HEAD~2'])
  })

  it('reflects optional flags in the options they map to', () => {
    expect(lines('delete_branch', { name: 'feat/x' })).toEqual(['git branch -d feat/x'])
    expect(lines('delete_branch', { name: 'feat/x', force: true })).toEqual([
      'git branch -D feat/x',
    ])
    expect(lines('fetch_remote', { remote: 'upstream', prune: true })).toEqual([
      'git fetch upstream --prune',
    ])
    expect(lines('push_branch', { force: true })).toEqual(['git push --force origin'])
  })

  it('defaults the remote the way the backend does', () => {
    expect(lines('fetch_remote', {})).toEqual(['git fetch origin'])
  })

  it('renders a remote branch deletion as a delete-refspec push', () => {
    expect(lines('delete_remote_branch', { branchName: 'feat/x', remote: 'upstream' })).toEqual([
      'git push upstream :refs/heads/feat/x',
    ])
    expect(lines('delete_remote_branch', {})).toEqual(['git push origin :refs/heads/<branch>'])
  })

  it('maps each pull strategy to its option, and the default to none', () => {
    expect(lines('pull_branch', { strategy: 'rebase' })).toEqual(['git pull --rebase origin'])
    expect(lines('pull_branch', { strategy: 'fast-forward-only' })).toEqual([
      'git pull --ff-only origin',
    ])
    expect(lines('pull_branch', { strategy: 'fast-forward-if-possible' })).toEqual([
      'git pull origin',
    ])
  })

  it('renders an operation that really is two commands as two lines', () => {
    expect(lines('merge_branch', { source: 'feat/x', target: 'main' })).toEqual([
      'git checkout main',
      'git merge --no-edit feat/x',
    ])
    expect(lines('resolve_conflict_binary', { filePath: 'logo.png', side: 'theirs' })).toEqual([
      'git checkout --theirs -- logo.png',
      'git add -- logo.png',
    ])
  })

  it('names the stash entry an operation targeted, defaulting to the top of the stack', () => {
    expect(lines('stash_apply', { index: 2 })).toEqual(['git stash apply stash@{2}'])
    expect(lines('stash_pop', {})).toEqual(['git stash pop stash@{0}'])
  })

  it('strips credentials embedded in a remote URL', () => {
    // The catalog is what the AI explanation sends to a provider, so a token in a remote URL would
    // otherwise leave the machine.
    expect(
      lines('add_remote', { name: 'origin', url: 'https://me:ghp_secret@github.com/a/b.git' })
    ).toEqual(['git remote add origin https://github.com/a/b.git'])
    expect(lines('clone_repo', { url: 'https://x:y@host/r.git', destPath: '/tmp/r' })).toEqual([
      'git clone https://host/r.git /tmp/r',
    ])
    // An ssh-style remote has no userinfo to strip and must survive untouched.
    expect(lines('add_remote', { name: 'origin', url: 'git@github.com:a/b.git' })).toEqual([
      'git remote add origin git@github.com:a/b.git',
    ])
  })

  it('reflects the clone options the backend actually passes', () => {
    expect(
      lines('clone_repo', { url: 'https://host/r.git', destPath: '/tmp/r', shallow: true })
    ).toEqual(['git clone --depth 1 https://host/r.git /tmp/r'])
  })

  it('renders from an empty bag when the arguments were redacted', () => {
    // Auth-shaped commands have their whole argument object replaced by the string '[redacted]'.
    const described = describeGitCommand('push_branch', '[redacted]')
    expect(described?.lines).toEqual(['git push origin'])
  })

  it('carries a title key and a family for the row to render', () => {
    const described = describeGitCommand('stash_push', { message: 'wip' })
    expect(described?.family).toBe('stash')
    expect(described?.titleKey).toBe('gitCommand.stashPush')
  })
})
