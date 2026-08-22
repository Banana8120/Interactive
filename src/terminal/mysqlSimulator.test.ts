import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeMySqlCommand, getMySqlState, loadMySqlState, resetMySqlEnvironment, saveMySqlState } from './mysqlSimulator'

const storageValues = new Map<string, string>()
const workspaceId = 'mysql-playground'
const storageKey = `mysql-sim-state-v1-${workspaceId}`

function stubLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key)
  })
}

function sql(input: string) {
  return executeMySqlCommand(input)
}

function output(input: string) {
  return sql(input).lines.join('\n')
}

function setupUsersTable() {
  sql('CREATE DATABASE shop;')
  sql('USE shop;')
  sql('CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50), age INT);')
}

function setupAnalyticsUsersTable() {
  sql('CREATE DATABASE shop;')
  sql('USE shop;')
  sql('CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50), role VARCHAR(20), age INT, score INT);')
  sql("INSERT INTO users (name, role, age, score) VALUES ('Ada', 'member', 18, 100), ('Bob', 'guest', 15, 70), ('Cora', 'member', 21, 90), ('Dee', 'guest', 30, NULL);")
}

describe('mysql simulator regression coverage', () => {
  beforeEach(() => {
    resetMySqlEnvironment()
    storageValues.clear()
    stubLocalStorage()
  })

  it('creates a database, switches to it and creates a table', () => {
    expect(output('CREATE DATABASE shop;')).toContain('数据库 shop 已创建')
    expect(output('USE shop;')).toContain('Database changed')
    expect(output('CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50), age INT);')).toContain('表 users 已创建')

    const state = getMySqlState()
    const table = state.databases.shop.tables.users

    expect(state.currentDatabase).toBe('shop')
    expect(table.columns.map((column) => column.name)).toEqual(['id', 'name', 'age'])
    expect(table.columns[0]).toMatchObject({ name: 'id', primaryKey: true, autoIncrement: true })
    expect(table.autoIncrement).toBe(1)
  })

  it('inserts rows and selects with where, order and limit clauses', () => {
    setupUsersTable()
    sql("INSERT INTO users (name, age) VALUES ('Ada', 18), ('Bob', 15), ('Cora', 21);")

    const state = getMySqlState()
    expect(state.databases.shop.tables.users.rows).toEqual([
      { id: 1, name: 'Ada', age: 18 },
      { id: 2, name: 'Bob', age: 15 },
      { id: 3, name: 'Cora', age: 21 }
    ])

    const selected = output('SELECT name, age FROM users WHERE age >= 18 ORDER BY age DESC LIMIT 1;')
    expect(selected).toContain('Cora')
    expect(selected).toContain('21')
    expect(selected).not.toContain('Ada')
    expect(selected).not.toContain('Bob')
  })

  it('selects count, sum, average, min and max over filtered rows', () => {
    setupAnalyticsUsersTable()

    const selected = output('SELECT COUNT(*), COUNT(score), SUM(score), AVG(score), MIN(age), MAX(age) FROM users WHERE age >= 18;')

    expect(selected).toContain('COUNT(*)')
    expect(selected).toContain('COUNT(score)')
    expect(selected).toContain('SUM(score)')
    expect(selected).toContain('AVG(score)')
    expect(selected).toContain('MIN(age)')
    expect(selected).toContain('MAX(age)')
    expect(selected).toContain('| 3')
    expect(selected).toContain('| 2')
    expect(selected).toContain('| 190')
    expect(selected).toContain('| 95')
    expect(selected).toContain('| 18')
    expect(selected).toContain('| 30')
  })

  it('groups rows and orders by an aggregate expression before applying limit', () => {
    setupAnalyticsUsersTable()

    const selected = output('SELECT role, COUNT(*), AVG(score) FROM users WHERE age >= 15 GROUP BY role ORDER BY AVG(score) DESC LIMIT 1;')

    expect(selected).toContain('role')
    expect(selected).toContain('COUNT(*)')
    expect(selected).toContain('AVG(score)')
    expect(selected).toContain('member')
    expect(selected).toContain('95')
    expect(selected).not.toContain('guest')
  })

  it('supports simple distinct-style GROUP BY without aggregate fields', () => {
    setupAnalyticsUsersTable()

    const selected = output('SELECT role FROM users GROUP BY role ORDER BY role DESC;')

    expect(selected).toContain('member')
    expect(selected).toContain('guest')
    expect(selected.indexOf('member')).toBeLessThan(selected.indexOf('guest'))
  })

  it('reports unsupported aggregate usages clearly', () => {
    setupAnalyticsUsersTable()

    expect(output('SELECT SUM(name) FROM users;')).toContain('只能用于数值字段')
    expect(output('SELECT name, COUNT(*) FROM users;')).toContain('Mixing of GROUP columns')
    expect(output('SELECT role, COUNT(*) FROM users GROUP BY missing;')).toContain("Unknown column 'missing'")
  })

  it('updates, deletes and alters table rows and columns', () => {
    setupUsersTable()
    sql("INSERT INTO users (name, age) VALUES ('Ada', 18), ('Bob', 15);")

    expect(output("UPDATE users SET age = 20 WHERE name = 'Ada';")).toContain('1 rows affected')
    expect(output('DELETE FROM users WHERE age < 18;')).toContain('1 rows affected')
    expect(output('ALTER TABLE users ADD COLUMN email VARCHAR(80);')).toContain('添加字段 email')

    const table = getMySqlState().databases.shop.tables.users
    expect(table.columns.map((column) => column.name)).toEqual(['id', 'name', 'age', 'email'])
    expect(table.rows).toEqual([{ id: 1, name: 'Ada', age: 20, email: null }])
  })

  it('drops tables and resetMySqlEnvironment restores only system databases', () => {
    setupUsersTable()

    expect(output('DROP TABLE users;')).toContain('Query OK')
    expect(getMySqlState().databases.shop.tables.users).toBeUndefined()

    const state = resetMySqlEnvironment()

    expect(state.connected).toBe(true)
    expect(state.currentDatabase).toBeNull()
    expect(Object.keys(state.databases).sort()).toEqual(['information_schema', 'mysql'])
    expect(state.history).toEqual([])
  })

  it('saves MySQL state with a schema version wrapper', () => {
    setupUsersTable()
    sql("INSERT INTO users (name, age) VALUES ('Ada', 18);")

    expect(saveMySqlState(workspaceId)).toBe(true)

    const saved = JSON.parse(storageValues.get(storageKey)!)
    expect(saved.schemaVersion).toBe(1)
    expect(saved.state.currentDatabase).toBe('shop')
    expect(saved.state.databases.shop.tables.users.rows).toEqual([{ id: 1, name: 'Ada', age: 18 }])
  })

  it('loads legacy unversioned MySQL state through the v0 migration', () => {
    storageValues.set(
      storageKey,
      JSON.stringify({
        connected: true,
        currentDatabase: 'shop',
        databases: {
          shop: {
            name: 'shop',
            tables: {
              users: {
                name: 'users',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, primaryKey: true, autoIncrement: true },
                  { name: 'name', type: 'VARCHAR(50)', nullable: true },
                  { name: 'age', type: 'INT', nullable: true }
                ],
                rows: [{ id: 1, name: 'Ada', age: 18 }],
                autoIncrement: 2
              }
            }
          }
        },
        history: ['USE shop;']
      })
    )

    expect(loadMySqlState(workspaceId)).toBe(true)

    const state = getMySqlState()
    expect(state.currentDatabase).toBe('shop')
    expect(Object.keys(state.databases).sort()).toEqual(['information_schema', 'mysql', 'shop'])
    expect(state.databases.shop.tables.users.rows).toEqual([{ id: 1, name: 'Ada', age: 18 }])
    expect(state.history).toEqual(['USE shop;'])
  })

  it('keeps current MySQL state when cached JSON is invalid', () => {
    setupUsersTable()
    storageValues.set(storageKey, '{broken')

    expect(loadMySqlState(workspaceId)).toBe(false)
    expect(getMySqlState().currentDatabase).toBe('shop')
    expect(getMySqlState().databases.shop.tables.users).toBeTruthy()
  })

  it('rejects unsupported MySQL state schema versions', () => {
    setupUsersTable()
    storageValues.set(
      storageKey,
      JSON.stringify({
        schemaVersion: 999,
        state: { currentDatabase: 'future', databases: {} }
      })
    )

    expect(loadMySqlState(workspaceId)).toBe(false)
    expect(getMySqlState().currentDatabase).toBe('shop')
    expect(getMySqlState().databases.shop.tables.users).toBeTruthy()
  })
})
