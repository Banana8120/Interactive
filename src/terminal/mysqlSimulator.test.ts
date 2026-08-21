import { beforeEach, describe, expect, it } from 'vitest'
import { executeMySqlCommand, getMySqlState, resetMySqlEnvironment } from './mysqlSimulator'

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

describe('mysql simulator regression coverage', () => {
  beforeEach(() => {
    resetMySqlEnvironment()
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
})
