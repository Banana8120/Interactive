import type {
  JvmArrayElementType,
  JvmHeapArray,
  JvmHeapObject,
  JvmState,
  JvmValue
} from '@/types'
import {
  cloneJvmState,
  collectJvmGarbage,
  createInitialJvmState,
  createStackFrame,
  ensureJvmHeapCapacity,
  getJvmUsage
} from './jvmMemoryEngine'
import type {
  JvmAssignmentStatement,
  JvmSourceClass,
  JvmSourceDiagnostic,
  JvmSourceField,
  JvmSourceProgram,
  JvmSourceStatement,
  JvmSourceType,
  JvmThreadStatement,
  JvmVariableStatement
} from './jvmSourceParser'

export type JvmExecutionStatus = 'paused' | 'completed' | 'error'

export interface JvmSourceExecutionResult {
  state: JvmState
  diagnostics: JvmSourceDiagnostic[]
  targetLine: number
  stoppedLine: number
  status: JvmExecutionStatus
  message: string
}

interface TypedValue {
  type: JvmSourceType | { name: 'null'; array: false }
  value: JvmValue
}

interface RuntimeVariable {
  type: JvmSourceType
  value: JvmValue
}

interface RuntimeScope {
  threadId: string
  frameId: string
  variables: Map<string, RuntimeVariable>
}

interface Runtime {
  state: JvmState
  program: JvmSourceProgram
  classes: Map<string, JvmSourceClass>
  diagnostics: JvmSourceDiagnostic[]
  stoppedLine: number
}

const NUMERIC_TYPES = new Set(['int', 'long', 'float', 'double'])

export function executeJvmSource(
  program: JvmSourceProgram,
  requestedTargetLine: number
): JvmSourceExecutionResult {
  const targetLine = Math.max(1, Math.min(program.lineCount, Math.floor(requestedTargetLine || 1)))
  const blockingParseError = program.diagnostics.find((item) => item.line <= targetLine)
  const executionLimit = blockingParseError ? Math.max(0, blockingParseError.line - 1) : targetLine
  const runtime: Runtime = {
    state: createInitialJvmState(),
    program,
    classes: new Map(program.classes.map((item) => [item.name, item])),
    diagnostics: [],
    stoppedLine: 0
  }

  initializeMethodArea(runtime)

  if (!runtime.diagnostics.length && program.main && executionLimit >= program.main.line) {
    const mainThread = runtime.state.threads.t1
    const frame = createStackFrame(runtime.state, program.main.className, 'main')
    mainThread.frames.push(frame)
    runtime.state.activeThreadId = mainThread.id
    runtime.stoppedLine = program.main.line
    const scope: RuntimeScope = {
      threadId: mainThread.id,
      frameId: frame.id,
      variables: new Map()
    }
    executeStatements(runtime, scope, program.main.statements, executionLimit)
    if (!runtime.diagnostics.length && targetLine >= program.main.endLine) {
      mainThread.frames.pop()
    }
  }

  const diagnostics = [...program.diagnostics, ...runtime.diagnostics]
    .sort((a, b) => a.line - b.line)
  const hasReachedError = diagnostics.some((item) => item.line <= targetLine)
  const lastExecutableLine = program.executableLines.at(-1) || program.main?.line || 1
  const status: JvmExecutionStatus = hasReachedError
    ? 'error'
    : targetLine >= lastExecutableLine
      ? 'completed'
      : 'paused'

  return {
    state: cloneJvmState(runtime.state),
    diagnostics,
    targetLine,
    stoppedLine: runtime.stoppedLine,
    status,
    message: status === 'error'
      ? `执行在第 ${firstReachedDiagnosticLine(diagnostics, targetLine)} 行前停止`
      : status === 'completed'
        ? '已执行到最后一条语句'
        : `已执行到第 ${runtime.stoppedLine || targetLine} 行`
  }
}

function initializeMethodArea(runtime: Runtime) {
  for (const classNode of runtime.program.classes) {
    const classSize = 8 + classNode.fields.length * 2
    const used = getJvmUsage(runtime.state).methodArea
    if (used + classSize > runtime.state.capacities.methodArea) {
      runtime.diagnostics.push({
        stage: 'runtime',
        line: classNode.line,
        message: `OutOfMemoryError: Metaspace（类 ${classNode.name} 需要 ${classSize} 单位）`
      })
      return
    }

    const constants: Record<string, JvmValue> = {}
    const staticVariables: Record<string, JvmValue> = {}
    for (const field of classNode.fields.filter((item) => item.isStatic)) {
      const value = evaluateFieldInitializer(field, runtime)
      if (!value) return
      if (field.isFinal) constants[field.name] = value
      else staticVariables[field.name] = value
    }

    runtime.state.methodArea.classes[classNode.name] = {
      name: classNode.name,
      size: classSize,
      constants,
      staticVariables
    }
  }
}

function evaluateFieldInitializer(field: JvmSourceField, runtime: Runtime): JvmValue | null {
  if (!field.initializer) return defaultValue(field.type)
  const evaluated = evaluateLiteral(field.initializer)
  if (!evaluated) {
    runtime.diagnostics.push({
      stage: 'syntax',
      line: field.line,
      message: `字段 ${field.name} 的初始化值必须是字面量或 null。`
    })
    return null
  }
  if (!isAssignable(field.type, evaluated.type)) {
    runtime.diagnostics.push({
      stage: 'type',
      line: field.line,
      message: `字段 ${field.name} 不能用 ${formatType(evaluated.type)} 初始化。`
    })
    return null
  }
  return cloneValue(evaluated.value)
}

function executeStatements(
  runtime: Runtime,
  scope: RuntimeScope,
  statements: JvmSourceStatement[],
  targetLine: number
): boolean {
  for (const statement of statements) {
    if (statement.line > targetLine) return true
    if (statement.kind === 'thread') {
      if (!executeThread(runtime, scope, statement, targetLine)) return false
      continue
    }
    if (!executeAtomicStatement(runtime, scope, statement)) return false
    runtime.stoppedLine = statement.line
  }
  return true
}

function executeThread(
  runtime: Runtime,
  parentScope: RuntimeScope,
  statement: JvmThreadStatement,
  targetLine: number
): boolean {
  runtime.stoppedLine = statement.line
  const id = `t${runtime.state.counters.thread}`
  runtime.state.counters.thread++
  const frame = createStackFrame(runtime.state, runtime.program.main?.className || 'Main', `thread$${statement.name}`)
  runtime.state.threads[id] = { id, name: statement.name, frames: [frame] }
  runtime.state.activeThreadId = id
  const scope: RuntimeScope = { threadId: id, frameId: frame.id, variables: new Map() }

  if (!executeStatements(runtime, scope, statement.statements, targetLine)) return false

  if (targetLine >= statement.endLine) {
    runtime.state.threads[id].frames.pop()
    runtime.state.activeThreadId = parentScope.threadId
  }
  return true
}

function executeAtomicStatement(
  runtime: Runtime,
  scope: RuntimeScope,
  statement: Exclude<JvmSourceStatement, JvmThreadStatement>
): boolean {
  const stateBefore = cloneJvmState(runtime.state)
  const variablesBefore = cloneVariables(scope.variables)
  let diagnostic: JvmSourceDiagnostic | null = null

  if (statement.kind === 'variable') diagnostic = executeVariable(runtime, scope, statement)
  if (statement.kind === 'assignment') diagnostic = executeAssignment(runtime, scope, statement)
  if (statement.kind === 'gc') collectJvmGarbage(runtime.state, 'manual')

  if (!diagnostic) return true
  runtime.state = stateBefore
  scope.variables = variablesBefore
  runtime.diagnostics.push(diagnostic)
  return false
}

function executeVariable(
  runtime: Runtime,
  scope: RuntimeScope,
  statement: JvmVariableStatement
): JvmSourceDiagnostic | null {
  if (scope.variables.has(statement.name)) {
    return diagnostic('name', statement.line, `局部变量 ${statement.name} 重复声明。`)
  }

  const frame = findFrame(runtime.state, scope)
  if (!frame) return diagnostic('runtime', statement.line, '当前线程栈帧不存在。')
  const nextSize = 12 + (scope.variables.size + 1) * 2
  const thread = runtime.state.threads[scope.threadId]
  const otherFramesSize = thread.frames
    .filter((item) => item.id !== frame.id)
    .reduce((total, item) => total + item.size, 0)
  if (otherFramesSize + nextSize > runtime.state.capacities.stackPerThread) {
    return diagnostic('runtime', statement.line, `StackOverflowError: 线程 ${thread.name} 栈空间不足。`)
  }

  const evaluated = statement.initializer
    ? evaluateExpression(statement.initializer, runtime, scope, statement.line)
    : { type: statement.type, value: defaultValue(statement.type) }
  if ('diagnostic' in evaluated) return evaluated.diagnostic
  if (!isAssignable(statement.type, evaluated.type)) {
    return diagnostic(
      'type',
      statement.line,
      `变量 ${statement.name} 的类型是 ${formatType(statement.type)}，不能赋值 ${formatType(evaluated.type)}。`
    )
  }

  scope.variables.set(statement.name, { type: statement.type, value: cloneValue(evaluated.value) })
  frame.localVariables[statement.name] = cloneValue(evaluated.value)
  frame.size = nextSize
  return null
}

function executeAssignment(
  runtime: Runtime,
  scope: RuntimeScope,
  statement: JvmAssignmentStatement
): JvmSourceDiagnostic | null {
  const evaluated = evaluateExpression(statement.expression, runtime, scope, statement.line)
  if ('diagnostic' in evaluated) return evaluated.diagnostic

  const arrayMatch = statement.target.match(/^([A-Za-z_$][\w$]*)\[\s*(\d+)\s*\]$/)
  if (arrayMatch) {
    const variable = scope.variables.get(arrayMatch[1])
    if (!variable) return diagnostic('name', statement.line, `局部变量 ${arrayMatch[1]} 未声明。`)
    if (!variable.type.array || variable.value.kind !== 'reference') {
      return diagnostic('type', statement.line, `${arrayMatch[1]} 不是可访问的数组引用。`)
    }
    const entry = runtime.state.heap.entries[variable.value.value]
    if (!entry || entry.kind !== 'array') {
      return diagnostic('runtime', statement.line, `数组 ${arrayMatch[1]} 已不存在。`)
    }
    const index = Number(arrayMatch[2])
    if (index >= entry.length) {
      return diagnostic(
        'runtime',
        statement.line,
        `ArrayIndexOutOfBoundsException: 索引 ${index}，数组长度 ${entry.length}`
      )
    }
    const elementType: JvmSourceType = { name: variable.type.name, array: false }
    if (!isAssignable(elementType, evaluated.type)) {
      return diagnostic('type', statement.line, `${formatType(variable.type)} 不能保存 ${formatType(evaluated.type)}。`)
    }
    entry.elements[index] = cloneValue(evaluated.value)
    return null
  }

  const memberMatch = statement.target.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/)
  if (memberMatch) {
    const [, owner, fieldName] = memberMatch
    const classNode = runtime.classes.get(owner)
    if (classNode) return assignStaticField(runtime, classNode, fieldName, evaluated, statement.line)
    return assignObjectField(runtime, scope, owner, fieldName, evaluated, statement.line)
  }

  const variable = scope.variables.get(statement.target)
  if (!variable) return diagnostic('name', statement.line, `局部变量 ${statement.target} 未声明。`)
  if (!isAssignable(variable.type, evaluated.type)) {
    return diagnostic('type', statement.line, `变量 ${statement.target} 不能赋值 ${formatType(evaluated.type)}。`)
  }
  variable.value = cloneValue(evaluated.value)
  const frame = findFrame(runtime.state, scope)
  if (frame) frame.localVariables[statement.target] = cloneValue(evaluated.value)
  return null
}

function assignStaticField(
  runtime: Runtime,
  classNode: JvmSourceClass,
  fieldName: string,
  evaluated: TypedValue,
  line: number
): JvmSourceDiagnostic | null {
  const field = classNode.fields.find((item) => item.name === fieldName && item.isStatic)
  if (!field) return diagnostic('name', line, `静态字段 ${classNode.name}.${fieldName} 未声明。`)
  if (field.isFinal) return diagnostic('type', line, `常量 ${classNode.name}.${fieldName} 不能修改。`)
  if (!isAssignable(field.type, evaluated.type)) {
    return diagnostic('type', line, `静态字段 ${classNode.name}.${fieldName} 不能赋值 ${formatType(evaluated.type)}。`)
  }
  runtime.state.methodArea.classes[classNode.name].staticVariables[fieldName] = cloneValue(evaluated.value)
  return null
}

function assignObjectField(
  runtime: Runtime,
  scope: RuntimeScope,
  variableName: string,
  fieldName: string,
  evaluated: TypedValue,
  line: number
): JvmSourceDiagnostic | null {
  const variable = scope.variables.get(variableName)
  if (!variable) return diagnostic('name', line, `局部变量 ${variableName} 未声明。`)
  if (variable.type.array || !runtime.classes.has(variable.type.name)) {
    return diagnostic('type', line, `${variableName} 不是对象引用。`)
  }
  if (variable.value.kind === 'null') return diagnostic('runtime', line, `NullPointerException: ${variableName}`)
  if (variable.value.kind !== 'reference') return diagnostic('type', line, `${variableName} 不是对象引用。`)
  const entry = runtime.state.heap.entries[variable.value.value]
  if (!entry || entry.kind !== 'object') return diagnostic('runtime', line, `对象 ${variable.value.value} 已不存在。`)
  const field = runtime.classes.get(entry.className)?.fields
    .find((item) => item.name === fieldName && !item.isStatic)
  if (!field) return diagnostic('name', line, `实例字段 ${entry.className}.${fieldName} 未声明。`)
  if (!isAssignable(field.type, evaluated.type)) {
    return diagnostic('type', line, `字段 ${entry.className}.${fieldName} 不能赋值 ${formatType(evaluated.type)}。`)
  }
  entry.fields[fieldName] = cloneValue(evaluated.value)
  return null
}

function evaluateExpression(
  expression: string,
  runtime: Runtime,
  scope: RuntimeScope,
  line: number
): TypedValue | { diagnostic: JvmSourceDiagnostic } {
  const value = expression.trim()
  const literal = evaluateLiteral(value)
  if (literal) return literal

  const newObject = value.match(/^new\s+([A-Za-z_$][\w$]*)\s*\(\s*\)$/)
  if (newObject) return allocateObject(runtime, newObject[1], line)

  const newArray = value.match(/^new\s+([A-Za-z_$][\w$]*)\s*\[\s*(\d+)\s*\]$/)
  if (newArray) return allocateArray(runtime, newArray[1], Number(newArray[2]), line)

  const arrayAccess = value.match(/^([A-Za-z_$][\w$]*)\[\s*(\d+)\s*\]$/)
  if (arrayAccess) {
    const variable = scope.variables.get(arrayAccess[1])
    if (!variable) return { diagnostic: diagnostic('name', line, `局部变量 ${arrayAccess[1]} 未声明。`) }
    if (!variable.type.array || variable.value.kind !== 'reference') {
      return { diagnostic: diagnostic('type', line, `${arrayAccess[1]} 不是可访问的数组引用。`) }
    }
    const entry = runtime.state.heap.entries[variable.value.value]
    if (!entry || entry.kind !== 'array') {
      return { diagnostic: diagnostic('runtime', line, `数组 ${arrayAccess[1]} 已不存在。`) }
    }
    const index = Number(arrayAccess[2])
    if (index >= entry.length) {
      return { diagnostic: diagnostic('runtime', line, `ArrayIndexOutOfBoundsException: 索引 ${index}，数组长度 ${entry.length}`) }
    }
    return {
      type: { name: variable.type.name, array: false },
      value: cloneValue(entry.elements[index])
    }
  }

  const member = value.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/)
  if (member) {
    const [, owner, fieldName] = member
    const classNode = runtime.classes.get(owner)
    if (classNode) {
      const field = classNode.fields.find((item) => item.name === fieldName && item.isStatic)
      if (!field) return { diagnostic: diagnostic('name', line, `静态字段 ${owner}.${fieldName} 未声明。`) }
      const classInfo = runtime.state.methodArea.classes[owner]
      const stored = field.isFinal ? classInfo.constants[fieldName] : classInfo.staticVariables[fieldName]
      return { type: field.type, value: cloneValue(stored) }
    }
    const variable = scope.variables.get(owner)
    if (!variable) return { diagnostic: diagnostic('name', line, `局部变量 ${owner} 未声明。`) }
    if (variable.value.kind === 'null') return { diagnostic: diagnostic('runtime', line, `NullPointerException: ${owner}`) }
    if (variable.value.kind !== 'reference') return { diagnostic: diagnostic('type', line, `${owner} 不是对象引用。`) }
    const entry = runtime.state.heap.entries[variable.value.value]
    if (!entry || entry.kind !== 'object') return { diagnostic: diagnostic('runtime', line, `对象 ${variable.value.value} 已不存在。`) }
    const field = runtime.classes.get(entry.className)?.fields.find((item) => item.name === fieldName && !item.isStatic)
    if (!field) return { diagnostic: diagnostic('name', line, `实例字段 ${entry.className}.${fieldName} 未声明。`) }
    return { type: field.type, value: cloneValue(entry.fields[fieldName]) }
  }

  const variable = scope.variables.get(value)
  if (variable) return { type: variable.type, value: cloneValue(variable.value) }
  return { diagnostic: diagnostic('syntax', line, `不支持的表达式：${value}`) }
}

function allocateObject(
  runtime: Runtime,
  className: string,
  line: number
): TypedValue | { diagnostic: JvmSourceDiagnostic } {
  const classNode = runtime.classes.get(className)
  if (!classNode || !runtime.state.methodArea.classes[className]) {
    return { diagnostic: diagnostic('name', line, `类 ${className} 未声明。`) }
  }
  const fields = classNode.fields.filter((item) => !item.isStatic)
  const size = 8 + fields.reduce((total, field) => total + typeUnitSize(field.type), 0)
  const capacity = ensureJvmHeapCapacity(runtime.state, size)
  if (!capacity.ok) return { diagnostic: diagnostic('runtime', line, capacity.message) }

  const id = `@o${runtime.state.counters.object}`
  runtime.state.counters.object++
  const values: Record<string, JvmValue> = {}
  for (const field of fields) {
    if (!field.initializer) {
      values[field.name] = defaultValue(field.type)
      continue
    }
    const initialized = evaluateLiteral(field.initializer)
    if (!initialized || !isAssignable(field.type, initialized.type)) {
      return { diagnostic: diagnostic('type', line, `字段 ${className}.${field.name} 的默认值无效。`) }
    }
    values[field.name] = cloneValue(initialized.value)
  }
  const object: JvmHeapObject = { kind: 'object', id, className, size, fields: values }
  runtime.state.heap.entries[id] = object
  return { type: { name: className, array: false }, value: { kind: 'reference', value: id } }
}

function allocateArray(
  runtime: Runtime,
  elementTypeName: string,
  length: number,
  line: number
): TypedValue | { diagnostic: JvmSourceDiagnostic } {
  const type: JvmSourceType = { name: elementTypeName, array: false }
  if (!isKnownType(type, runtime.classes)) {
    return { diagnostic: diagnostic('name', line, `数组元素类型 ${elementTypeName} 未声明。`) }
  }
  const elementSize = typeUnitSize(type)
  const size = 2 + length * elementSize
  const capacity = ensureJvmHeapCapacity(runtime.state, size)
  if (!capacity.ok) return { diagnostic: diagnostic('runtime', line, capacity.message) }

  const id = `@a${runtime.state.counters.array}`
  runtime.state.counters.array++
  const array: JvmHeapArray = {
    kind: 'array',
    id,
    elementType: toHeapArrayType(elementTypeName, runtime.classes),
    length,
    elementSize,
    size,
    elements: Array.from({ length }, () => defaultValue(type))
  }
  runtime.state.heap.entries[id] = array
  return {
    type: { name: elementTypeName, array: true },
    value: { kind: 'reference', value: id }
  }
}

function evaluateLiteral(expression: string): TypedValue | null {
  if (expression === 'null') return { type: { name: 'null', array: false }, value: { kind: 'null', value: null } }
  if (expression === 'true' || expression === 'false') {
    return { type: { name: 'boolean', array: false }, value: { kind: 'boolean', value: expression === 'true' } }
  }
  if (/^-?\d+$/.test(expression)) {
    return { type: { name: 'int', array: false }, value: { kind: 'number', value: Number(expression) } }
  }
  if (/^-?(?:\d+\.\d*|\.\d+)$/.test(expression)) {
    return { type: { name: 'double', array: false }, value: { kind: 'number', value: Number(expression) } }
  }
  if (/^"(?:[^"\\]|\\.)*"$/.test(expression)) {
    try {
      return { type: { name: 'String', array: false }, value: { kind: 'string', value: JSON.parse(expression) } }
    } catch {
      return null
    }
  }
  return null
}

function defaultValue(type: JvmSourceType): JvmValue {
  if (type.array || type.name === 'String' || !['boolean', 'int', 'long', 'float', 'double'].includes(type.name)) {
    return { kind: 'null', value: null }
  }
  if (type.name === 'boolean') return { kind: 'boolean', value: false }
  return { kind: 'number', value: 0 }
}

function isAssignable(target: JvmSourceType, source: TypedValue['type']) {
  if (source.name === 'null') {
    return target.array || target.name === 'String' || !['boolean', 'int', 'long', 'float', 'double'].includes(target.name)
  }
  if (target.array || source.array) return target.array === source.array && target.name === source.name
  if (NUMERIC_TYPES.has(target.name) && NUMERIC_TYPES.has(source.name)) return true
  return target.name === source.name
}

function isKnownType(type: JvmSourceType, classes: Map<string, JvmSourceClass>) {
  return ['boolean', 'int', 'long', 'float', 'double', 'String'].includes(type.name) || classes.has(type.name)
}

function typeUnitSize(type: JvmSourceType) {
  if (type.array || type.name === 'String' || !['boolean', 'int', 'long', 'float', 'double'].includes(type.name)) return 4
  if (type.name === 'boolean') return 1
  if (type.name === 'long' || type.name === 'double') return 8
  return 4
}

function toHeapArrayType(
  typeName: string,
  classes: Map<string, JvmSourceClass>
): JvmArrayElementType {
  if (classes.has(typeName)) return 'ref'
  if (typeName === 'String') return 'string'
  return typeName as JvmArrayElementType
}

function findFrame(state: JvmState, scope: RuntimeScope) {
  return state.threads[scope.threadId]?.frames.find((item) => item.id === scope.frameId) || null
}

function cloneVariables(variables: Map<string, RuntimeVariable>) {
  return new Map([...variables].map(([name, variable]) => [
    name,
    { type: { ...variable.type }, value: cloneValue(variable.value) }
  ]))
}

function cloneValue(value: JvmValue): JvmValue {
  return { ...value } as JvmValue
}

function diagnostic(
  stage: JvmSourceDiagnostic['stage'],
  line: number,
  message: string
): JvmSourceDiagnostic {
  return { stage, line, message }
}

function formatType(type: TypedValue['type']) {
  return type.array ? `${type.name}[]` : type.name
}

function firstReachedDiagnosticLine(diagnostics: JvmSourceDiagnostic[], targetLine: number) {
  return diagnostics.find((item) => item.line <= targetLine)?.line || targetLine
}
