import type {
  JavaScriptBinding,
  JavaScriptHeapArray,
  JavaScriptHeapEntry,
  JavaScriptHeapFunction,
  JavaScriptHeapObject,
  JavaScriptScopeRecord,
  JavaScriptState,
  JavaScriptValue
} from '@/types'
import {
  allocateJavaScriptArray,
  allocateJavaScriptFunction,
  allocateJavaScriptObject,
  cloneJavaScriptState,
  cloneJavaScriptValue,
  createInitialJavaScriptState,
  undefinedJavaScriptValue,
  updateJavaScriptReferences
} from './javascriptMemoryModel'
import type {
  JavaScriptAssignmentStatement,
  JavaScriptCallStatement,
  JavaScriptExecutableStatement,
  JavaScriptFunctionDeclaration,
  JavaScriptSourceDiagnostic,
  JavaScriptSourceProgram,
  JavaScriptSourceStatement,
  JavaScriptVariableStatement
} from './javascriptSourceParser'
import { splitTopLevel } from './javascriptSourceParser'

export type JavaScriptExecutionStatus = 'paused' | 'completed' | 'error'

export interface JavaScriptSourceExecutionResult {
  state: JavaScriptState
  diagnostics: JavaScriptSourceDiagnostic[]
  targetLine: number
  stoppedLine: number
  status: JavaScriptExecutionStatus
  message: string
}

interface Runtime {
  state: JavaScriptState
  program: JavaScriptSourceProgram
  functions: Map<string, JavaScriptFunctionDeclaration>
  diagnostics: JavaScriptSourceDiagnostic[]
  stoppedLine: number
  pausedInsideFunction: boolean
}

interface BindingLookup {
  scope: JavaScriptScopeRecord
  binding: JavaScriptBinding
}

const IDENTIFIER = '[A-Za-z_$][\\w$]*'
const IDENTIFIER_ONLY = new RegExp(`^${IDENTIFIER}$`)

export function executeJavaScriptSource(
  program: JavaScriptSourceProgram,
  requestedTargetLine: number
): JavaScriptSourceExecutionResult {
  const targetLine = Math.max(1, Math.min(program.lineCount, Math.floor(requestedTargetLine || 1)))
  const targetFunction = program.functions.find((item) => targetLine > item.line && targetLine < item.endLine) || null
  const blockingParseError = program.diagnostics.find((item) => item.line <= targetLine)
  const runtime: Runtime = {
    state: createInitialJavaScriptState(),
    program,
    functions: new Map(program.functions.map((item) => [item.name, item])),
    diagnostics: [],
    stoppedLine: 1,
    pausedInsideFunction: false
  }

  if (!blockingParseError) {
    executeStatements(runtime, program.statements, targetLine, {
      runPastTargetUntilFunction: targetFunction
    })
    if (targetFunction && !runtime.pausedInsideFunction && !runtime.diagnostics.length) {
      runtime.diagnostics.push({
        stage: 'runtime',
        line: targetLine,
        message: `没有找到调用 ${targetFunction.name}() 并进入第 ${targetLine} 行的执行路径。`
      })
    }
  }

  updateJavaScriptReferences(runtime.state)
  const diagnostics = [...program.diagnostics, ...runtime.diagnostics].sort((a, b) => a.line - b.line)
  const hasReachedError = Boolean(blockingParseError) || diagnostics.some((item) => item.line <= targetLine)
  const lastExecutableLine = program.executableLines.at(-1) || 1
  const status: JavaScriptExecutionStatus = hasReachedError
    ? 'error'
    : targetLine >= lastExecutableLine && !runtime.pausedInsideFunction
      ? 'completed'
      : 'paused'

  return {
    state: cloneJavaScriptState(runtime.state),
    diagnostics,
    targetLine,
    stoppedLine: runtime.stoppedLine,
    status,
    message:
      status === 'error'
        ? `执行在第 ${firstReachedDiagnosticLine(diagnostics, targetLine)} 行前停止`
        : runtime.pausedInsideFunction
          ? `已进入函数并执行到第 ${runtime.stoppedLine} 行`
          : status === 'completed'
            ? '已执行到最后一条语句'
            : `已执行到第 ${runtime.stoppedLine || targetLine} 行`
  }
}

function executeStatements(
  runtime: Runtime,
  statements: JavaScriptSourceStatement[],
  targetLine: number,
  options: { runPastTargetUntilFunction: JavaScriptFunctionDeclaration | null }
): boolean {
  const runPastTarget = Boolean(options.runPastTargetUntilFunction)

  for (const statement of statements) {
    if (!runPastTarget && statement.line > targetLine) return true

    if (statement.kind === 'function') {
      if (!runPastTarget && statement.line > targetLine) return true
      if (!executeAtomic(runtime, statement, () => executeFunctionDeclaration(runtime, statement))) return false
      if (!runPastTarget && statement.line >= targetLine) return true
      continue
    }

    if (runPastTarget && statement.kind === 'call' && statement.callee === options.runPastTargetUntilFunction?.name) {
      const executed = executeCall(runtime, statement, targetLine)
      return executed && runtime.pausedInsideFunction
    }

    if (!executeAtomic(runtime, statement, () => executeExecutableStatement(runtime, statement))) return false
    if (!runPastTarget && statement.line >= targetLine) return true
  }

  return true
}

function executeFunctionBody(
  runtime: Runtime,
  statements: JavaScriptExecutableStatement[],
  targetLine: number | null
): boolean {
  for (const statement of statements) {
    if (targetLine !== null && statement.line > targetLine) {
      runtime.pausedInsideFunction = true
      return true
    }

    const ok =
      statement.kind === 'call'
        ? executeCall(runtime, statement, null)
        : executeAtomic(runtime, statement, () => executeExecutableStatement(runtime, statement))
    if (!ok) return false

    if (targetLine !== null && statement.line >= targetLine) {
      runtime.pausedInsideFunction = true
      return true
    }
  }

  if (targetLine !== null) runtime.pausedInsideFunction = true
  return true
}

function executeAtomic(
  runtime: Runtime,
  statement: JavaScriptSourceStatement,
  action: () => JavaScriptSourceDiagnostic | null
) {
  const stateBefore = cloneJavaScriptState(runtime.state)
  const diagnosticCountBefore = runtime.diagnostics.length
  const diagnostic = action()
  if (!diagnostic) {
    markActiveLine(runtime, statement.line)
    return true
  }
  runtime.state = stateBefore
  runtime.diagnostics.splice(diagnosticCountBefore)
  runtime.diagnostics.push(diagnostic)
  return false
}

function executeExecutableStatement(runtime: Runtime, statement: JavaScriptExecutableStatement) {
  if (statement.kind === 'variable') return executeVariableDeclaration(runtime, statement)
  if (statement.kind === 'assignment') return executeAssignment(runtime, statement)
  return executeCall(runtime, statement, null) ? null : runtime.diagnostics.at(-1) || null
}

function executeFunctionDeclaration(
  runtime: Runtime,
  statement: JavaScriptFunctionDeclaration
): JavaScriptSourceDiagnostic | null {
  const scope = currentScope(runtime)
  if (!scope) return diagnostic('runtime', statement.line, '当前作用域不存在。')
  if (scope.bindings[statement.name]) {
    return diagnostic('name', statement.line, `标识符 ${statement.name} 已声明。`)
  }
  const value = allocateJavaScriptFunction(
    runtime.state,
    statement.name,
    statement.params,
    statement.line,
    currentScopeIds(runtime)
  )
  defineBinding(scope, statement.name, 'function', value, false, statement.line)
  return null
}

function executeVariableDeclaration(
  runtime: Runtime,
  statement: JavaScriptVariableStatement
): JavaScriptSourceDiagnostic | null {
  const scope = currentScope(runtime)
  if (!scope) return diagnostic('runtime', statement.line, '当前作用域不存在。')
  if (scope.bindings[statement.name]) {
    return diagnostic('name', statement.line, `标识符 ${statement.name} 已声明。`)
  }
  if (statement.declaration === 'const' && !statement.initializer) {
    return diagnostic('syntax', statement.line, `const ${statement.name} 必须初始化。`)
  }

  const value = statement.initializer
    ? evaluateExpression(runtime, statement.initializer, statement.line)
    : undefinedJavaScriptValue()
  if ('diagnostic' in value) return value.diagnostic

  defineBinding(
    scope,
    statement.name,
    statement.declaration,
    cloneJavaScriptValue(value),
    statement.declaration !== 'const',
    statement.line
  )
  return null
}

function executeAssignment(
  runtime: Runtime,
  statement: JavaScriptAssignmentStatement
): JavaScriptSourceDiagnostic | null {
  const value = evaluateExpression(runtime, statement.expression, statement.line)
  if ('diagnostic' in value) return value.diagnostic

  const property = statement.target.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/)
  if (property) return assignProperty(runtime, property[1], property[2], value, statement.line)

  const arrayItem = statement.target.match(/^([A-Za-z_$][\w$]*)\[\s*(\d+)\s*\]$/)
  if (arrayItem) return assignArrayItem(runtime, arrayItem[1], Number(arrayItem[2]), value, statement.line)

  const lookup = lookupBinding(runtime, statement.target)
  if (!lookup) return diagnostic('name', statement.line, `变量 ${statement.target} 未声明。`)
  if (!lookup.binding.mutable) return diagnostic('type', statement.line, `${statement.target} 是 const，不能重新赋值。`)
  lookup.binding.value = cloneJavaScriptValue(value)
  return null
}

function executeCall(runtime: Runtime, statement: JavaScriptCallStatement, bodyTargetLine: number | null) {
  const callee = lookupBinding(runtime, statement.callee)
  if (!callee) {
    runtime.diagnostics.push(diagnostic('name', statement.line, `函数 ${statement.callee} 未声明。`))
    return false
  }
  if (callee.binding.value.kind !== 'reference') {
    runtime.diagnostics.push(diagnostic('type', statement.line, `${statement.callee} 不是函数。`))
    return false
  }

  const entry = runtime.state.heap.entries[callee.binding.value.value]
  if (!entry || entry.kind !== 'function') {
    runtime.diagnostics.push(diagnostic('type', statement.line, `${statement.callee} 不是函数。`))
    return false
  }
  const functionNode = runtime.functions.get(entry.name)
  if (!functionNode) {
    runtime.diagnostics.push(diagnostic('runtime', statement.line, `函数 ${entry.name} 的源码不存在。`))
    return false
  }

  const args = statement.args.map((raw) => evaluateExpression(runtime, raw, statement.line))
  const failedArg = args.find((item): item is { diagnostic: JavaScriptSourceDiagnostic } => 'diagnostic' in item)
  if (failedArg) {
    runtime.diagnostics.push(failedArg.diagnostic)
    return false
  }

  markActiveLine(runtime, statement.line)
  pushFunctionContext(runtime, entry, functionNode, args as JavaScriptValue[], statement.line)
  const ok = executeFunctionBody(runtime, functionNode.body, bodyTargetLine)
  if (!ok || runtime.pausedInsideFunction) return ok
  popFunctionContext(runtime)
  markActiveLine(runtime, statement.line)
  return true
}

function pushFunctionContext(
  runtime: Runtime,
  entry: JavaScriptHeapFunction,
  functionNode: JavaScriptFunctionDeclaration,
  args: JavaScriptValue[],
  callLine: number
) {
  const scopeId = `s${runtime.state.counters.scope}`
  runtime.state.counters.scope++
  const contextId = `c${runtime.state.counters.context}`
  runtime.state.counters.context++
  const scope: JavaScriptScopeRecord = {
    id: scopeId,
    kind: 'function',
    name: `${entry.name} Function Scope`,
    bindings: {}
  }
  runtime.state.scopes[scopeId] = scope
  functionNode.params.forEach((name, index) => {
    defineBinding(scope, name, 'param', cloneJavaScriptValue(args[index] || undefinedJavaScriptValue()), true, callLine)
  })
  const context = {
    id: contextId,
    kind: 'function' as const,
    name: `${entry.name}()`,
    line: functionNode.line,
    activeLine: callLine,
    scopeIds: [scopeId, ...entry.closureScopeIds]
  }
  runtime.state.callStack.push(context)
  runtime.state.activeContextId = context.id
}

function popFunctionContext(runtime: Runtime) {
  const context = runtime.state.callStack.at(-1)
  if (!context || context.kind !== 'function') return
  runtime.state.callStack.pop()
  delete runtime.state.scopes[context.scopeIds[0]]
  runtime.state.activeContextId = runtime.state.callStack.at(-1)?.id || null
}

function evaluateExpression(
  runtime: Runtime,
  expression: string,
  line: number
): JavaScriptValue | { diagnostic: JavaScriptSourceDiagnostic } {
  const value = expression.trim()
  if (!value) return { diagnostic: diagnostic('syntax', line, '表达式不能为空。') }

  const literal = evaluateLiteral(value)
  if (literal) return literal

  if (value.startsWith('{') && value.endsWith('}')) return evaluateObjectLiteral(runtime, value, line)
  if (value.startsWith('[') && value.endsWith(']')) return evaluateArrayLiteral(runtime, value, line)

  const arrayAccess = value.match(/^([A-Za-z_$][\w$]*)\[\s*(\d+)\s*\]$/)
  if (arrayAccess) return readArrayItem(runtime, arrayAccess[1], Number(arrayAccess[2]), line)

  const property = value.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/)
  if (property) return readProperty(runtime, property[1], property[2], line)

  if (IDENTIFIER_ONLY.test(value)) {
    const lookup = lookupBinding(runtime, value)
    if (!lookup) return { diagnostic: diagnostic('name', line, `变量 ${value} 未声明。`) }
    return cloneJavaScriptValue(lookup.binding.value)
  }

  return { diagnostic: diagnostic('syntax', line, `不支持的表达式：${value}`) }
}

function evaluateObjectLiteral(
  runtime: Runtime,
  expression: string,
  line: number
): JavaScriptValue | { diagnostic: JavaScriptSourceDiagnostic } {
  const body = expression.slice(1, -1).trim()
  if (!body) return allocateJavaScriptObject(runtime.state, {})

  const properties: Record<string, JavaScriptValue> = {}
  for (const item of splitTopLevel(body, ',')) {
    const [rawKey, rawValue, ...extra] = splitTopLevel(item, ':')
    if (!rawKey || !rawValue || extra.length) {
      return { diagnostic: diagnostic('syntax', line, `对象属性写法无效：${item.trim()}`) }
    }
    const key = parsePropertyKey(rawKey.trim())
    if (!key) return { diagnostic: diagnostic('syntax', line, `对象属性名无效：${rawKey.trim()}`) }
    const value = evaluateExpression(runtime, rawValue.trim(), line)
    if ('diagnostic' in value) return value
    properties[key] = cloneJavaScriptValue(value)
  }
  return allocateJavaScriptObject(runtime.state, properties)
}

function evaluateArrayLiteral(
  runtime: Runtime,
  expression: string,
  line: number
): JavaScriptValue | { diagnostic: JavaScriptSourceDiagnostic } {
  const body = expression.slice(1, -1).trim()
  if (!body) return allocateJavaScriptArray(runtime.state, [])
  const elements: JavaScriptValue[] = []
  for (const item of splitTopLevel(body, ',')) {
    const value = evaluateExpression(runtime, item.trim(), line)
    if ('diagnostic' in value) return value
    elements.push(cloneJavaScriptValue(value))
  }
  return allocateJavaScriptArray(runtime.state, elements)
}

function readProperty(
  runtime: Runtime,
  ownerName: string,
  propertyName: string,
  line: number
): JavaScriptValue | { diagnostic: JavaScriptSourceDiagnostic } {
  const owner = lookupBinding(runtime, ownerName)
  if (!owner) return { diagnostic: diagnostic('name', line, `变量 ${ownerName} 未声明。`) }
  const entry = getReferencedHeapEntry(runtime, owner.binding.value)
  if (!entry) return { diagnostic: diagnostic('type', line, `${ownerName} 不是对象或数组引用。`) }
  if (entry.kind === 'array' && propertyName === 'length') return { kind: 'number', value: entry.elements.length }
  if (entry.kind !== 'object' && entry.kind !== 'array') {
    return { diagnostic: diagnostic('type', line, `${ownerName} 不是对象或数组引用。`) }
  }
  const record = entry.kind === 'object' ? entry.properties : entry.properties
  return cloneJavaScriptValue(record[propertyName] || undefinedJavaScriptValue())
}

function readArrayItem(
  runtime: Runtime,
  ownerName: string,
  index: number,
  line: number
): JavaScriptValue | { diagnostic: JavaScriptSourceDiagnostic } {
  const owner = lookupBinding(runtime, ownerName)
  if (!owner) return { diagnostic: diagnostic('name', line, `变量 ${ownerName} 未声明。`) }
  const entry = getReferencedHeapEntry(runtime, owner.binding.value)
  if (!entry || entry.kind !== 'array') {
    return { diagnostic: diagnostic('type', line, `${ownerName} 不是数组引用。`) }
  }
  return cloneJavaScriptValue(entry.elements[index] || undefinedJavaScriptValue())
}

function assignProperty(
  runtime: Runtime,
  ownerName: string,
  propertyName: string,
  value: JavaScriptValue,
  line: number
): JavaScriptSourceDiagnostic | null {
  const owner = lookupBinding(runtime, ownerName)
  if (!owner) return diagnostic('name', line, `变量 ${ownerName} 未声明。`)
  const entry = getReferencedHeapEntry(runtime, owner.binding.value)
  if (!entry || (entry.kind !== 'object' && entry.kind !== 'array')) {
    return diagnostic('type', line, `${ownerName} 不是对象或数组引用。`)
  }
  const record = entry.kind === 'object' ? entry.properties : entry.properties
  record[propertyName] = cloneJavaScriptValue(value)
  return null
}

function assignArrayItem(
  runtime: Runtime,
  ownerName: string,
  index: number,
  value: JavaScriptValue,
  line: number
): JavaScriptSourceDiagnostic | null {
  const owner = lookupBinding(runtime, ownerName)
  if (!owner) return diagnostic('name', line, `变量 ${ownerName} 未声明。`)
  const entry = getReferencedHeapEntry(runtime, owner.binding.value)
  if (!entry || entry.kind !== 'array') return diagnostic('type', line, `${ownerName} 不是数组引用。`)
  while (entry.elements.length < index) entry.elements.push(undefinedJavaScriptValue())
  entry.elements[index] = cloneJavaScriptValue(value)
  entry.size = 3 + entry.elements.length
  return null
}

function evaluateLiteral(expression: string): JavaScriptValue | null {
  if (expression === 'true' || expression === 'false') return { kind: 'boolean', value: expression === 'true' }
  if (expression === 'null') return { kind: 'null', value: null }
  if (expression === 'undefined') return undefinedJavaScriptValue()
  if (/^-?(?:\d+\.\d*|\.\d+|\d+)$/.test(expression)) return { kind: 'number', value: Number(expression) }
  if (/^"(?:[^"\\]|\\.)*"$/.test(expression) || /^'(?:[^'\\]|\\.)*'$/.test(expression)) {
    const parsed = parseStringLiteral(expression)
    return parsed === null ? null : { kind: 'string', value: parsed }
  }
  return null
}

function parseStringLiteral(expression: string) {
  if (expression.startsWith('"')) {
    try {
      return JSON.parse(expression) as string
    } catch {
      return null
    }
  }
  return expression.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function parsePropertyKey(raw: string) {
  const literal = evaluateLiteral(raw)
  if (literal?.kind === 'string') return literal.value
  return IDENTIFIER_ONLY.test(raw) ? raw : null
}

function defineBinding(
  scope: JavaScriptScopeRecord,
  name: string,
  declaration: JavaScriptBinding['declaration'],
  value: JavaScriptValue,
  mutable: boolean,
  line: number
) {
  scope.bindings[name] = {
    name,
    declaration,
    mutable,
    line,
    value: cloneJavaScriptValue(value)
  }
}

function lookupBinding(runtime: Runtime, name: string): BindingLookup | null {
  for (const scopeId of currentScopeIds(runtime)) {
    const scope = runtime.state.scopes[scopeId]
    const binding = scope?.bindings[name]
    if (binding) return { scope, binding }
  }
  return null
}

function currentScope(runtime: Runtime) {
  const scopeId = currentScopeIds(runtime)[0]
  return scopeId ? runtime.state.scopes[scopeId] || null : null
}

function currentScopeIds(runtime: Runtime) {
  return runtime.state.callStack.at(-1)?.scopeIds || []
}

function getReferencedHeapEntry(runtime: Runtime, value: JavaScriptValue): JavaScriptHeapEntry | null {
  if (value.kind !== 'reference') return null
  return runtime.state.heap.entries[value.value] || null
}

function markActiveLine(runtime: Runtime, line: number) {
  const context = runtime.state.callStack.at(-1)
  if (context) {
    context.activeLine = line
    runtime.state.activeContextId = context.id
  }
  runtime.stoppedLine = line
}

function diagnostic(
  stage: JavaScriptSourceDiagnostic['stage'],
  line: number,
  message: string
): JavaScriptSourceDiagnostic {
  return { stage, line, message }
}

function firstReachedDiagnosticLine(diagnostics: JavaScriptSourceDiagnostic[], targetLine: number) {
  return diagnostics.find((item) => item.line <= targetLine)?.line || targetLine
}
