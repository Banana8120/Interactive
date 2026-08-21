/**
 * MySQL 模拟引擎 —— 纯浏览器内存模拟，不连接真实数据库。
 *
 * 覆盖常用 SQL 动作，并让右侧数据面板能实时反映：
 * 数据库、数据表、字段、行数据与当前 USE 的数据库。
 */

import type {
  MySqlColumn,
  MySqlDatabase,
  MySqlRow,
  MySqlState,
  MySqlTable,
  MySqlValue
} from '@/types'

export type MySqlResultType = 'output' | 'error' | 'clear' | 'empty'

export interface MySqlResult {
  type: MySqlResultType
  lines: string[]
  delay?: number
}

export const MYSQL_VERSION = 'mysql  Ver 8.0.36 for Linux on x86_64 (MySQL Community Server - GPL)'

const STORAGE_KEY_PREFIX = 'mysql-sim-state-v1'
const SYSTEM_DATABASES = ['information_schema', 'mysql']

function createDatabase(name: string, system = false): MySqlDatabase {
  return { name, tables: {}, system }
}

function createState(): MySqlState {
  return {
    connected: true,
    currentDatabase: null,
    databases: {
      information_schema: createDatabase('information_schema', true),
      mysql: createDatabase('mysql', true)
    },
    history: []
  }
}

let state: MySqlState = createState()

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function executeMySqlCommand(rawInput: string): MySqlResult {
  const input = String(rawInput || '').trim()
  if (!input) return { type: 'empty', lines: [] }

  state.history.push(input)
  if (state.history.length > 80) state.history.splice(0, state.history.length - 80)

  const lower = input.toLowerCase()
  if (lower === 'clear') return { type: 'clear', lines: [] }
  if (lower === 'help' || lower === '\\h') return mysqlHelp()
  if (lower === 'mysql --version' || lower === 'mysql -v' || lower === 'mysql version') {
    return { type: 'output', lines: [MYSQL_VERSION] }
  }
  if (/^mysql(\s|$)/i.test(input)) return connectCommand(input)
  if (lower === 'exit' || lower === 'quit' || lower === '\\q') {
    state.connected = false
    return { type: 'output', lines: ['Bye'] }
  }

  if (!state.connected) {
    return {
      type: 'error',
      lines: [
        'ERROR 2002 (HY000): 未连接到 MySQL 客户端。',
        '提示：输入 mysql -u root -p 重新进入模拟 MySQL。'
      ]
    }
  }

  return runSql(input)
}

export function getMySqlState(): MySqlState {
  return state
}

export function resetMySqlEnvironment(): MySqlState {
  state = createState()
  return state
}

function storageKey(workspaceId: string) {
  return `${STORAGE_KEY_PREFIX}-${workspaceId}`
}

export function saveMySqlState(workspaceId: string): boolean {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(state))
    return true
  } catch (e) {
    return false
  }
}

export function loadMySqlState(workspaceId: string): boolean {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return false
    const saved = JSON.parse(raw) as Partial<MySqlState>
    if (saved && typeof saved === 'object' && saved.databases) {
      state = normalizeSavedState(saved)
      return true
    }
    return false
  } catch (e) {
    return false
  }
}

export function clearMySqlState(workspaceId: string): boolean {
  if (!workspaceId) return false
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.removeItem(storageKey(workspaceId))
    return true
  } catch (e) {
    return false
  }
}

function normalizeSavedState(saved: Partial<MySqlState>): MySqlState {
  const next = createState()
  next.connected = saved.connected ?? true
  next.currentDatabase = saved.currentDatabase || null
  next.history = Array.isArray(saved.history) ? saved.history.slice(-80) : []
  next.databases = { ...next.databases }

  for (const [name, db] of Object.entries(saved.databases || {})) {
    if (!db || typeof db !== 'object') continue
    const dbName = normalizeIdentifier(name)
    next.databases[dbName] = {
      name: dbName,
      system: SYSTEM_DATABASES.includes(dbName) || !!db.system,
      tables: {}
    }
    for (const [tableName, table] of Object.entries(db.tables || {})) {
      if (!table || typeof table !== 'object') continue
      const normalized = normalizeIdentifier(tableName)
      next.databases[dbName].tables[normalized] = {
        name: normalized,
        columns: Array.isArray(table.columns) ? table.columns : [],
        rows: Array.isArray(table.rows) ? table.rows : [],
        autoIncrement: Number(table.autoIncrement) || 1
      }
    }
  }

  if (next.currentDatabase && !next.databases[next.currentDatabase]) {
    next.currentDatabase = null
  }
  return next
}

// ---------------------------------------------------------------------------
// SQL 分发
// ---------------------------------------------------------------------------

function connectCommand(input: string): MySqlResult {
  if (!/^mysql(?:\s|$)/i.test(input)) {
    return { type: 'error', lines: [`bash: ${input.split(/\s+/)[0]}: command not found`] }
  }
  state.connected = true
  return {
    type: 'output',
    lines: [
      'Welcome to the MySQL monitor. Commands end with ; or \\g.',
      `Your MySQL connection id is ${Math.floor(Math.random() * 900) + 100}`,
      'Server version: 8.0.36 MySQL Community Server - GPL',
      '',
      'Type "help" or "\\h" for help. Type "\\q" to clear the current input statement.',
      '提示：这是浏览器内的教学模拟环境，可以直接输入 SHOW DATABASES; 开始。'
    ]
  }
}

function runSql(raw: string): MySqlResult {
  const sql = trimSql(raw)
  if (!sql) return { type: 'empty', lines: [] }

  if (/^show\s+databases$/i.test(sql)) return showDatabases()
  if (/^show\s+tables$/i.test(sql)) return showTables()
  if (/^select\s+database\s*\(\s*\)$/i.test(sql)) return selectDatabase()
  if (/^create\s+database\s+/i.test(sql)) return createDatabaseSql(sql)
  if (/^drop\s+database\s+/i.test(sql)) return dropDatabaseSql(sql)
  if (/^use\s+/i.test(sql)) return useDatabase(sql)
  if (/^create\s+table\s+/i.test(sql)) return createTableSql(sql)
  if (/^(desc|describe)\s+/i.test(sql)) return describeTableSql(sql)
  if (/^insert\s+into\s+/i.test(sql)) return insertSql(sql)
  if (/^select\s+/i.test(sql)) return selectSql(sql)
  if (/^update\s+/i.test(sql)) return updateSql(sql)
  if (/^delete\s+from\s+/i.test(sql)) return deleteSql(sql)
  if (/^alter\s+table\s+/i.test(sql)) return alterTableSql(sql)
  if (/^drop\s+table\s+/i.test(sql)) return dropTableSql(sql)
  if (/^truncate\s+table\s+/i.test(sql)) return truncateTableSql(sql)

  return {
    type: 'error',
    lines: [
      `ERROR 1064 (42000): 当前教学环境暂不支持这条 SQL：${sql}`,
      '已支持：SHOW / CREATE DATABASE / USE / CREATE TABLE / DESC / INSERT / SELECT / UPDATE / DELETE / ALTER TABLE ADD / DROP / TRUNCATE。',
      '输入 help 查看示例。'
    ]
  }
}

function showDatabases(): MySqlResult {
  const rows = Object.keys(state.databases)
    .sort()
    .map((name) => ({ Database: name }))
  return resultTable(['Database'], rows, `${rows.length} rows in set (0.00 sec)`)
}

function showTables(): MySqlResult {
  const db = ensureCurrentDb()
  if ('error' in db) return db.error
  const header = `Tables_in_${db.database.name}`
  const rows = Object.keys(db.database.tables)
    .sort()
    .map((name) => ({ [header]: name }))
  if (!rows.length) return { type: 'output', lines: ['Empty set (0.00 sec)'] }
  return resultTable([header], rows, `${rows.length} rows in set (0.00 sec)`)
}

function selectDatabase(): MySqlResult {
  return resultTable(['DATABASE()'], [{ 'DATABASE()': state.currentDatabase || null }], '1 row in set (0.00 sec)')
}

function createDatabaseSql(sql: string): MySqlResult {
  const m = sql.match(/^create\s+database\s+(if\s+not\s+exists\s+)?(.+)$/i)
  if (!m) return syntaxError('CREATE DATABASE shop;')
  const ifNotExists = !!m[1]
  const name = normalizeIdentifier(m[2])
  if (!name) return syntaxError('CREATE DATABASE shop;')
  if (state.databases[name]) {
    if (ifNotExists) return { type: 'output', lines: ['Query OK, 0 rows affected, 1 warning (0.00 sec)'] }
    return { type: 'error', lines: [`ERROR 1007 (HY000): Can't create database '${name}'; database exists`] }
  }
  state.databases[name] = createDatabase(name)
  return { type: 'output', lines: ['Query OK, 1 row affected (0.01 sec)', `✅ 数据库 ${name} 已创建。下一步可以执行 USE ${name};`] }
}

function dropDatabaseSql(sql: string): MySqlResult {
  const m = sql.match(/^drop\s+database\s+(if\s+exists\s+)?(.+)$/i)
  if (!m) return syntaxError('DROP DATABASE shop;')
  const ifExists = !!m[1]
  const name = normalizeIdentifier(m[2])
  const db = state.databases[name]
  if (!db) {
    if (ifExists) return { type: 'output', lines: ['Query OK, 0 rows affected, 1 warning (0.00 sec)'] }
    return { type: 'error', lines: [`ERROR 1008 (HY000): Can't drop database '${name}'; database doesn't exist`] }
  }
  if (db.system) return { type: 'error', lines: [`ERROR 1010 (HY000): 系统库 ${name} 在教学环境中不可删除。`] }
  delete state.databases[name]
  if (state.currentDatabase === name) state.currentDatabase = null
  return { type: 'output', lines: ['Query OK, 1 row affected (0.01 sec)'] }
}

function useDatabase(sql: string): MySqlResult {
  const m = sql.match(/^use\s+(.+)$/i)
  if (!m) return syntaxError('USE shop;')
  const name = normalizeIdentifier(m[1])
  if (!state.databases[name]) {
    return { type: 'error', lines: [`ERROR 1049 (42000): Unknown database '${name}'`] }
  }
  state.currentDatabase = name
  return { type: 'output', lines: ['Database changed', `✅ 当前数据库已切换为 ${name}。`] }
}

function createTableSql(sql: string): MySqlResult {
  const m = sql.match(/^create\s+table\s+(if\s+not\s+exists\s+)?([`\w.]+)\s*\(([\s\S]+)\)$/i)
  if (!m) return syntaxError('CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50));')
  const ifNotExists = !!m[1]
  const ref = parseTableRef(m[2])
  const dbResult = getDbForTable(ref)
  if ('error' in dbResult) return dbResult.error
  const tableName = ref.table
  if (dbResult.database.tables[tableName]) {
    if (ifNotExists) return { type: 'output', lines: ['Query OK, 0 rows affected, 1 warning (0.00 sec)'] }
    return { type: 'error', lines: [`ERROR 1050 (42S01): Table '${tableName}' already exists`] }
  }

  const columns = parseColumnDefinitions(m[3])
  if ('error' in columns) return columns.error
  if (!columns.columns.length) return syntaxError('CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50));')

  dbResult.database.tables[tableName] = {
    name: tableName,
    columns: columns.columns,
    rows: [],
    autoIncrement: 1
  }
  return {
    type: 'output',
    lines: [
      'Query OK, 0 rows affected (0.02 sec)',
      `✅ 表 ${tableName} 已创建，共 ${columns.columns.length} 个字段。执行 DESC ${tableName}; 查看结构。`
    ]
  }
}

function describeTableSql(sql: string): MySqlResult {
  const m = sql.match(/^(desc|describe)\s+([`\w.]+)$/i)
  if (!m) return syntaxError('DESC users;')
  const tableResult = getTableByRef(parseTableRef(m[2]))
  if ('error' in tableResult) return tableResult.error
  const rows = tableResult.table.columns.map((c) => ({
    Field: c.name,
    Type: c.type.toLowerCase(),
    Null: c.nullable ? 'YES' : 'NO',
    Key: c.primaryKey ? 'PRI' : '',
    Default: c.defaultValue ?? null,
    Extra: c.autoIncrement ? 'auto_increment' : ''
  }))
  return resultTable(['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'], rows, `${rows.length} rows in set (0.00 sec)`)
}

function insertSql(sql: string): MySqlResult {
  const m = sql.match(/^insert\s+into\s+([`\w.]+)\s*(?:\(([\s\S]*?)\))?\s+values\s+([\s\S]+)$/i)
  if (!m) return syntaxError("INSERT INTO users (name, age) VALUES ('Ada', 18);")
  const tableResult = getTableByRef(parseTableRef(m[1]))
  if ('error' in tableResult) return tableResult.error

  const table = tableResult.table
  const columns = m[2]
    ? splitCsvRespectingSyntax(m[2]).map(normalizeIdentifier)
    : table.columns.map((c) => c.name)

  const unknown = columns.find((name) => !table.columns.some((c) => c.name === name))
  if (unknown) return { type: 'error', lines: [`ERROR 1054 (42S22): Unknown column '${unknown}' in 'field list'`] }

  const groups = parseValueGroups(m[3])
  if ('error' in groups) return groups.error

  const pendingRows: MySqlRow[] = []
  for (const values of groups.groups) {
    if (values.length !== columns.length) {
      return { type: 'error', lines: ['ERROR 1136 (21S01): Column count does not match value count at row 1'] }
    }
    const row = createDefaultRow(table)
    for (let i = 0; i < columns.length; i++) {
      row[columns[i]] = parseValue(values[i])
    }
    applyAutoIncrement(table, row)
    const validation = validateRow(table, row)
    if (validation) return validation
    const primary = table.columns.find((c) => c.primaryKey)
    if (primary && pendingRows.some((r) => r[primary.name] === row[primary.name])) {
      return { type: 'error', lines: [`ERROR 1062 (23000): Duplicate entry '${formatValue(row[primary.name])}' for key 'PRIMARY'`] }
    }
    pendingRows.push(row)
  }

  for (const row of pendingRows) {
    table.rows.push(row)
  }

  const count = pendingRows.length
  return {
    type: 'output',
    lines: [
      `Query OK, ${count} row${count === 1 ? '' : 's'} affected (0.01 sec)`,
      `Records: ${count}  Duplicates: 0  Warnings: 0`,
      `✅ 已向 ${table.name} 插入 ${count} 行数据，右侧数据面板会同步更新。`
    ]
  }
}

function selectSql(sql: string): MySqlResult {
  const m = sql.match(/^select\s+([\s\S]+?)\s+from\s+([`\w.]+)([\s\S]*)$/i)
  if (!m) return syntaxError('SELECT * FROM users;')
  const fieldsText = m[1].trim()
  const tableResult = getTableByRef(parseTableRef(m[2]))
  if ('error' in tableResult) return tableResult.error

  const parsedTail = parseSelectTail(m[3] || '')
  if ('error' in parsedTail) return parsedTail.error

  const table = tableResult.table
  const fields = fieldsText === '*'
    ? table.columns.map((c) => c.name)
    : splitCsvRespectingSyntax(fieldsText).map(normalizeIdentifier)

  const unknown = fields.find((name) => !table.columns.some((c) => c.name === name))
  if (unknown) return { type: 'error', lines: [`ERROR 1054 (42S22): Unknown column '${unknown}' in 'field list'`] }

  let rows = table.rows.filter((row) => matchesWhere(row, parsedTail.where))
  if (parsedTail.orderBy) {
    rows = [...rows].sort((a, b) => compareValues(a[parsedTail.orderBy!], b[parsedTail.orderBy!]))
    if (parsedTail.orderDir === 'desc') rows.reverse()
  }
  if (typeof parsedTail.limit === 'number') rows = rows.slice(0, parsedTail.limit)

  if (!rows.length) return { type: 'output', lines: ['Empty set (0.00 sec)'] }
  const resultRows = rows.map((row) => {
    const out: Record<string, MySqlValue> = {}
    for (const field of fields) out[field] = row[field] ?? null
    return out
  })
  return resultTable(fields, resultRows, `${resultRows.length} row${resultRows.length === 1 ? '' : 's'} in set (0.00 sec)`)
}

function updateSql(sql: string): MySqlResult {
  const m = sql.match(/^update\s+([`\w.]+)\s+set\s+([\s\S]+?)(?:\s+where\s+([\s\S]+))?$/i)
  if (!m) return syntaxError("UPDATE users SET age = 20 WHERE name = 'Ada';")
  const tableResult = getTableByRef(parseTableRef(m[1]))
  if ('error' in tableResult) return tableResult.error

  const assignments = parseAssignments(m[2])
  if ('error' in assignments) return assignments.error

  const table = tableResult.table
  for (const key of Object.keys(assignments.values)) {
    if (!table.columns.some((c) => c.name === key)) {
      return { type: 'error', lines: [`ERROR 1054 (42S22): Unknown column '${key}' in 'field list'`] }
    }
  }

  let affected = 0
  for (const row of table.rows) {
    if (!matchesWhere(row, m[3] || '')) continue
    const next = { ...row, ...assignments.values }
    const validation = validateRow(table, next, row)
    if (validation) return validation
    Object.assign(row, assignments.values)
    affected++
  }

  return { type: 'output', lines: [`Query OK, ${affected} rows affected (0.01 sec)`, 'Rows matched: ' + affected + '  Changed: ' + affected + '  Warnings: 0'] }
}

function deleteSql(sql: string): MySqlResult {
  const m = sql.match(/^delete\s+from\s+([`\w.]+)(?:\s+where\s+([\s\S]+))?$/i)
  if (!m) return syntaxError('DELETE FROM users WHERE id = 1;')
  const tableResult = getTableByRef(parseTableRef(m[1]))
  if ('error' in tableResult) return tableResult.error

  const before = tableResult.table.rows.length
  tableResult.table.rows = tableResult.table.rows.filter((row) => !matchesWhere(row, m[2] || ''))
  const affected = before - tableResult.table.rows.length
  return { type: 'output', lines: [`Query OK, ${affected} rows affected (0.01 sec)`] }
}

function alterTableSql(sql: string): MySqlResult {
  const m = sql.match(/^alter\s+table\s+([`\w.]+)\s+add\s+(?:column\s+)?([\s\S]+)$/i)
  if (!m) return syntaxError('ALTER TABLE users ADD COLUMN email VARCHAR(80);')
  const tableResult = getTableByRef(parseTableRef(m[1]))
  if ('error' in tableResult) return tableResult.error

  const parsed = parseColumnDefinitions(m[2])
  if ('error' in parsed) return parsed.error
  if (parsed.columns.length !== 1) {
    return { type: 'error', lines: ['ERROR 1064 (42000): ALTER TABLE ADD 一次请添加一个字段。'] }
  }
  const column = parsed.columns[0]
  const table = tableResult.table
  if (table.columns.some((c) => c.name === column.name)) {
    return { type: 'error', lines: [`ERROR 1060 (42S21): Duplicate column name '${column.name}'`] }
  }
  table.columns.push(column)
  for (const row of table.rows) {
    row[column.name] = column.defaultValue ?? null
  }
  return { type: 'output', lines: ['Query OK, 0 rows affected (0.03 sec)', `✅ 已为 ${table.name} 添加字段 ${column.name}。`] }
}

function dropTableSql(sql: string): MySqlResult {
  const m = sql.match(/^drop\s+table\s+(if\s+exists\s+)?([`\w.]+)$/i)
  if (!m) return syntaxError('DROP TABLE users;')
  const ref = parseTableRef(m[2])
  const dbResult = getDbForTable(ref)
  if ('error' in dbResult) return dbResult.error
  if (!dbResult.database.tables[ref.table]) {
    if (m[1]) return { type: 'output', lines: ['Query OK, 0 rows affected, 1 warning (0.00 sec)'] }
    return { type: 'error', lines: [`ERROR 1051 (42S02): Unknown table '${ref.table}'`] }
  }
  delete dbResult.database.tables[ref.table]
  return { type: 'output', lines: ['Query OK, 0 rows affected (0.02 sec)'] }
}

function truncateTableSql(sql: string): MySqlResult {
  const m = sql.match(/^truncate\s+table\s+([`\w.]+)$/i)
  if (!m) return syntaxError('TRUNCATE TABLE users;')
  const tableResult = getTableByRef(parseTableRef(m[1]))
  if ('error' in tableResult) return tableResult.error
  tableResult.table.rows = []
  tableResult.table.autoIncrement = 1
  return { type: 'output', lines: ['Query OK, 0 rows affected (0.01 sec)', `✅ ${tableResult.table.name} 已清空，AUTO_INCREMENT 回到 1。`] }
}

// ---------------------------------------------------------------------------
// 解析与状态工具
// ---------------------------------------------------------------------------

function trimSql(raw: string): string {
  return raw.trim().replace(/;+$/g, '').trim()
}

function syntaxError(example: string): MySqlResult {
  return {
    type: 'error',
    lines: [
      'ERROR 1064 (42000): SQL 语法暂未识别。',
      `示例：${example}`
    ]
  }
}

function normalizeIdentifier(value: string | undefined): string {
  return String(value || '')
    .trim()
    .replace(/;+$/g, '')
    .replace(/^[`"']|[`"']$/g, '')
    .toLowerCase()
}

function parseTableRef(raw: string): { db: string | null; table: string } {
  const parts = raw.split('.').map(normalizeIdentifier).filter(Boolean)
  if (parts.length >= 2) return { db: parts[0], table: parts[1] }
  return { db: null, table: parts[0] || '' }
}

function ensureCurrentDb(): { database: MySqlDatabase } | { error: MySqlResult } {
  if (!state.currentDatabase) {
    return { error: { type: 'error', lines: ['ERROR 1046 (3D000): No database selected', '提示：先执行 USE 数据库名;'] } }
  }
  const database = state.databases[state.currentDatabase]
  if (!database) return { error: { type: 'error', lines: [`ERROR 1049 (42000): Unknown database '${state.currentDatabase}'`] } }
  return { database }
}

function getDbForTable(ref: { db: string | null; table: string }): { database: MySqlDatabase } | { error: MySqlResult } {
  const dbName = ref.db || state.currentDatabase
  if (!dbName) return { error: { type: 'error', lines: ['ERROR 1046 (3D000): No database selected', '提示：先执行 USE shop; 再操作表。'] } }
  const database = state.databases[dbName]
  if (!database) return { error: { type: 'error', lines: [`ERROR 1049 (42000): Unknown database '${dbName}'`] } }
  if (database.system && !ref.db) {
    return { error: { type: 'error', lines: [`ERROR 1044 (42000): 当前系统库 ${dbName} 不适合创建业务表，请先 CREATE DATABASE shop; 并 USE shop;`] } }
  }
  return { database }
}

function getTableByRef(ref: { db: string | null; table: string }): { database: MySqlDatabase; table: MySqlTable } | { error: MySqlResult } {
  const dbResult = getDbForTable(ref)
  if ('error' in dbResult) return dbResult
  const table = dbResult.database.tables[ref.table]
  if (!table) return { error: { type: 'error', lines: [`ERROR 1146 (42S02): Table '${dbResult.database.name}.${ref.table}' doesn't exist`] } }
  return { database: dbResult.database, table }
}

function splitCsvRespectingSyntax(text: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: string | null = null
  let depth = 0

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const prev = text[i - 1]
    if ((ch === '\'' || ch === '"') && prev !== '\\') {
      quote = quote === ch ? null : quote || ch
      current += ch
      continue
    }
    if (!quote) {
      if (ch === '(') depth++
      if (ch === ')') depth = Math.max(0, depth - 1)
      if (ch === ',' && depth === 0) {
        parts.push(current.trim())
        current = ''
        continue
      }
    }
    current += ch
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function parseColumnDefinitions(text: string): { columns: MySqlColumn[] } | { error: MySqlResult } {
  const definitions = splitCsvRespectingSyntax(text)
  const columns: MySqlColumn[] = []
  const tablePrimaryKeys: string[] = []

  for (const def of definitions) {
    const pk = def.match(/^primary\s+key\s*\((.+)\)$/i)
    if (pk) {
      tablePrimaryKeys.push(...splitCsvRespectingSyntax(pk[1]).map(normalizeIdentifier))
      continue
    }

    const nameMatch = def.match(/^(`[^`]+`|[a-zA-Z_][\w]*)\s+(.+)$/)
    if (!nameMatch) return { error: syntaxError('CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50));') }

    const name = normalizeIdentifier(nameMatch[1])
    const rest = nameMatch[2].trim()
    const constraintIndex = searchConstraintStart(rest)
    const typeText = (constraintIndex === -1 ? rest : rest.slice(0, constraintIndex)).trim()
    const constraints = constraintIndex === -1 ? '' : rest.slice(constraintIndex).trim()
    if (!typeText) return { error: syntaxError('CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50));') }

    const primaryKey = /\bprimary\s+key\b/i.test(constraints)
    const autoIncrement = /\bauto_increment\b/i.test(constraints)
    const nullable = !primaryKey && !/\bnot\s+null\b/i.test(constraints)
    const defaultValue = parseDefaultValue(constraints)

    columns.push({
      name,
      type: typeText.toUpperCase(),
      nullable,
      primaryKey,
      autoIncrement,
      defaultValue
    })
  }

  for (const key of tablePrimaryKeys) {
    const column = columns.find((c) => c.name === key)
    if (column) {
      column.primaryKey = true
      column.nullable = false
    }
  }

  const duplicate = columns.find((c, index) => columns.findIndex((other) => other.name === c.name) !== index)
  if (duplicate) return { error: { type: 'error', lines: [`ERROR 1060 (42S21): Duplicate column name '${duplicate.name}'`] } }

  return { columns }
}

function searchConstraintStart(text: string): number {
  const match = text.match(/\s+(primary\s+key|not\s+null|null|auto_increment|default|unique|comment|key)\b/i)
  return match?.index ?? -1
}

function parseDefaultValue(constraints: string): MySqlValue | undefined {
  const m = constraints.match(/\bdefault\s+('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^\s]+)/i)
  return m ? parseValue(m[1]) : undefined
}

function createDefaultRow(table: MySqlTable): MySqlRow {
  const row: MySqlRow = {}
  for (const column of table.columns) {
    row[column.name] = column.autoIncrement ? null : column.defaultValue ?? null
  }
  return row
}

function applyAutoIncrement(table: MySqlTable, row: MySqlRow) {
  const column = table.columns.find((c) => c.autoIncrement)
  if (!column) return
  const raw = row[column.name]
  if (raw === null || raw === undefined || raw === '') {
    row[column.name] = table.autoIncrement++
  } else if (typeof raw === 'number' && raw >= table.autoIncrement) {
    table.autoIncrement = raw + 1
  }
}

function validateRow(table: MySqlTable, row: MySqlRow, original?: MySqlRow): MySqlResult | null {
  for (const column of table.columns) {
    if (!column.nullable && (row[column.name] === null || row[column.name] === undefined || row[column.name] === '')) {
      return { type: 'error', lines: [`ERROR 1048 (23000): Column '${column.name}' cannot be null`] }
    }
  }

  const primary = table.columns.find((c) => c.primaryKey)
  if (primary) {
    const nextValue = row[primary.name]
    const duplicate = table.rows.some((r) => r !== original && r[primary.name] === nextValue)
    if (duplicate) {
      return { type: 'error', lines: [`ERROR 1062 (23000): Duplicate entry '${formatValue(nextValue)}' for key 'PRIMARY'`] }
    }
  }
  return null
}

function parseValue(rawValue: string): MySqlValue {
  const raw = rawValue.trim()
  if (/^null$/i.test(raw)) return null
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"')
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return raw.replace(/^[`"']|[`"']$/g, '')
}

function parseValueGroups(text: string): { groups: string[][] } | { error: MySqlResult } {
  const groups: string[][] = []
  let quote: string | null = null
  let depth = 0
  let current = ''

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const prev = text[i - 1]
    if ((ch === '\'' || ch === '"') && prev !== '\\') {
      quote = quote === ch ? null : quote || ch
      if (depth > 0) current += ch
      continue
    }
    if (!quote && ch === '(') {
      if (depth === 0) current = ''
      else current += ch
      depth++
      continue
    }
    if (!quote && ch === ')') {
      depth--
      if (depth === 0) {
        groups.push(splitCsvRespectingSyntax(current))
        current = ''
      } else {
        current += ch
      }
      continue
    }
    if (depth > 0) current += ch
  }

  if (quote || depth !== 0 || !groups.length) {
    return { error: syntaxError("INSERT INTO users (name, age) VALUES ('Ada', 18);") }
  }
  return { groups }
}

interface SelectTail {
  where: string
  orderBy: string | null
  orderDir: 'asc' | 'desc'
  limit: number | null
}

function parseSelectTail(rawTail: string): SelectTail | { error: MySqlResult } {
  let tail = rawTail.trim()
  const parsed: SelectTail = { where: '', orderBy: null, orderDir: 'asc', limit: null }

  const limitMatch = tail.match(/\s+limit\s+(\d+)\s*$/i)
  if (limitMatch) {
    parsed.limit = Number(limitMatch[1])
    tail = tail.slice(0, limitMatch.index).trim()
  }

  const orderMatch = tail.match(/\s+order\s+by\s+([`\w]+)(?:\s+(asc|desc))?\s*$/i)
  if (orderMatch) {
    parsed.orderBy = normalizeIdentifier(orderMatch[1])
    parsed.orderDir = (orderMatch[2]?.toLowerCase() as 'asc' | 'desc') || 'asc'
    tail = tail.slice(0, orderMatch.index).trim()
  }

  const whereMatch = tail.match(/^where\s+([\s\S]+)$/i)
  if (whereMatch) parsed.where = whereMatch[1].trim()
  else if (tail) return { error: syntaxError("SELECT * FROM users WHERE age >= 18 ORDER BY id DESC LIMIT 5;") }

  return parsed
}

function parseAssignments(text: string): { values: Record<string, MySqlValue> } | { error: MySqlResult } {
  const values: Record<string, MySqlValue> = {}
  const items = splitCsvRespectingSyntax(text)
  for (const item of items) {
    const m = item.match(/^([`\w]+)\s*=\s*([\s\S]+)$/)
    if (!m) return { error: syntaxError("UPDATE users SET age = 20 WHERE id = 1;") }
    values[normalizeIdentifier(m[1])] = parseValue(m[2])
  }
  return { values }
}

function matchesWhere(row: MySqlRow, whereText: string): boolean {
  if (!whereText.trim()) return true
  const conditions = splitByAnd(whereText)
  for (const condition of conditions) {
    const m = condition.match(/^([`\w]+)\s*(=|!=|<>|>=|<=|>|<|like)\s*([\s\S]+)$/i)
    if (!m) return false
    const field = normalizeIdentifier(m[1])
    const op = m[2].toLowerCase()
    const right = parseValue(m[3])
    const left = row[field] ?? null
    if (!compareCondition(left, op, right)) return false
  }
  return true
}

function splitByAnd(text: string): string[] {
  const parts: string[] = []
  let quote: string | null = null
  let current = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const prev = text[i - 1]
    if ((ch === '\'' || ch === '"') && prev !== '\\') {
      quote = quote === ch ? null : quote || ch
      current += ch
      continue
    }
    if (!quote && /^\s+and\s+/i.test(text.slice(i))) {
      parts.push(current.trim())
      const skip = text.slice(i).match(/^\s+and\s+/i)?.[0].length || 0
      i += skip - 1
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function compareCondition(left: MySqlValue, op: string, right: MySqlValue): boolean {
  if (op === 'like') {
    const pattern = String(right ?? '').replace(/%/g, '.*')
    return new RegExp('^' + pattern + '$', 'i').test(String(left ?? ''))
  }
  const cmp = compareValues(left, right)
  if (op === '=') return left === right || String(left) === String(right)
  if (op === '!=' || op === '<>') return !(left === right || String(left) === String(right))
  if (op === '>') return cmp > 0
  if (op === '<') return cmp < 0
  if (op === '>=') return cmp >= 0
  if (op === '<=') return cmp <= 0
  return false
}

function compareValues(a: MySqlValue, b: MySqlValue): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'zh-CN')
}

function formatValue(value: MySqlValue): string {
  return value === null || value === undefined ? 'NULL' : String(value)
}

function resultTable(headers: string[], rows: Record<string, MySqlValue>[], footer: string): MySqlResult {
  return { type: 'output', lines: [...formatRows(headers, rows), footer] }
}

function formatRows(headers: string[], rows: Record<string, MySqlValue>[]): string[] {
  const widths = headers.map((h) => Math.max(displayWidth(h), ...rows.map((r) => displayWidth(formatValue(r[h])))))
  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+'
  const line = (values: string[]) => '| ' + values.map((v, i) => padDisplay(v, widths[i])).join(' | ') + ' |'
  const lines = [sep, line(headers), sep]
  for (const row of rows) lines.push(line(headers.map((h) => formatValue(row[h]))))
  lines.push(sep)
  return lines
}

function displayWidth(text: string): number {
  return [...text].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 2 : 1), 0)
}

function padDisplay(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)))
}

function mysqlHelp(): MySqlResult {
  return {
    type: 'output',
    lines: [
      'MySQL 教学模拟环境支持：',
      '',
      '  mysql --version / mysql -u root -p       查看版本或进入客户端',
      '  SHOW DATABASES;                         查看数据库',
      '  CREATE DATABASE shop; / DROP DATABASE shop;   创建或删除数据库',
      '  USE shop; / SELECT DATABASE();          切换或查看当前数据库',
      '  CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50));',
      '  SHOW TABLES; / DESC users;              查看表和字段结构',
      "  INSERT INTO users (name, age) VALUES ('Ada', 18);",
      '  SELECT * FROM users WHERE age >= 18 ORDER BY id DESC LIMIT 5;',
      '  UPDATE users SET age = 20 WHERE id = 1;',
      '  DELETE FROM users WHERE id = 1;',
      '  ALTER TABLE users ADD COLUMN email VARCHAR(80);',
      '  TRUNCATE TABLE users; / DROP TABLE users;',
      '',
      '其他：clear 清屏，exit/quit 退出，↑↓ 历史，Tab 补全。'
    ]
  }
}
