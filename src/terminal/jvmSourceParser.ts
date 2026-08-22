export type JvmSourceDiagnosticStage = 'syntax' | 'name' | 'type' | 'runtime'

export interface JvmSourceDiagnostic {
  stage: JvmSourceDiagnosticStage
  line: number
  message: string
}

export interface JvmSourceType {
  name: string
  array: boolean
}

export interface JvmSourceField {
  name: string
  type: JvmSourceType
  isStatic: boolean
  isFinal: boolean
  initializer: string | null
  line: number
}

export interface JvmVariableStatement {
  kind: 'variable'
  name: string
  type: JvmSourceType
  initializer: string | null
  line: number
}

export interface JvmAssignmentStatement {
  kind: 'assignment'
  target: string
  expression: string
  line: number
}

export interface JvmGcStatement {
  kind: 'gc'
  line: number
}

export interface JvmThreadStatement {
  kind: 'thread'
  name: string
  line: number
  endLine: number
  statements: JvmSourceStatement[]
}

export type JvmSourceStatement = JvmVariableStatement | JvmAssignmentStatement | JvmGcStatement | JvmThreadStatement

export interface JvmSourceMain {
  className: string
  line: number
  endLine: number
  statements: JvmSourceStatement[]
}

export interface JvmSourceClass {
  name: string
  line: number
  endLine: number
  fields: JvmSourceField[]
}

export interface JvmSourceProgram {
  classes: JvmSourceClass[]
  main: JvmSourceMain | null
  diagnostics: JvmSourceDiagnostic[]
  executableLines: number[]
  lineCount: number
}

interface SourceSegment {
  kind: 'statement' | 'open' | 'close'
  text: string
  line: number
}

interface ScanResult {
  segments: SourceSegment[]
  diagnostics: JvmSourceDiagnostic[]
}

type ParseContext =
  | { kind: 'top'; line: number }
  | { kind: 'class'; line: number; classNode: JvmSourceClass }
  | { kind: 'main'; line: number; mainNode: JvmSourceMain }
  | { kind: 'thread'; line: number; threadNode: JvmThreadStatement }
  | { kind: 'invalid'; line: number }

const IDENTIFIER = '[A-Za-z_$][\\w$]*'
const TYPE_PATTERN = `(?:boolean|int|long|float|double|String|${IDENTIFIER})(?:\\[\\])?`
const CLASS_HEADER = new RegExp(`^(?:public\\s+)?class\\s+(${IDENTIFIER})$`)
const MAIN_HEADER = /^(?:public\s+)?static\s+void\s+main\s*\(\s*(?:String\s*\[\]\s+[A-Za-z_$][\w$]*)?\s*\)$/
const THREAD_HEADER = new RegExp(`^thread\\s+(${IDENTIFIER})$`)
const FIELD_DECLARATION = new RegExp(
  `^(?:(static)\\s+)?(?:(final)\\s+)?(${TYPE_PATTERN})\\s+(${IDENTIFIER})(?:\\s*=\\s*(.+))?$`
)
const VARIABLE_DECLARATION = new RegExp(`^(${TYPE_PATTERN})\\s+(${IDENTIFIER})(?:\\s*=\\s*(.+))?$`)
const ASSIGNMENT_TARGET = new RegExp(`^${IDENTIFIER}(?:(?:\\.${IDENTIFIER})|(?:\\[\\s*\\d+\\s*\\]))?$`)

export function parseJvmSource(source: string): JvmSourceProgram {
  const scan = scanSource(source)
  const classes: JvmSourceClass[] = []
  const diagnostics = [...scan.diagnostics]
  const executableLines: number[] = []
  const contexts: ParseContext[] = [{ kind: 'top', line: 1 }]
  const classNames = new Set<string>()
  const threadNames = new Set<string>()
  let main: JvmSourceMain | null = null

  const current = () => contexts[contexts.length - 1]
  const addDiagnostic = (stage: JvmSourceDiagnosticStage, line: number, message: string) => {
    diagnostics.push({ stage, line, message })
  }

  for (const segment of scan.segments) {
    const context = current()

    if (segment.kind === 'open') {
      if (context.kind === 'top') {
        const match = segment.text.match(CLASS_HEADER)
        if (!match) {
          addDiagnostic('syntax', segment.line, '顶层只支持 class 声明。')
          contexts.push({ kind: 'invalid', line: segment.line })
          continue
        }
        const name = match[1]
        if (classNames.has(name)) {
          addDiagnostic('name', segment.line, `类 ${name} 重复声明。`)
          contexts.push({ kind: 'invalid', line: segment.line })
          continue
        }
        classNames.add(name)
        const classNode: JvmSourceClass = {
          name,
          line: segment.line,
          endLine: segment.line,
          fields: []
        }
        classes.push(classNode)
        contexts.push({ kind: 'class', line: segment.line, classNode })
        continue
      }

      if (context.kind === 'class') {
        if (!MAIN_HEADER.test(segment.text)) {
          addDiagnostic('syntax', segment.line, '第一版只支持 static void main() 方法。')
          contexts.push({ kind: 'invalid', line: segment.line })
          continue
        }
        if (main) {
          addDiagnostic('name', segment.line, '程序只能包含一个 main() 入口。')
          contexts.push({ kind: 'invalid', line: segment.line })
          continue
        }
        main = {
          className: context.classNode.name,
          line: segment.line,
          endLine: segment.line,
          statements: []
        }
        contexts.push({ kind: 'main', line: segment.line, mainNode: main })
        continue
      }

      if (context.kind === 'main') {
        const match = segment.text.match(THREAD_HEADER)
        if (!match) {
          addDiagnostic('syntax', segment.line, 'main() 内只允许使用 thread <名称> { ... } 创建代码块。')
          contexts.push({ kind: 'invalid', line: segment.line })
          continue
        }
        const name = match[1]
        if (threadNames.has(name) || name === 'main') {
          addDiagnostic('name', segment.line, `线程 ${name} 重复声明或名称不可用。`)
          contexts.push({ kind: 'invalid', line: segment.line })
          continue
        }
        threadNames.add(name)
        const threadNode: JvmThreadStatement = {
          kind: 'thread',
          name,
          line: segment.line,
          endLine: segment.line,
          statements: []
        }
        context.mainNode.statements.push(threadNode)
        executableLines.push(segment.line)
        contexts.push({ kind: 'thread', line: segment.line, threadNode })
        continue
      }

      if (context.kind === 'thread') {
        addDiagnostic('syntax', segment.line, '第一版不支持嵌套 thread 代码块。')
        contexts.push({ kind: 'invalid', line: segment.line })
        continue
      }

      contexts.push({ kind: 'invalid', line: segment.line })
      continue
    }

    if (segment.kind === 'close') {
      if (contexts.length === 1) {
        addDiagnostic('syntax', segment.line, '存在多余的右花括号。')
        continue
      }
      const closing = contexts.pop()!
      if (closing.kind === 'class') closing.classNode.endLine = segment.line
      if (closing.kind === 'main') closing.mainNode.endLine = segment.line
      if (closing.kind === 'thread') closing.threadNode.endLine = segment.line
      continue
    }

    if (context.kind === 'class') {
      const field = parseField(segment.text, segment.line, diagnostics)
      if (!field) continue
      if (context.classNode.fields.some((item) => item.name === field.name)) {
        addDiagnostic('name', segment.line, `字段 ${context.classNode.name}.${field.name} 重复声明。`)
        continue
      }
      context.classNode.fields.push(field)
      continue
    }

    if (context.kind === 'main' || context.kind === 'thread') {
      const statement = parseExecutableStatement(segment.text, segment.line, diagnostics)
      if (!statement) continue
      const statements = context.kind === 'main' ? context.mainNode.statements : context.threadNode.statements
      statements.push(statement)
      executableLines.push(segment.line)
      continue
    }

    if (context.kind === 'top') {
      addDiagnostic('syntax', segment.line, '语句必须写在 class 或 main() 中。')
    }
  }

  for (const context of contexts.slice(1)) {
    addDiagnostic('syntax', context.line, '代码块缺少右花括号。')
  }

  if (!main) {
    addDiagnostic('syntax', 1, '需要声明一个 static void main() 入口。')
  }

  const knownClasses = new Set(classes.map((item) => item.name))
  for (const classNode of classes) {
    for (const field of classNode.fields) {
      validateKnownType(field.type, field.line, knownClasses, diagnostics)
      if (field.isFinal && !field.isStatic) {
        addDiagnostic('syntax', field.line, '第一版只支持 static final 常量。')
      }
      if (field.isFinal && !field.initializer) {
        addDiagnostic('syntax', field.line, `常量 ${classNode.name}.${field.name} 必须初始化。`)
      }
    }
  }
  if (main) validateStatementTypes(main.statements, knownClasses, diagnostics)

  return {
    classes,
    main,
    diagnostics: uniqueDiagnostics(diagnostics),
    executableLines: [...new Set(executableLines)].sort((a, b) => a - b),
    lineCount: source.split(/\r?\n/).length
  }
}

export function parseJvmSourceType(raw: string): JvmSourceType {
  const normalized = raw.replace(/\s+/g, '')
  return normalized.endsWith('[]') ? { name: normalized.slice(0, -2), array: true } : { name: normalized, array: false }
}

export function formatJvmSource(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let depth = 0
  const formatted = lines.map((rawLine) => {
    const content = rawLine.trim()
    if (!content) return ''
    if (content.startsWith('}')) depth = Math.max(0, depth - 1)
    const line = `${'    '.repeat(depth)}${content}`
    const opens = countOutsideStrings(content, '{')
    const closes = countOutsideStrings(content, '}') - (content.startsWith('}') ? 1 : 0)
    depth = Math.max(0, depth + opens - Math.max(0, closes))
    return line
  })
  return formatted
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

function parseField(text: string, line: number, diagnostics: JvmSourceDiagnostic[]): JvmSourceField | null {
  const match = text.match(FIELD_DECLARATION)
  if (!match) {
    diagnostics.push({
      stage: 'syntax',
      line,
      message: '类中只支持常量、静态字段和实例字段声明。'
    })
    return null
  }
  return {
    isStatic: Boolean(match[1]),
    isFinal: Boolean(match[2]),
    type: parseJvmSourceType(match[3]),
    name: match[4],
    initializer: match[5]?.trim() || null,
    line
  }
}

function parseExecutableStatement(
  text: string,
  line: number,
  diagnostics: JvmSourceDiagnostic[]
): JvmSourceStatement | null {
  if (text === 'gc()') return { kind: 'gc', line }

  if (/^(?:if|for|while|switch|try|return)\b/.test(text)) {
    diagnostics.push({ stage: 'syntax', line, message: `不支持的语句：${text}` })
    return null
  }

  const declaration = text.match(VARIABLE_DECLARATION)
  if (declaration) {
    return {
      kind: 'variable',
      type: parseJvmSourceType(declaration[1]),
      name: declaration[2],
      initializer: declaration[3]?.trim() || null,
      line
    }
  }

  const assignment = text.match(/^(.+?)\s*=\s*(.+)$/)
  if (assignment) {
    const target = assignment[1].trim()
    if (!ASSIGNMENT_TARGET.test(target)) {
      diagnostics.push({ stage: 'syntax', line, message: `不支持的赋值目标：${target}` })
      return null
    }
    return {
      kind: 'assignment',
      target,
      expression: assignment[2].trim(),
      line
    }
  }

  diagnostics.push({ stage: 'syntax', line, message: `不支持的语句：${text}` })
  return null
}

function validateStatementTypes(
  statements: JvmSourceStatement[],
  knownClasses: Set<string>,
  diagnostics: JvmSourceDiagnostic[]
) {
  for (const statement of statements) {
    if (statement.kind === 'variable') {
      validateKnownType(statement.type, statement.line, knownClasses, diagnostics)
    }
    if (statement.kind === 'thread') {
      validateStatementTypes(statement.statements, knownClasses, diagnostics)
    }
  }
}

function validateKnownType(
  type: JvmSourceType,
  line: number,
  knownClasses: Set<string>,
  diagnostics: JvmSourceDiagnostic[]
) {
  if (['boolean', 'int', 'long', 'float', 'double', 'String'].includes(type.name)) return
  if (!knownClasses.has(type.name)) {
    diagnostics.push({ stage: 'name', line, message: `未知类型：${type.name}` })
  }
}

function scanSource(source: string): ScanResult {
  const segments: SourceSegment[] = []
  const diagnostics: JvmSourceDiagnostic[] = []
  let buffer = ''
  let bufferLine = 1
  let line = 1
  let quote = ''
  let escaped = false
  let inComment = false

  const append = (character: string) => {
    if (!buffer.trim() && !/\s/.test(character)) bufferLine = line
    buffer += character
  }
  const emit = (kind: SourceSegment['kind'], fallbackLine = line) => {
    const text = buffer.trim()
    segments.push({ kind, text, line: text ? bufferLine : fallbackLine })
    buffer = ''
  }

  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    const next = source[index + 1]

    if (inComment) {
      if (character === '\n') {
        inComment = false
        line++
        if (buffer && !/\s$/.test(buffer)) buffer += ' '
      }
      continue
    }

    if (quote) {
      append(character)
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = ''
      }
      if (character === '\n') line++
      continue
    }

    if (character === '/' && next === '/') {
      inComment = true
      index++
      continue
    }
    if (character === '"') {
      quote = character
      append(character)
      continue
    }
    if (character === '\n') {
      line++
      if (buffer && !/\s$/.test(buffer)) buffer += ' '
      continue
    }
    if (character === ';') {
      if (!buffer.trim()) {
        diagnostics.push({ stage: 'syntax', line, message: '存在空语句。' })
        buffer = ''
      } else {
        emit('statement')
      }
      continue
    }
    if (character === '{') {
      emit('open')
      continue
    }
    if (character === '}') {
      if (buffer.trim()) {
        diagnostics.push({ stage: 'syntax', line: bufferLine, message: '右花括号前的语句缺少分号。' })
        buffer = ''
      }
      emit('close', line)
      continue
    }
    append(character)
  }

  if (quote) diagnostics.push({ stage: 'syntax', line: bufferLine, message: '字符串缺少结束引号。' })
  if (buffer.trim()) {
    diagnostics.push({ stage: 'syntax', line: bufferLine, message: '声明或语句不完整，可能缺少分号或左花括号。' })
  }
  return { segments, diagnostics }
}

function countOutsideStrings(value: string, target: string) {
  let count = 0
  let quote = ''
  let escaped = false
  for (const character of value) {
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }
    if (character === '"') quote = character
    else if (character === target) count++
  }
  return count
}

function uniqueDiagnostics(diagnostics: JvmSourceDiagnostic[]) {
  const seen = new Set<string>()
  return diagnostics
    .filter((diagnostic) => {
      const key = `${diagnostic.stage}:${diagnostic.line}:${diagnostic.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.line - b.line)
}
