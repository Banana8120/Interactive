import { describe, expect, it } from 'vitest'
import { formatJvmSource, parseJvmSource } from './jvmSourceParser'

const SOURCE = `class User {
  static final String TYPE = "member";
  static User current;
  int id;
  String name;
}

class Main {
  static void main() {
    User user = new User();
    user.id = 1;
    int[] scores = new int[3];
    scores[0] = 100;
    thread worker {
      User copy = new User();
    }
    gc();
  }
}`

describe('jvmSourceParser', () => {
  it('parses classes, fields, main statements and a thread block with source lines', () => {
    const program = parseJvmSource(SOURCE)

    expect(program.diagnostics).toEqual([])
    expect(program.classes).toHaveLength(2)
    expect(program.classes[0]).toMatchObject({
      name: 'User',
      fields: [
        { name: 'TYPE', isStatic: true, isFinal: true, line: 2 },
        { name: 'current', isStatic: true, isFinal: false, line: 3 },
        { name: 'id', isStatic: false, line: 4 },
        { name: 'name', isStatic: false, line: 5 }
      ]
    })
    expect(program.main).toMatchObject({ className: 'Main', line: 9, endLine: 18 })
    expect(program.main?.statements.map((item) => item.kind)).toEqual([
      'variable', 'assignment', 'variable', 'assignment', 'thread', 'gc'
    ])
    expect(program.main?.statements[4]).toMatchObject({
      kind: 'thread',
      name: 'worker',
      line: 14,
      endLine: 16
    })
    expect(program.executableLines).toEqual([10, 11, 12, 13, 14, 15, 17])
  })

  it('accepts public main with String args and braces on separate lines', () => {
    const program = parseJvmSource(`public class Main
{
  public static void main(String[] args)
  {
    int count = 1;
  }
}`)

    expect(program.diagnostics).toEqual([])
    expect(program.main?.statements[0]).toMatchObject({ kind: 'variable', name: 'count', line: 5 })
  })

  it('reports duplicate names, unknown types and unsupported statements', () => {
    const program = parseJvmSource(`class Main {
  Missing item;
  int value;
  int value;
  static void main() {
    if (true) value = 1;
  }
}`)

    expect(program.diagnostics.map((item) => item.message)).toEqual(expect.arrayContaining([
      '未知类型：Missing',
      '字段 Main.value 重复声明。',
      '不支持的语句：if (true) value = 1'
    ]))
  })

  it('reports missing semicolons, unmatched braces and incomplete blocks', () => {
    const program = parseJvmSource(`class Main {
  static void main() {
    int value = 1
  }
}}`)

    expect(program.diagnostics.some((item) => item.message.includes('缺少分号'))).toBe(true)
    expect(program.diagnostics.some((item) => item.message.includes('多余的右花括号'))).toBe(true)
  })

  it('formats indentation without changing statements', () => {
    expect(formatJvmSource(`class Main {
static void main() {
int value = 1;
}
}`)).toBe(`class Main {
    static void main() {
        int value = 1;
    }
}`)
  })
})
