import { beforeEach, describe, expect, it } from 'vitest'
import { executeGitCommand, getGitState, resetGitEnvironment } from './gitSimulator'

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
})
