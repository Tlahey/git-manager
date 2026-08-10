import { describe, it, expect } from 'vitest'
import { parseRemoteUrl, firstParsedRemote } from './remoteOwner'

describe('parseRemoteUrl', () => {
  it('parses an HTTPS remote', () => {
    expect(parseRemoteUrl('https://github.com/Tlahey/git-manager.git')).toEqual({
      host: 'github.com',
      owner: 'Tlahey',
      repo: 'git-manager',
    })
  })

  it('parses an HTTPS remote without the .git suffix', () => {
    expect(parseRemoteUrl('https://github.com/Tlahey/git-manager')).toEqual({
      host: 'github.com',
      owner: 'Tlahey',
      repo: 'git-manager',
    })
  })

  it('parses the scp-like SSH syntax', () => {
    expect(parseRemoteUrl('git@github.com:Tlahey/git-manager.git')).toEqual({
      host: 'github.com',
      owner: 'Tlahey',
      repo: 'git-manager',
    })
  })

  it('parses an ssh:// URL with a port', () => {
    expect(parseRemoteUrl('ssh://git@gitlab.example.com:2222/team/app.git')).toEqual({
      host: 'gitlab.example.com',
      owner: 'team',
      repo: 'app',
    })
  })

  it('keeps nested GitLab subgroups in the owner', () => {
    expect(parseRemoteUrl('https://gitlab.com/group/subgroup/app.git')).toEqual({
      host: 'gitlab.com',
      owner: 'group/subgroup',
      repo: 'app',
    })
  })

  it('strips HTTP credentials from the host', () => {
    expect(parseRemoteUrl('https://user:token@bitbucket.org/team/app.git')).toEqual({
      host: 'bitbucket.org',
      owner: 'team',
      repo: 'app',
    })
  })

  it('returns null for a local path remote', () => {
    expect(parseRemoteUrl('/srv/git/app.git')).toBeNull()
    expect(parseRemoteUrl('../sibling-repo')).toBeNull()
  })

  it('returns null when there is no owner segment', () => {
    expect(parseRemoteUrl('https://github.com/app.git')).toBeNull()
  })

  it('returns null for empty or blank input', () => {
    expect(parseRemoteUrl('')).toBeNull()
    expect(parseRemoteUrl('   ')).toBeNull()
  })
})

describe('firstParsedRemote', () => {
  it('returns the first URL that parses', () => {
    expect(firstParsedRemote(['/srv/git/app.git', 'git@github.com:Tlahey/app.git'])).toEqual({
      host: 'github.com',
      owner: 'Tlahey',
      repo: 'app',
    })
  })

  it('returns null when nothing parses', () => {
    expect(firstParsedRemote(['/srv/git/app.git'])).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(firstParsedRemote([])).toBeNull()
  })
})
