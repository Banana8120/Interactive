import type {
  JavaScriptHeapArray,
  JavaScriptHeapFunction,
  JavaScriptHeapObject,
  JavaScriptReferenceEdge,
  JavaScriptScopeRecord,
  JavaScriptState,
  JavaScriptValue
} from '@/types'

export function createInitialJavaScriptState(): JavaScriptState {
  const globalScope: JavaScriptScopeRecord = {
    id: 's1',
    kind: 'global',
    name: 'Global Scope',
    bindings: {}
  }

  return {
    callStack: [
      {
        id: 'c1',
        kind: 'global',
        name: 'global()',
        line: 1,
        activeLine: 1,
        scopeIds: [globalScope.id]
      }
    ],
    scopes: {
      [globalScope.id]: globalScope
    },
    heap: {
      entries: {}
    },
    activeContextId: 'c1',
    counters: {
      context: 2,
      scope: 2,
      object: 1,
      array: 1,
      function: 1
    },
    references: []
  }
}

export function allocateJavaScriptObject(
  state: JavaScriptState,
  properties: Record<string, JavaScriptValue>,
  label = 'Object'
): JavaScriptValue {
  const id = `@o${state.counters.object}`
  state.counters.object++
  const entry: JavaScriptHeapObject = {
    kind: 'object',
    id,
    label,
    size: 4 + Object.keys(properties).length,
    properties: cloneValueRecord(properties)
  }
  state.heap.entries[id] = entry
  return { kind: 'reference', value: id }
}

export function allocateJavaScriptArray(
  state: JavaScriptState,
  elements: JavaScriptValue[],
  label = 'Array'
): JavaScriptValue {
  const id = `@a${state.counters.array}`
  state.counters.array++
  const entry: JavaScriptHeapArray = {
    kind: 'array',
    id,
    label,
    size: 3 + elements.length,
    elements: elements.map(cloneJavaScriptValue),
    properties: {}
  }
  state.heap.entries[id] = entry
  return { kind: 'reference', value: id }
}

export function allocateJavaScriptFunction(
  state: JavaScriptState,
  name: string,
  params: string[],
  line: number,
  closureScopeIds: string[]
): JavaScriptValue {
  const id = `@f${state.counters.function}`
  state.counters.function++
  const entry: JavaScriptHeapFunction = {
    kind: 'function',
    id,
    name,
    params: [...params],
    line,
    size: 6 + params.length,
    closureScopeIds: [...closureScopeIds]
  }
  state.heap.entries[id] = entry
  return { kind: 'reference', value: id }
}

export function cloneJavaScriptValue(value: JavaScriptValue): JavaScriptValue {
  return { ...value } as JavaScriptValue
}

export function cloneJavaScriptState(state: JavaScriptState): JavaScriptState {
  return JSON.parse(JSON.stringify(state)) as JavaScriptState
}

export function cloneValueRecord(record: Record<string, JavaScriptValue>) {
  return Object.fromEntries(
    Object.entries(record).map(([name, value]) => [name, cloneJavaScriptValue(value)])
  )
}

export function updateJavaScriptReferences(state: JavaScriptState) {
  state.references = collectJavaScriptReferences(state)
}

export function collectJavaScriptReferences(state: JavaScriptState): JavaScriptReferenceEdge[] {
  const edges: JavaScriptReferenceEdge[] = []

  for (const scope of Object.values(state.scopes)) {
    for (const binding of Object.values(scope.bindings)) {
      if (binding.value.kind !== 'reference') continue
      if (!state.heap.entries[binding.value.value]) continue
      edges.push({
        fromKind: 'scope',
        fromId: scope.id,
        fromLabel: scope.name,
        slot: binding.name,
        toId: binding.value.value
      })
    }
  }

  for (const entry of Object.values(state.heap.entries)) {
    if (entry.kind === 'object') {
      for (const [name, value] of Object.entries(entry.properties)) {
        pushHeapReference(edges, state, entry.id, entry.label, name, value)
      }
    }

    if (entry.kind === 'array') {
      entry.elements.forEach((value, index) => {
        pushHeapReference(edges, state, entry.id, entry.label, `[${index}]`, value)
      })
      for (const [name, value] of Object.entries(entry.properties)) {
        pushHeapReference(edges, state, entry.id, entry.label, name, value)
      }
    }
  }

  return edges
}

function pushHeapReference(
  edges: JavaScriptReferenceEdge[],
  state: JavaScriptState,
  fromId: string,
  fromLabel: string,
  slot: string,
  value: JavaScriptValue
) {
  if (value.kind !== 'reference') return
  if (!state.heap.entries[value.value]) return
  edges.push({
    fromKind: 'heap',
    fromId,
    fromLabel,
    slot,
    toId: value.value
  })
}

export function formatJavaScriptValue(value: JavaScriptValue): string {
  if (value.kind === 'string') return `"${value.value}"`
  if (value.kind === 'undefined') return 'undefined'
  if (value.kind === 'null') return 'null'
  if (value.kind === 'reference') return value.value
  return String(value.value)
}

export function undefinedJavaScriptValue(): JavaScriptValue {
  return { kind: 'undefined', value: null }
}
