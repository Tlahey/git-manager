import { describe, it, expect } from 'vitest'
import {
  describeArgs,
  hash,
  redactActivityEntry,
  redactPublicStack,
  redactPublicText,
  redactRepoPath,
} from './publicRedact'
import type { ActivityLogEntry } from '../../../stores/activityLog.store'

function entry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: '1',
    timestamp: 1_700_000_000_000,
    command: 'git_status',
    durationMs: 12,
    status: 'ok',
    ...overrides,
  }
}

describe('redactPublicText', () => {
  it('strips a GitHub personal access token wherever it appears', () => {
    const out = redactPublicText('auth failed for ghp_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(out).toBe('auth failed for [github-token]')
  })

  it('strips a fine-grained GitHub token', () => {
    expect(redactPublicText('github_pat_11ABCDEFG0abcdefghij_kLmNoPqRsT')).toBe('[github-token]')
  })

  it('strips an OpenAI-style key and an AWS access key id', () => {
    expect(redactPublicText('key sk-abcdefghijklmnopqrstuvwx')).toBe('key [api-key]')
    expect(redactPublicText('AKIAIOSFODNN7EXAMPLE')).toBe('[aws-key]')
  })

  it('strips a whole PEM private key block, newlines included', () => {
    const pem =
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaA\nmore\n-----END OPENSSH PRIVATE KEY-----'
    expect(redactPublicText(`failed: ${pem}`)).toBe('failed: [private-key]')
  })

  it('strips an authorization header value but keeps the scheme', () => {
    expect(redactPublicText('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9')).toBe(
      'Authorization: Bearer [redacted]'
    )
  })

  it('strips credentials embedded in a remote URL, both with and without a password', () => {
    expect(redactPublicText('https://octocat:ghp_secret1234567890@github.com/o/r')).toContain(
      '[credentials]@github.com'
    )
    expect(redactPublicText('https://octocat@github.com/o/r')).toContain('[credentials]@github.com')
  })

  it('does not re-label an already-redacted credential', () => {
    expect(redactPublicText('https://octocat:pw@github.com/o/r')).not.toContain('[user]')
  })

  it('strips email addresses', () => {
    expect(redactPublicText('committer someone@example.com rejected')).toBe(
      'committer [email] rejected'
    )
  })

  it('keeps a URL host but drops its path, which for a remote is owner/project', () => {
    expect(redactPublicText('cannot reach https://github.com/acme-corp/secret-app.git')).toBe(
      'cannot reach https://github.com/<path>'
    )
  })

  it('collapses an absolute path, including the segments after the home directory', () => {
    expect(redactPublicText('open /Users/antoine/Workspace/acme-client/src/a.ts failed')).toBe(
      'open <path> failed'
    )
  })

  it('collapses a Windows path', () => {
    expect(redactPublicText('open C:\\Users\\antoine\\repo\\a.ts')).toBe('open <path>')
  })

  it('keeps git refs, which are not paths and carry the signal', () => {
    expect(redactPublicText('cannot fast-forward refs/heads/main')).toBe(
      'cannot fast-forward refs/heads/main'
    )
  })

  it('keeps well-known system locations, which identify nobody', () => {
    expect(redactPublicText('no space left on /tmp')).toBe('no space left on /tmp')
  })

  it('collapses a path with a space in it without eating the words that follow', () => {
    expect(redactPublicText('open /Users/me/My Documents/repo/a.ts failed')).toBe(
      'open <path> failed'
    )
  })

  it('passes undefined through so call sites need no guard', () => {
    expect(redactPublicText(undefined)).toBeUndefined()
  })
})

describe('redactPublicStack', () => {
  it('keeps bundle paths and line numbers — the whole value of a crash report', () => {
    const stack = 'at render (tauri://localhost/assets/index-a1b2.js:1:4821)'
    expect(redactPublicStack(stack)).toBe(stack)
  })

  it('replaces the home directory of a dev-build frame but keeps the rest of the frame', () => {
    const out = redactPublicStack('at x (/Users/antoine/Workspace/git-manager/src/App.tsx:12:3)')
    expect(out).toBe('at x (~/Workspace/git-manager/src/App.tsx:12:3)')
  })

  it('still strips secrets', () => {
    expect(redactPublicStack('Error: ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toBe(
      'Error: [github-token]'
    )
  })
})

describe('redactRepoPath', () => {
  it('replaces the path with a pseudonym that never contains the project name', () => {
    const out = redactRepoPath('/Users/antoine/Workspace/acme-client')
    expect(out).toMatch(/^<repo:[0-9a-f]{8}>$/)
    expect(out).not.toContain('acme')
  })

  it('is stable, so two operations on one repository are recognisably the same repository', () => {
    expect(redactRepoPath('/a/b')).toBe(redactRepoPath('/a/b'))
    expect(redactRepoPath('/a/b')).not.toBe(redactRepoPath('/a/c'))
  })
})

describe('hash', () => {
  it('always returns eight hex characters, short inputs included', () => {
    expect(hash('')).toMatch(/^[0-9a-f]{8}$/)
    expect(hash('a')).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('describeArgs', () => {
  it('keeps numbers and booleans, which are signal and identify nobody', () => {
    expect(describeArgs({ limit: 200, force: false })).toBe('limit=200, force=false')
  })

  it('reduces a string to its length — never its content', () => {
    expect(describeArgs({ branch: 'feature/PROJ-4211-billing' })).toBe('branch:string(25)')
  })

  it('keeps only the key of a nested value', () => {
    expect(describeArgs({ opts: { a: 1 } })).toBe('opts')
  })

  it('preserves the marker debugLogRedact leaves on an auth-shaped command', () => {
    expect(describeArgs('[redacted]')).toBe('[redacted]')
  })

  it('returns undefined for no arguments', () => {
    expect(describeArgs(undefined)).toBeUndefined()
    expect(describeArgs({})).toBeUndefined()
  })
})

describe('redactActivityEntry', () => {
  it('keeps the shape of an operation and none of its content', () => {
    const out = redactActivityEntry(
      entry({
        status: 'error',
        error: 'failed at /Users/antoine/Workspace/acme/src/a.ts',
        repoPath: '/Users/antoine/Workspace/acme',
        args: { branch: 'release/v9-acme', limit: 50 },
        correlationLabel: 'git.pull',
      })
    )

    expect(out.command).toBe('git_status')
    expect(out.correlationLabel).toBe('git.pull')
    expect(out.args).toBe('branch:string(15), limit=50')
    expect(out.error).toBe('failed at <path>')
    expect(out.repo).toMatch(/^<repo:[0-9a-f]{8}>$/)
    expect(JSON.stringify(out)).not.toContain('acme')
  })
})
