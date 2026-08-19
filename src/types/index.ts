/* ================= Docker 类型 ================= */

export interface ContentBlock {
  type: string
  html?: string
  lang?: string
  code?: string
  title?: string
  text?: string
  headers?: string[]
  rows?: string[][]
  items?: string[]
  // practice 类型内容块的可选字段
  desc?: string
  check?: (env?: any) => boolean
  successMsg?: string
  hints?: string[]
  commands?: string[]
  hideCopy?: boolean
}

export interface Quiz {
  question: string
  options: string[]
  answer: number
  explain: string
}

export interface Practice {
  title: string
  desc: string
  commands: string[]
  // 校验函数：传入当前模拟环境，返回是否通过（env 可省略，兼容无参写法）
  check: (env?: DockerEnv) => boolean
  successMsg?: string
  hints?: string[]
}

export interface TerminalConfig {
  enabled: boolean
  task: string
  commands: string[]
}

export interface Lesson {
  id: string
  title: string
  concept: string
  content: ContentBlock[]
  terminal?: TerminalConfig
  practice?: Practice
  quiz?: Quiz[]
}

export interface Chapter {
  id: string
  index: string
  title: string
  icon: string
  color: string
  minutes: number
  lessonsCount: number
  description: string
  lessons: Lesson[]
}

export interface CourseStats {
  chapters: number
  lessons: number
  practices: number
  quizzes: number
}

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

/* ================= Git 类型 ================= */

export interface GitPractice {
  title: string
  desc: string
  commands: string[]
  // 校验函数（Git 练习多为无参写法，内部直接读取 getGitState()）
  check: (env?: GitState) => boolean
  successMsg?: string
  hints?: string[]
}

export interface GitTerminalConfig {
  enabled: boolean
  task: string
  commands: string[]
}

export interface GitQuiz {
  question: string
  options: string[]
  answer: number
  explain: string
}

export interface GitLesson {
  id: string
  title: string
  concept: string
  content: ContentBlock[]
  terminal?: GitTerminalConfig
  practice?: GitPractice
  quiz?: GitQuiz[]
}

export interface GitChapter {
  id: string
  index: string
  title: string
  icon: string
  color: string
  minutes: number
  lessonsCount?: number
  description: string
  lessons: GitLesson[]
}

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

/* ================= MySQL 类型 ================= */

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

export interface MySqlPractice {
  title: string
  desc: string
  commands: string[]
  check: (env?: MySqlState) => boolean
  successMsg?: string
  hints: string[]
}

export interface MySqlTerminalConfig {
  enabled: boolean
  task: string
  commands: string[]
}

export interface MySqlQuiz {
  question: string
  options: string[]
  answer: number
  explain: string
}

export interface MySqlLesson {
  id: string
  title: string
  concept: string
  content: ContentBlock[]
  terminal?: MySqlTerminalConfig
  practice?: MySqlPractice
  quiz?: MySqlQuiz[]
}

export interface MySqlChapter {
  id: string
  index: string
  title: string
  icon: string
  color: string
  minutes: number
  lessonsCount?: number
  description: string
  lessons: MySqlLesson[]
}

export interface MySqlCourseStats {
  chapters: number
  lessons: number
  practices: number
  quizzes: number
}
