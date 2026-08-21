import { describe, expect, it } from 'vitest'
import { executeJavaScriptSource } from './javascriptSourceExecutor'
import { parseJavaScriptSource } from './javascriptSourceParser'

const SOURCE = `let user = { name: "Alice", role: "member" }
const scores = [100, 98]

function rename(obj) {
  obj.name = "Bob"
}

rename(user)
scores[1] = 99`

function execute(source: string, line = 999) {
  return executeJavaScriptSource(parseJavaScriptSource(source), line)
}

describe('javascriptSourceExecutor', () => {
  it('maps variables, functions, arrays and objects into JS execution memory', () => {
    const result = execute(SOURCE)
    const state = result.state

    expect(result.diagnostics).toEqual([])
    expect(state.callStack).toHaveLength(1)
    expect(state.scopes.s1.bindings.user.value).toEqual({ kind: 'reference', value: '@o1' })
    expect(state.scopes.s1.bindings.scores.value).toEqual({ kind: 'reference', value: '@a1' })
    expect(state.scopes.s1.bindings.rename.value).toEqual({ kind: 'reference', value: '@f1' })
    expect(state.heap.entries['@o1']).toMatchObject({
      kind: 'object',
      properties: {
        name: { kind: 'string', value: 'Bob' },
        role: { kind: 'string', value: 'member' }
      }
    })
    expect(state.heap.entries['@a1']).toMatchObject({
      kind: 'array',
      elements: [
        { kind: 'number', value: 100 },
        { kind: 'number', value: 99 }
      ]
    })
  })

  it('pauses inside a function body with a live function scope', () => {
    const result = execute(SOURCE, 5)
    const state = result.state
    const activeFrame = state.callStack.at(-1)!
    const functionScope = state.scopes[activeFrame.scopeIds[0]]

    expect(result.status).toBe('paused')
    expect(result.stoppedLine).toBe(5)
    expect(state.callStack.map((item) => item.name)).toEqual(['global()', 'rename()'])
    expect(functionScope.bindings.obj.value).toEqual({ kind: 'reference', value: '@o1' })
    expect(state.heap.entries['@o1']).toMatchObject({
      kind: 'object',
      properties: { name: { kind: 'string', value: 'Bob' } }
    })
  })

  it('changes snapshots by target line without leaking future allocations', () => {
    const afterObject = execute(SOURCE, 1)
    const afterArray = execute(SOURCE, 2)
    const afterFunction = execute(SOURCE, 4)

    expect(Object.keys(afterObject.state.heap.entries)).toEqual(['@o1'])
    expect(Object.keys(afterArray.state.heap.entries)).toEqual(['@o1', '@a1'])
    expect(Object.keys(afterFunction.state.heap.entries)).toEqual(['@o1', '@a1', '@f1'])
  })

  it('keeps object arguments as references and records reference edges', () => {
    const result = execute(`let user = { name: "Alice" }
let holder = { current: user }`)

    expect(result.state.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromKind: 'scope', slot: 'user', toId: '@o1' }),
      expect.objectContaining({ fromKind: 'scope', slot: 'holder', toId: '@o2' }),
      expect.objectContaining({ fromKind: 'heap', fromId: '@o2', slot: 'current', toId: '@o1' })
    ]))
  })

  it('stops before const reassignment and leaves the failing statement atomic', () => {
    const result = execute(`const count = 1
count = 2`)

    expect(result.status).toBe('error')
    expect(result.diagnostics[0]).toMatchObject({ stage: 'type', line: 2 })
    expect(result.state.scopes.s1.bindings.count.value).toEqual({ kind: 'number', value: 1 })
  })

  it('reports invalid property writes on primitive values', () => {
    const result = execute(`let name = "Alice"
name.first = "A"`)

    expect(result.status).toBe('error')
    expect(result.diagnostics[0].message).toBe('name 不是对象或数组引用。')
    expect(result.state.heap.entries).toEqual({})
  })

  it('reports a function body line that has no call path', () => {
    const result = execute(`function rename(obj) {
  obj.name = "Bob"
}
let user = { name: "Alice" }`, 2)

    expect(result.status).toBe('error')
    expect(result.diagnostics[0].message).toContain('没有找到调用 rename()')
  })
})
