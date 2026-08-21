import { describe, expect, it } from 'vitest'
import { formatJavaScriptSource, parseJavaScriptSource } from './javascriptSourceParser'

const SOURCE = `let user = { name: "Alice", role: "member" }
const scores = [100, 98]

function rename(obj) {
  obj.name = "Bob"
}

rename(user)
scores[1] = 99`

describe('javascriptSourceParser', () => {
  it('parses variables, functions, calls and source lines', () => {
    const program = parseJavaScriptSource(SOURCE)

    expect(program.diagnostics).toEqual([])
    expect(program.statements.map((item) => item.kind)).toEqual([
      'variable',
      'variable',
      'function',
      'call',
      'assignment'
    ])
    expect(program.functions[0]).toMatchObject({
      name: 'rename',
      params: ['obj'],
      line: 4,
      endLine: 6
    })
    expect(program.functions[0].body).toEqual([
      { kind: 'assignment', target: 'obj.name', expression: '"Bob"', line: 5 }
    ])
    expect(program.executableLines).toEqual([1, 2, 4, 5, 8, 9])
  })

  it('accepts semicolons and ignores line comments outside strings', () => {
    const program = parseJavaScriptSource(`let url = "https://example.test"; // comment
function touch(item) {
  item.url = url;
}
touch({ url: "old" });`)

    expect(program.diagnostics).toEqual([])
    expect(program.functions[0].body[0]).toMatchObject({ line: 3, target: 'item.url' })
  })

  it('reports duplicates and unsupported statements', () => {
    const program = parseJavaScriptSource(`let user = null
let user = {}
function demo(user, user) {
  return user
}`)

    expect(program.diagnostics.map((item) => item.message)).toEqual(expect.arrayContaining([
      '标识符 user 重复声明。',
      '参数 user 重复声明。',
      '第一版暂不支持的语句：return user'
    ]))
  })

  it('formats indentation without changing the simplified source shape', () => {
    expect(formatJavaScriptSource(`function rename(obj) {
obj.name = "Bob";
}
rename(user);`)).toBe(`function rename(obj) {
    obj.name = "Bob"
}
rename(user)`)
  })
})
