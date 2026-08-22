import type { JvmGcStats, JvmStackFrame, JvmState, JvmThread, JvmValue } from '@/types'

export const JVM_CAPACITIES = {
  methodArea: 256,
  heap: 512,
  stackPerThread: 128
} as const

export function createInitialJvmState(): JvmState {
  const mainThread: JvmThread = { id: 't1', name: 'main', frames: [] }
  return {
    capacities: { ...JVM_CAPACITIES },
    methodArea: { classes: {} },
    heap: { entries: {} },
    threads: { [mainThread.id]: mainThread },
    activeThreadId: mainThread.id,
    counters: { thread: 2, frame: 1, object: 1, array: 1, gc: 1 },
    lastGc: null
  }
}

export function cloneJvmState(state: JvmState): JvmState {
  return JSON.parse(JSON.stringify(state)) as JvmState
}

export function getJvmUsage(state: JvmState) {
  const methodArea = Object.values(state.methodArea.classes).reduce((total, item) => total + item.size, 0)
  const heap = Object.values(state.heap.entries).reduce((total, item) => total + item.size, 0)
  const stacks = Object.fromEntries(
    Object.values(state.threads).map((thread) => [
      thread.id,
      thread.frames.reduce((total, frame) => total + frame.size, 0)
    ])
  )
  return { methodArea, heap, stacks }
}

export function formatJvmValue(value: JvmValue): string {
  if (value.kind === 'string') return JSON.stringify(value.value)
  if (value.kind === 'null') return 'null'
  return String(value.value)
}

export function collectJvmGarbage(state: JvmState, trigger: JvmGcStats['trigger']): JvmGcStats {
  const entries = state.heap.entries
  const marked = new Set<string>()
  const pending: string[] = []

  const enqueue = (value: JvmValue) => {
    if (value.kind === 'reference' && entries[value.value] && !marked.has(value.value)) {
      pending.push(value.value)
    }
  }

  for (const classInfo of Object.values(state.methodArea.classes)) {
    Object.values(classInfo.staticVariables).forEach(enqueue)
  }
  for (const thread of Object.values(state.threads)) {
    for (const frame of thread.frames) {
      Object.values(frame.localVariables).forEach(enqueue)
      frame.operandStack.forEach(enqueue)
    }
  }

  while (pending.length) {
    const id = pending.pop()!
    if (marked.has(id)) continue
    const entry = entries[id]
    if (!entry) continue
    marked.add(id)
    if (entry.kind === 'object') Object.values(entry.fields).forEach(enqueue)
    if (entry.kind === 'array' && entry.elementType === 'ref') entry.elements.forEach(enqueue)
  }

  const ids = Object.keys(entries)
  let freed = 0
  let collected = 0
  for (const id of ids) {
    if (marked.has(id)) continue
    freed += entries[id].size
    collected++
    delete entries[id]
  }

  const stats: JvmGcStats = {
    run: state.counters.gc,
    trigger,
    scanned: ids.length,
    survived: marked.size,
    collected,
    freed
  }
  state.counters.gc++
  state.lastGc = stats
  return stats
}

export function ensureJvmHeapCapacity(
  state: JvmState,
  size: number
): { ok: true; gc: JvmGcStats | null } | { ok: false; message: string; gc: JvmGcStats } {
  const used = getJvmUsage(state).heap
  if (used + size <= state.capacities.heap) return { ok: true, gc: null }

  const gc = collectJvmGarbage(state, 'allocation')
  const afterGc = getJvmUsage(state).heap
  if (afterGc + size <= state.capacities.heap) return { ok: true, gc }
  return {
    ok: false,
    gc,
    message: `OutOfMemoryError: Java heap space（需要 ${size}，GC 后剩余 ${state.capacities.heap - afterGc}）`
  }
}

export function createStackFrame(state: JvmState, className: string, methodName: string, size = 12): JvmStackFrame {
  const frame: JvmStackFrame = {
    id: `f${state.counters.frame}`,
    className,
    methodName,
    size,
    localVariables: {},
    operandStack: []
  }
  state.counters.frame++
  return frame
}
