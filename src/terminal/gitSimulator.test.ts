import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeGitCommand, getGitState, loadGitState, resetGitEnvironment, saveGitState } from './gitSimulator'

const storageValues = new Map<string, string>()
const workspaceId = 'git-playground'
const storageKey = `git-sim-state-v1-${workspaceId}`

function stubLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key)
  })
}

function git(input: string) {
  return executeGitCommand(input)
}

function output(input: string) {
  return git(input).lines.join('\n')
}

function resetGitForTest() {
  const state = resetGitEnvironment()
  state.config.user.name = ''
  state.config.user.email = ''
  return state
}

function initWithIdentity() {
  git('git init')
  git('git config --global user.name Alice')
  git('git config --global user.email alice@example.com')
}

function commitAll(message: string) {
  git('git add .')
  git(`git commit -m ${message}`)
}

describe('git simulator regression coverage', () => {
  beforeEach(() => {
    resetGitForTest()
    storageValues.clear()
    stubLocalStorage()
  })

  it('initializes a repository, stages files and creates an initial commit', () => {
    expect(output('git init')).toContain('Initialized empty Git repository')
    git('git config --global user.name Alice')
    git('git config --global user.email alice@example.com')
    expect(output('git status')).toContain('No commits yet')

    git('git add .')
    const commitOutput = output('git commit -m initial')
    const state = getGitState()
    const headHash = state.branches.master

    expect(commitOutput).toContain('[master')
    expect(headHash).toBeTruthy()
    expect(Object.keys(state.commits)).toHaveLength(1)
    expect(state.commits[headHash!]).toMatchObject({
      msg: 'initial',
      author: 'Alice',
      email: 'alice@example.com'
    })
    expect(state.staged).toEqual({})
  })

  it('creates and checks out a branch', () => {
    initWithIdentity()
    commitAll('initial')

    const masterHead = getGitState().branches.master
    expect(output('git branch feature')).toContain('已创建分支 feature')
    expect(output('git checkout feature')).toContain('已切换到分支 feature')

    const state = getGitState()
    expect(state.head).toBe('feature')
    expect(state.branches.feature).toBe(masterHead)
    expect(output('git branch')).toContain('* feature')
  })

  it('fast-forwards current branch when merging a descendant branch', () => {
    initWithIdentity()
    commitAll('initial')
    git('git checkout -b feature')
    output('echo feature > feature.txt')
    commitAll('feature')

    const featureHead = getGitState().branches.feature
    git('git checkout master')
    const mergeOutput = output('git merge feature')
    const state = getGitState()

    expect(mergeOutput).toContain('Fast-forward')
    expect(state.head).toBe('master')
    expect(state.branches.master).toBe(featureHead)
    expect(state.workdir['feature.txt']).toBe('feature\n')
  })

  it('resetGitEnvironment clears repository data while leaving a fresh workdir', () => {
    initWithIdentity()
    commitAll('initial')

    const state = resetGitForTest()

    expect(state.initialized).toBe(false)
    expect(state.branches).toEqual({ master: null })
    expect(state.commits).toEqual({})
    expect(state.staged).toEqual({})
    expect(Object.keys(state.workdir).sort()).toEqual(['README.md', 'app.js', 'index.html'])
  })

  it('saves Git state with a schema version wrapper', () => {
    initWithIdentity()
    commitAll('initial')

    expect(saveGitState(workspaceId)).toBe(true)

    const saved = JSON.parse(storageValues.get(storageKey)!)
    expect(saved.schemaVersion).toBe(1)
    expect(saved.state.initialized).toBe(true)
    expect(saved.state.branches.master).toBeTruthy()
  })

  it('loads legacy unversioned Git state and normalizes missing fields', () => {
    storageValues.set(
      storageKey,
      JSON.stringify({
        initialized: true,
        branches: { main: 'abc1234' },
        head: 'main',
        commits: {
          abc1234: {
            hash: 'abc1234',
            msg: 'legacy',
            parent: null,
            files: { 'README.md': 'legacy\n' },
            author: 'Ada',
            email: 'ada@example.com',
            date: 'Jan 01 00:00'
          }
        },
        workdir: { 'README.md': 'legacy\n' }
      })
    )

    expect(loadGitState(workspaceId)).toBe(true)

    const state = getGitState()
    expect(state.initialized).toBe(true)
    expect(state.head).toBe('main')
    expect(state.branches).toMatchObject({ main: 'abc1234', master: null })
    expect(state.config.user).toEqual({ name: '', email: '' })
    expect(state.staged).toEqual({})
    expect(state.reflog).toEqual([])
  })

  it('keeps current Git state when cached JSON is invalid', () => {
    initWithIdentity()
    commitAll('initial')
    const before = getGitState().branches.master
    storageValues.set(storageKey, '{broken')

    expect(loadGitState(workspaceId)).toBe(false)
    expect(getGitState().branches.master).toBe(before)
  })

  it('rejects unsupported Git state schema versions', () => {
    initWithIdentity()
    commitAll('initial')
    const before = getGitState().branches.master
    storageValues.set(
      storageKey,
      JSON.stringify({
        schemaVersion: 999,
        state: { initialized: false, branches: { future: 'abc1234' } }
      })
    )

    expect(loadGitState(workspaceId)).toBe(false)
    expect(getGitState().branches.master).toBe(before)
  })
})
