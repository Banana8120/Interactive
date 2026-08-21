export type JavaScriptSourceDiagnosticStage = 'syntax' | 'name' | 'type' | 'runtime'

export interface JavaScriptSourceDiagnostic {
  stage: JavaScriptSourceDiagnosticStage
  line: number
  message: string
}

export interface JavaScriptVariableStatement {
  kind: 'variable'
  declaration: 'let' | 'const' | 'var'
  name: string
  initializer: string | null
  line: number
}

export interface JavaScriptAssignmentStatement {
  kind: 'assignment'
  target: string
  expression: string
  line: number
}

export interface JavaScriptCallStatement {
  kind: 'call'
  callee: string
  args: string[]
  line: number
}

export interface JavaScriptFunctionDeclaration {
  kind: 'function'
  name: string
  params: string[]
  line: number
  endLine: number
  body: JavaScriptExecutableStatement[]
}

export type JavaScriptExecutableStatement =
  | JavaScriptVariableStatement
  | JavaScriptAssignmentStatement
  | JavaScriptCallStatement

export type JavaScriptSourceStatement = JavaScriptExecutableStatement | JavaScriptFunctionDeclaration

export interface JavaScriptSourceProgram {
  statements: JavaScriptSourceStatement[]
  functions: JavaScriptFunctionDeclaration[]
  diagnostics: JavaScriptSourceDiagnostic[]
  executableLines: number[]
  lineCount: number
}

const IDENTIFIER = '[A-Za-z_$][\\w$]*'
const IDENTIFIER_ONLY = new RegExp(`^${IDENTIFIER}$`)
const FUNCTION_HEADER = new RegExp(`^function\\s+(${IDENTIFIER})\\s*\\(([^)]*)\\)\\s*\\{$`)
const VARIABLE_DECLARATION = new RegExp(`^(let|const|var)\\s+(${IDENTIFIER})(?:\\s*=\\s*(.+))?$`)
const CALL_STATEMENT = new RegExp(`^(${IDENTIFIER})\\s*\\((.*)\\)$`)
const ASSIGNMENT_TARGET = new RegExp(`^${IDENTIFIER}(?:(?:\\.${IDENTIFIER})|(?:\\[\\s*\\d+\\s*\\]))?$`)

export function parseJavaScriptSource(source: string): JavaScriptSourceProgram {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const statements: JavaScriptSourceStatement[] = []
  const functions: JavaScriptFunctionDeclaration[] = []
  const diagnostics: JavaScriptSourceDiagnostic[] = []
  const executableLines: number[] = []
  let activeFunction: JavaScriptFunctionDeclaration | null = null

  const addDiagnostic = (stage: JavaScriptSourceDiagnosticStage, line: number, message: string) => {
    diagnostics.push({ stage, line, message })
  }

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1
    const text = normalizeStatement(stripLineComment(lines[index]))
    if (!text) continue

    if (/^}\s*$/.test(text)) {
      if (!activeFunction) {
        addDiagnostic('syntax', lineNumber, '存在多余的右花括号。')
        continue
      }
      activeFunction.endLine = lineNumber
      activeFunction = null
      continue
    }

    const functionHeader = text.match(FUNCTION_HEADER)
    if (functionHeader) {
      if (activeFunction) {
        addDiagnostic('syntax', lineNumber, '第一版不支持嵌套 function 声明。')
        continue
      }
      const params = parseParams(functionHeader[2], lineNumber, diagnostics)
      const functionNode: JavaScriptFunctionDeclaration = {
        kind: 'function',
        name: functionHeader[1],
        params,
        line: lineNumber,
        endLine: lineNumber,
        body: []
      }
      statements.push(functionNode)
      functions.push(functionNode)
      executableLines.push(lineNumber)
      activeFunction = functionNode
      continue
    }

    if (/^function\b/.test(text)) {
      addDiagnostic('syntax', lineNumber, 'function 声明需要写成 function name(params) {。')
      continue
    }

    const parsed = parseExecutableStatement(text, lineNumber, diagnostics)
    if (!parsed) continue

    if (activeFunction) activeFunction.body.push(parsed)
    else statements.push(parsed)
    executableLines.push(lineNumber)
  }

  if (activeFunction) {
    addDiagnostic('syntax', activeFunction.line, `函数 ${activeFunction.name} 缺少右花括号。`)
  }

  validateNames(statements, diagnostics)

  return {
    statements,
    functions,
    diagnostics: uniqueDiagnostics(diagnostics),
    executableLines: [...new Set(executableLines)].sort((a, b) => a - b),
    lineCount: lines.length
  }
}

export function formatJavaScriptSource(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let depth = 0
  const formatted = lines.map((rawLine) => {
    const text = rawLine.trim()
    if (!text) return ''
    if (text.startsWith('}')) depth = Math.max(0, depth - 1)
    const line = `${'    '.repeat(depth)}${text.replace(/;$/, '')}`
    if (text.endsWith('{')) depth++
    return line
  })
  return formatted.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function parseExecutableStatement(
  text: string,
  line: number,
  diagnostics: JavaScriptSourceDiagnostic[]
): JavaScriptExecutableStatement | null {
  if (/^(if|for|while|switch|class|return|import|export|try|throw)\b/.test(text)) {
    diagnostics.push({ stage: 'syntax', line, message: `第一版暂不支持的语句：${text}` })
    return null
  }

  const variable = text.match(VARIABLE_DECLARATION)
  if (variable) {
    return {
      kind: 'variable',
      declaration: variable[1] as JavaScriptVariableStatement['declaration'],
      name: variable[2],
      initializer: variable[3]?.trim() || null,
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

  const call = text.match(CALL_STATEMENT)
  if (call) {
    return {
      kind: 'call',
      callee: call[1],
      args: splitTopLevel(call[2], ',').map((item) => item.trim()).filter(Boolean),
      line
    }
  }

  diagnostics.push({ stage: 'syntax', line, message: `不支持的语句：${text}` })
  return null
}

function parseParams(
  raw: string,
  line: number,
  diagnostics: JavaScriptSourceDiagnostic[]
) {
  if (!raw.trim()) return []
  const params = raw.split(',').map((item) => item.trim())
  const names = new Set<string>()
  for (const param of params) {
    if (!IDENTIFIER_ONLY.test(param)) {
      diagnostics.push({ stage: 'syntax', line, message: `参数名无效：${param}` })
      continue
    }
    if (names.has(param)) {
      diagnostics.push({ stage: 'name', line, message: `参数 ${param} 重复声明。` })
      continue
    }
    names.add(param)
  }
  return params.filter((item) => IDENTIFIER_ONLY.test(item))
}

function validateNames(
  statements: JavaScriptSourceStatement[],
  diagnostics: JavaScriptSourceDiagnostic[]
) {
  const globalNames = new Set<string>()
  for (const statement of statements) {
    if (statement.kind === 'function') {
      if (globalNames.has(statement.name)) {
        diagnostics.push({ stage: 'name', line: statement.line, message: `标识符 ${statement.name} 重复声明。` })
      }
      globalNames.add(statement.name)
      validateFunctionBody(statement, diagnostics)
      continue
    }

    if (statement.kind === 'variable') {
      if (globalNames.has(statement.name)) {
        diagnostics.push({ stage: 'name', line: statement.line, message: `标识符 ${statement.name} 重复声明。` })
      }
      globalNames.add(statement.name)
    }
  }
}

function validateFunctionBody(
  functionNode: JavaScriptFunctionDeclaration,
  diagnostics: JavaScriptSourceDiagnostic[]
) {
  const names = new Set(functionNode.params)
  for (const statement of functionNode.body) {
    if (statement.kind !== 'variable') continue
    if (names.has(statement.name)) {
      diagnostics.push({
        stage: 'name',
        line: statement.line,
        message: `函数 ${functionNode.name} 中的标识符 ${statement.name} 重复声明。`
      })
      continue
    }
    names.add(statement.name)
  }
}

function stripLineComment(line: string) {
  let quote = ''
  let escaped = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    const next = line[index + 1]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '/' && next === '/') return line.slice(0, index)
  }
  return line
}

function normalizeStatement(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return trimmed.endsWith(';') ? trimmed.slice(0, -1).trim() : trimmed
}

export function splitTopLevel(value: string, separator: string) {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let escaped = false
  let start = 0

  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '{' || character === '[' || character === '(') depth++
    if (character === '}' || character === ']' || character === ')') depth--
    if (character === separator && depth === 0) {
      parts.push(value.slice(start, index))
      start = index + 1
    }
  }

  parts.push(value.slice(start))
  return parts
}

function uniqueDiagnostics(diagnostics: JavaScriptSourceDiagnostic[]) {
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
