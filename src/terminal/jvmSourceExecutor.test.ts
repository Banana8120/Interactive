import { describe, expect, it } from 'vitest'
import { executeJvmSource } from './jvmSourceExecutor'
import { parseJvmSource } from './jvmSourceParser'

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
    User.current = user;
    thread worker {
      User copy = new User();
    }
    gc();
  }
}`

function execute(source: string, line = 999) {
  return executeJvmSource(parseJvmSource(source), line)
}

describe('jvmSourceExecutor', () => {
  it('maps classes, constants, statics, locals, objects and arrays into JVM regions', () => {
    const result = execute(SOURCE, 13)
    const state = result.state

    expect(result.diagnostics).toEqual([])
    expect(state.methodArea.classes.User.constants.TYPE).toEqual({ kind: 'string', value: 'member' })
    expect(state.methodArea.classes.User.staticVariables.current).toEqual({ kind: 'reference', value: '@o1' })
    expect(state.threads.t1.frames[0].localVariables).toMatchObject({
      user: { kind: 'reference', value: '@o1' },
      scores: { kind: 'reference', value: '@a1' }
    })
    expect(state.heap.entries['@o1']).toMatchObject({
      kind: 'object',
      className: 'User',
      fields: { id: { kind: 'number', value: 1 }, name: { kind: 'null', value: null } }
    })
    expect(state.heap.entries['@a1']).toMatchObject({
      kind: 'array',
      elements: [
        { kind: 'number', value: 100 },
        { kind: 'number', value: 0 },
        { kind: 'number', value: 0 }
      ]
    })
  })

  it('changes the snapshot at the cursor line without leaking later allocations', () => {
    const before = execute(SOURCE, 8)
    const afterObject = execute(SOURCE, 9)
    const afterArray = execute(SOURCE, 11)

    expect(Object.keys(before.state.heap.entries)).toEqual([])
    expect(Object.keys(afterObject.state.heap.entries)).toEqual(['@o1'])
    expect(Object.keys(afterArray.state.heap.entries)).toEqual(['@o1', '@a1'])
  })

  it('keeps thread stacks isolated while sharing the heap', () => {
    const inside = execute(SOURCE, 15)
    const after = execute(SOURCE, 16)

    expect(Object.values(inside.state.threads).map((thread) => thread.name)).toEqual(['main', 'worker'])
    expect(inside.state.threads.t1.frames[0].localVariables.user).toEqual({ kind: 'reference', value: '@o1' })
    expect(inside.state.threads.t2.frames[0].localVariables.copy).toEqual({ kind: 'reference', value: '@o2' })
    expect(inside.state.activeThreadId).toBe('t2')
    expect(after.state.threads.t2.frames).toEqual([])
    expect(after.state.activeThreadId).toBe('t1')
    expect(after.state.heap.entries['@o2']).toBeDefined()
  })

  it('removes worker-only roots and collects their objects after the block', () => {
    const result = execute(SOURCE, 17)

    expect(result.state.heap.entries['@o1']).toBeDefined()
    expect(result.state.heap.entries['@o2']).toBeUndefined()
    expect(result.state.lastGc).toMatchObject({ trigger: 'manual', collected: 1, survived: 2 })
  })

  it('collects unreachable object cycles with mark-sweep GC', () => {
    const result = execute(`class Node {
  Node next;
}
class Main {
  static void main() {
    Node a = new Node();
    Node b = new Node();
    a.next = b;
    b.next = a;
    a = null;
    b = null;
    gc();
  }
}`)

    expect(result.diagnostics).toEqual([])
    expect(result.state.heap.entries).toEqual({})
    expect(result.state.lastGc).toMatchObject({ scanned: 2, survived: 0, collected: 2 })
  })

  it('stops before a type error and leaves the failing statement atomic', () => {
    const result = execute(`class User {
  int id;
}
class Main {
  static void main() {
    User user = new User();
    user.id = "wrong";
  }
}`)

    expect(result.status).toBe('error')
    expect(result.diagnostics[0]).toMatchObject({ stage: 'type', line: 7 })
    expect(result.stoppedLine).toBe(6)
    expect(result.state.heap.entries['@o1']).toMatchObject({
      fields: { id: { kind: 'number', value: 0 } }
    })
  })

  it('rolls back an allocation that remains too large after automatic GC', () => {
    const result = execute(`class Main {
  static void main() {
    int[] huge = new int[200];
  }
}`)

    expect(result.status).toBe('error')
    expect(result.diagnostics[0].message).toContain('OutOfMemoryError: Java heap space')
    expect(result.state.heap.entries).toEqual({})
    expect(result.state.counters.array).toBe(1)
    expect(result.state.lastGc).toBeNull()
    expect(result.state.threads.t1.frames[0].localVariables).toEqual({})
  })

  it('does not allow a worker thread to read main stack locals', () => {
    const result = execute(`class User {}
class Main {
  static void main() {
    User user = new User();
    thread worker {
      User copy = user;
    }
  }
}`)

    expect(result.status).toBe('error')
    expect(result.diagnostics[0]).toMatchObject({ stage: 'syntax', line: 6 })
    expect(result.diagnostics[0].message).toContain('不支持的表达式')
    expect(result.state.threads.t1.frames[0].localVariables.user).toBeDefined()
    expect(result.state.threads.t2.frames[0].localVariables).toEqual({})
  })
})
