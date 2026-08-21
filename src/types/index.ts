/* ================= Docker 模拟状态 ================= */

export interface DockerImage {
  id: string
  repo: string
  tag: string
  full: string
  size: string
  created: string
}

export interface DockerContainer {
  id: string
  name: string
  image: string
  status: 'running' | 'exited' | 'created' | 'paused'
  ports: string
  composeProject?: string
}

export interface DockerVolume {
  name: string
  driver: string
}

export interface DockerNetwork {
  id: string
  name: string
  driver: string
}

export interface DockerEnv {
  images: DockerImage[]
  containers: DockerContainer[]
  volumes: DockerVolume[]
  networks: DockerNetwork[]
  history: string[]
}

/* ================= Git 模拟状态 ================= */

export interface GitCommit {
  hash: string
  msg: string
  author: string
  email: string
  date: string
  parent: string | null
  files: Record<string, any>
}

export interface GitRemote {
  url: string
  branches: Record<string, string>
}

export interface GitStash {
  msg: string
  branch?: string
  staged?: Record<string, any>
  workdir?: Record<string, any>
}

export interface GitState {
  initialized: boolean
  config: {
    user: { name: string; email: string }
    [key: string]: any
  }
  head: string
  detached: boolean
  detachedAt: string | null
  branches: Record<string, string | null>
  commits: Record<string, GitCommit>
  staged: Record<string, any>
  workdir: Record<string, any>
  remotes: Record<string, GitRemote>
  stash: GitStash[]
  tags: Record<string, string>
  reflog: any[]
  mergeState: any
  cherryPickState: any
  worktrees?: any[]
  bisectState?: any
}

/* ================= MySQL 模拟状态 ================= */

export type MySqlValue = string | number | null

export interface MySqlColumn {
  name: string
  type: string
  nullable: boolean
  primaryKey?: boolean
  autoIncrement?: boolean
  defaultValue?: MySqlValue
}

export interface MySqlRow {
  [key: string]: MySqlValue
}

export interface MySqlTable {
  name: string
  columns: MySqlColumn[]
  rows: MySqlRow[]
  autoIncrement: number
}

export interface MySqlDatabase {
  name: string
  tables: Record<string, MySqlTable>
  system?: boolean
}

export interface MySqlState {
  connected: boolean
  currentDatabase: string | null
  databases: Record<string, MySqlDatabase>
  history: string[]
}

/* ================= JVM 模拟状态 ================= */

export type JvmValue =
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'null'; value: null }
  | { kind: 'reference'; value: string }

export interface JvmClassInfo {
  name: string
  size: number
  constants: Record<string, JvmValue>
  staticVariables: Record<string, JvmValue>
}

export interface JvmStackFrame {
  id: string
  className: string
  methodName: string
  size: number
  localVariables: Record<string, JvmValue>
  operandStack: JvmValue[]
}

export interface JvmThread {
  id: string
  name: string
  frames: JvmStackFrame[]
}

export interface JvmHeapObject {
  kind: 'object'
  id: string
  className: string
  size: number
  fields: Record<string, JvmValue>
}

export type JvmArrayElementType = 'ref' | 'int' | 'long' | 'float' | 'double' | 'boolean' | 'string'

export interface JvmHeapArray {
  kind: 'array'
  id: string
  elementType: JvmArrayElementType
  length: number
  elementSize: number
  size: number
  elements: JvmValue[]
}

export type JvmHeapEntry = JvmHeapObject | JvmHeapArray

export interface JvmGcStats {
  run: number
  trigger: 'manual' | 'allocation'
  scanned: number
  survived: number
  collected: number
  freed: number
}

export interface JvmState {
  capacities: {
    methodArea: number
    heap: number
    stackPerThread: number
  }
  methodArea: {
    classes: Record<string, JvmClassInfo>
  }
  heap: {
    entries: Record<string, JvmHeapEntry>
  }
  threads: Record<string, JvmThread>
  activeThreadId: string | null
  counters: {
    thread: number
    frame: number
    object: number
    array: number
    gc: number
  }
  lastGc: JvmGcStats | null
}

/* ================= JavaScript 模拟状态 ================= */

export type JavaScriptValue =
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'null'; value: null }
  | { kind: 'undefined'; value: null }
  | { kind: 'reference'; value: string }

export type JavaScriptDeclarationKind = 'var' | 'let' | 'const' | 'param' | 'function'

export interface JavaScriptBinding {
  name: string
  declaration: JavaScriptDeclarationKind
  mutable: boolean
  line: number
  value: JavaScriptValue
}

export type JavaScriptScopeKind = 'global' | 'function'

export interface JavaScriptScopeRecord {
  id: string
  kind: JavaScriptScopeKind
  name: string
  bindings: Record<string, JavaScriptBinding>
}

export type JavaScriptExecutionContextKind = 'global' | 'function'

export interface JavaScriptExecutionContext {
  id: string
  kind: JavaScriptExecutionContextKind
  name: string
  line: number
  activeLine: number
  scopeIds: string[]
}

export interface JavaScriptHeapObject {
  kind: 'object'
  id: string
  label: string
  size: number
  properties: Record<string, JavaScriptValue>
}

export interface JavaScriptHeapArray {
  kind: 'array'
  id: string
  label: string
  size: number
  elements: JavaScriptValue[]
  properties: Record<string, JavaScriptValue>
}

export interface JavaScriptHeapFunction {
  kind: 'function'
  id: string
  name: string
  params: string[]
  line: number
  size: number
  closureScopeIds: string[]
}

export type JavaScriptHeapEntry = JavaScriptHeapObject | JavaScriptHeapArray | JavaScriptHeapFunction

export interface JavaScriptReferenceEdge {
  fromKind: 'scope' | 'heap'
  fromId: string
  fromLabel: string
  slot: string
  toId: string
}

export interface JavaScriptState {
  callStack: JavaScriptExecutionContext[]
  scopes: Record<string, JavaScriptScopeRecord>
  heap: {
    entries: Record<string, JavaScriptHeapEntry>
  }
  activeContextId: string | null
  counters: {
    context: number
    scope: number
    object: number
    array: number
    function: number
  }
  references: JavaScriptReferenceEdge[]
}
