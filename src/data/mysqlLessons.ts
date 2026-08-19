/**
 * MySQL 课程数据：面向零基础的交互式 SQL 入门。
 *
 * 课程强调符合 MySQL / SQL 标准写法的基本语句，并通过浏览器内模拟器
 * 实时展示数据库、表结构和行数据的变化。
 */

import { getMySqlState } from '@/terminal/mysqlSimulator'
import type { MySqlChapter, MySqlState } from '@/types'

const currentState = (env?: MySqlState) => env || getMySqlState()
const hasDatabase = (name: string, env?: MySqlState) => !!currentState(env).databases[name]
const usingDatabase = (name: string, env?: MySqlState) => currentState(env).currentDatabase === name
const table = (db: string, name: string, env?: MySqlState) => currentState(env).databases[db]?.tables[name]
const hasTable = (db: string, name: string, env?: MySqlState) => !!table(db, name, env)
const hasColumn = (db: string, tableName: string, column: string, env?: MySqlState) =>
  !!table(db, tableName, env)?.columns.some((c) => c.name === column)
const rowCount = (db: string, tableName: string, env?: MySqlState) =>
  table(db, tableName, env)?.rows.length || 0
const hasRow = (db: string, tableName: string, predicate: (row: Record<string, any>) => boolean, env?: MySqlState) =>
  !!table(db, tableName, env)?.rows.some(predicate)
const usedCommand = (needle: string, env?: MySqlState) =>
  currentState(env).history.some((cmd) => cmd.toLowerCase().replace(/;$/, '') === needle.toLowerCase().replace(/;$/, ''))

export const mysqlChapters: MySqlChapter[] = [
  {
    id: 'mysql-intro',
    index: '01',
    title: '认识 MySQL',
    icon: 'Database',
    color: '#00618A',
    minutes: 10,
    lessonsCount: 2,
    description: '理解数据库、表和 SQL 的关系，熟悉 MySQL 客户端基础命令。',
    lessons: [
      {
        id: 'mysql-intro-1',
        title: '数据库、表与 SQL',
        concept: '关系型数据库基础',
        content: [
          { type: 'text', html: 'MySQL 是一种关系型数据库管理系统。你可以把<b>数据库</b>理解为一个项目的数据仓库，把<b>表</b>理解为一张结构固定的清单，把<b>SQL</b>理解为和数据库沟通的标准语言。' },
          { type: 'table', headers: ['概念', '类比', 'MySQL 中的动作'], rows: [
            ['数据库 Database', '一个项目的数据空间', '<code>CREATE DATABASE shop;</code>'],
            ['表 Table', '一张有字段的表格', '<code>CREATE TABLE users (...);</code>'],
            ['行 Row', '一条具体记录', '<code>INSERT INTO users ...</code>'],
            ['字段 Column', '表格的一列', '<code>name VARCHAR(50)</code>']
          ] },
          { type: 'tip', title: 'SQL 语句习惯', text: 'SQL 关键字通常大写，语句以分号结束。教学模拟器会兼容大小写和缺少分号，但建议从一开始养成标准写法。' }
        ],
        practice: {
          title: '查看 MySQL 环境',
          desc: '输入 mysql --version 查看版本，再输入 SHOW DATABASES; 查看当前可见的数据库。',
          commands: ['mysql --version', 'SHOW DATABASES;'],
          check: (env) => usedCommand('SHOW DATABASES', env),
          successMsg: '你已经能查看 MySQL 环境和数据库列表了。',
          hints: [
            '先输入：mysql --version',
            '再输入：SHOW DATABASES; 注意 SHOW 和 DATABASES 之间有空格'
          ]
        }
      },
      {
        id: 'mysql-intro-2',
        title: '创建并选择数据库',
        concept: 'CREATE DATABASE / USE',
        content: [
          { type: 'text', html: '在创建表之前，先要选择一个数据库。常见流程是先用 <code>CREATE DATABASE</code> 创建数据库，再用 <code>USE</code> 把后续表操作定位到这个数据库。' },
          { type: 'code', lang: 'sql', code: 'CREATE DATABASE shop;\nUSE shop;\nSELECT DATABASE();' },
          { type: 'warning', title: '没有选择数据库会怎样？', text: '如果直接创建表，MySQL 会提示 <code>No database selected</code>。这也是新手最常见的错误之一。' }
        ],
        practice: {
          title: '创建 shop 数据库',
          desc: '创建名为 shop 的数据库，切换进去，并用 SELECT DATABASE(); 确认当前数据库。',
          commands: ['CREATE DATABASE shop;', 'USE shop;', 'SELECT DATABASE();'],
          check: (env) => hasDatabase('shop', env) && usingDatabase('shop', env),
          successMsg: 'shop 数据库已经创建并选中，后续表会建立在这里。',
          hints: [
            '创建数据库：CREATE DATABASE shop;',
            '切换数据库：USE shop;',
            '确认当前库：SELECT DATABASE();'
          ]
        }
      }
    ]
  },
  {
    id: 'mysql-schema',
    index: '02',
    title: '表结构设计',
    icon: 'TableCells',
    color: '#00A3C4',
    minutes: 14,
    lessonsCount: 2,
    description: '学习字段、类型、主键、自增和表结构查看。',
    lessons: [
      {
        id: 'mysql-schema-1',
        title: '创建第一张表',
        concept: 'CREATE TABLE',
        content: [
          { type: 'text', html: '表结构决定一类数据“长什么样”。每个字段都要有名字和数据类型，常见类型包括 <code>INT</code>、<code>VARCHAR(n)</code>、<code>DECIMAL</code>、<code>DATE</code>。' },
          { type: 'code', lang: 'sql', code: 'CREATE TABLE users (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  name VARCHAR(50) NOT NULL,\n  age INT\n);' },
          { type: 'tip', title: '主键与自增', text: '<code>PRIMARY KEY</code> 表示唯一标识一行数据；<code>AUTO_INCREMENT</code> 让 id 自动从 1 递增。' }
        ],
        practice: {
          title: '创建 users 表',
          desc: '创建 shop 数据库并切换，然后创建 users 表，字段包含 id、name、age。',
          commands: [
            'CREATE DATABASE shop;',
            'USE shop;',
            'CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, age INT);',
            'SHOW TABLES;'
          ],
          check: (env) =>
            hasTable('shop', 'users', env) &&
            hasColumn('shop', 'users', 'id', env) &&
            hasColumn('shop', 'users', 'name', env) &&
            hasColumn('shop', 'users', 'age', env),
          successMsg: 'users 表创建成功，右侧数据面板已经可以看到字段结构。',
          hints: [
            '别忘了先 CREATE DATABASE shop; 再 USE shop;',
            'CREATE TABLE users (...) 里用逗号分隔字段',
            'id 字段可以写成：id INT PRIMARY KEY AUTO_INCREMENT'
          ]
        }
      },
      {
        id: 'mysql-schema-2',
        title: '查看与调整表结构',
        concept: 'DESC / ALTER TABLE',
        content: [
          { type: 'text', html: '<code>DESC 表名</code> 可以查看表字段结构。业务变化时，可以用 <code>ALTER TABLE</code> 调整表结构，例如新增邮箱字段。' },
          { type: 'code', lang: 'sql', code: 'DESC users;\nALTER TABLE users ADD COLUMN email VARCHAR(80);\nDESC users;' },
          { type: 'warning', title: '结构变更要谨慎', text: '真实生产库里，ALTER TABLE 可能锁表或耗时很久。课程中我们先掌握语法和结构影响。' }
        ],
        practice: {
          title: '为 users 添加 email 字段',
          desc: '创建 users 表后，使用 ALTER TABLE 添加 email 字段，并用 DESC users; 查看结构。',
          commands: [
            'CREATE DATABASE shop;',
            'USE shop;',
            'CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, age INT);',
            'ALTER TABLE users ADD COLUMN email VARCHAR(80);',
            'DESC users;'
          ],
          check: (env) => hasColumn('shop', 'users', 'email', env) && usedCommand('DESC users', env),
          successMsg: 'email 字段已添加，表结构变更完成。',
          hints: [
            '新增字段：ALTER TABLE users ADD COLUMN email VARCHAR(80);',
            '查看字段结构：DESC users;',
            '右侧面板可以选择 users 表观察字段变化'
          ]
        }
      }
    ]
  },
  {
    id: 'mysql-query',
    index: '03',
    title: '写入与查询',
    icon: 'Search',
    color: '#2F80ED',
    minutes: 16,
    lessonsCount: 2,
    description: '使用 INSERT 和 SELECT 完成数据写入、过滤、排序和限制结果数。',
    lessons: [
      {
        id: 'mysql-query-1',
        title: '插入多行数据',
        concept: 'INSERT INTO',
        content: [
          { type: 'text', html: '<code>INSERT INTO</code> 用于新增数据。指定字段列表时，值的顺序必须和字段顺序一致；自增 id 通常不用手动填写。' },
          { type: 'code', lang: 'sql', code: "INSERT INTO users (name, age) VALUES ('Ada', 18);\nINSERT INTO users (name, age) VALUES ('Linus', 25), ('Grace', 31);" },
          { type: 'tip', title: '字符串要加引号', text: '文本值使用单引号或双引号包起来，例如 <code>\'Ada\'</code>。数字值不需要加引号。' }
        ],
        practice: {
          title: '向 users 插入数据',
          desc: '创建 users 表后，至少插入 Ada 和 Linus 两行数据。',
          commands: [
            'CREATE DATABASE shop;',
            'USE shop;',
            'CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, age INT);',
            "INSERT INTO users (name, age) VALUES ('Ada', 18);",
            "INSERT INTO users (name, age) VALUES ('Linus', 25);",
            'SELECT * FROM users;'
          ],
          check: (env) =>
            rowCount('shop', 'users', env) >= 2 &&
            hasRow('shop', 'users', (row) => row.name === 'Ada', env) &&
            hasRow('shop', 'users', (row) => row.name === 'Linus', env),
          successMsg: '数据已经写入 users 表，面板中的行数据已变化。',
          hints: [
            "单行插入：INSERT INTO users (name, age) VALUES ('Ada', 18);",
            "再插入一行：INSERT INTO users (name, age) VALUES ('Linus', 25);",
            '用 SELECT * FROM users; 查看当前表数据'
          ]
        }
      },
      {
        id: 'mysql-query-2',
        title: '过滤、排序与限制结果',
        concept: 'SELECT / WHERE / ORDER BY / LIMIT',
        content: [
          { type: 'text', html: '<code>SELECT</code> 是查询数据的核心语句。你可以用 <code>WHERE</code> 过滤，用 <code>ORDER BY</code> 排序，用 <code>LIMIT</code> 限制返回行数。' },
          { type: 'code', lang: 'sql', code: 'SELECT * FROM users;\nSELECT name, age FROM users WHERE age >= 18 ORDER BY id DESC LIMIT 2;' },
          { type: 'table', headers: ['子句', '作用', '示例'], rows: [
            ['WHERE', '筛选满足条件的行', '<code>WHERE age >= 18</code>'],
            ['ORDER BY', '按字段排序', '<code>ORDER BY id DESC</code>'],
            ['LIMIT', '限制返回行数', '<code>LIMIT 2</code>']
          ] }
        ],
        practice: {
          title: '完成一次条件查询',
          desc: '插入多行 users 数据后，查询 age >= 18 的用户，并按 id 倒序取前 2 条。',
          commands: [
            'CREATE DATABASE shop;',
            'USE shop;',
            'CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, age INT);',
            "INSERT INTO users (name, age) VALUES ('Ada', 18), ('Linus', 25), ('Grace', 31);",
            'SELECT name, age FROM users WHERE age >= 18 ORDER BY id DESC LIMIT 2;'
          ],
          check: (env) =>
            rowCount('shop', 'users', env) >= 3 &&
            usedCommand('SELECT name, age FROM users WHERE age >= 18 ORDER BY id DESC LIMIT 2', env),
          successMsg: '你已经会写一个包含过滤、排序和分页味道的查询了。',
          hints: [
            '先保证 users 表里至少有 3 行数据',
            '查询字段可以写 name, age，不一定每次都 SELECT *',
            '完整语句：SELECT name, age FROM users WHERE age >= 18 ORDER BY id DESC LIMIT 2;'
          ]
        }
      }
    ]
  },
  {
    id: 'mysql-change',
    index: '04',
    title: '修改与删除',
    icon: 'Edit',
    color: '#6C5CE7',
    minutes: 14,
    lessonsCount: 2,
    description: '掌握 UPDATE、DELETE、TRUNCATE 的差异和安全写法。',
    lessons: [
      {
        id: 'mysql-change-1',
        title: '更新已有数据',
        concept: 'UPDATE',
        content: [
          { type: 'text', html: '<code>UPDATE</code> 用于修改已有行。入门阶段务必养成一个习惯：更新前先写好 <code>WHERE</code>，避免误改整张表。' },
          { type: 'code', lang: 'sql', code: "UPDATE users SET age = 20 WHERE name = 'Ada';\nSELECT * FROM users WHERE name = 'Ada';" },
          { type: 'warning', title: '不要忘记 WHERE', text: '<code>UPDATE users SET age = 20;</code> 会把 users 表所有人的 age 都改成 20。真实项目里这是高风险操作。' }
        ],
        practice: {
          title: '把 Ada 的年龄改为 20',
          desc: '创建并插入 users 数据后，使用 UPDATE 把 Ada 的 age 改成 20。',
          commands: [
            'CREATE DATABASE shop;',
            'USE shop;',
            'CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, age INT);',
            "INSERT INTO users (name, age) VALUES ('Ada', 18), ('Linus', 25);",
            "UPDATE users SET age = 20 WHERE name = 'Ada';",
            "SELECT * FROM users WHERE name = 'Ada';"
          ],
          check: (env) => hasRow('shop', 'users', (row) => row.name === 'Ada' && row.age === 20, env),
          successMsg: 'Ada 的 age 已更新为 20。',
          hints: [
            "更新语句：UPDATE users SET age = 20 WHERE name = 'Ada';",
            "如果没变化，先确认表里有 Ada：SELECT * FROM users;",
            'WHERE 条件决定修改哪几行'
          ]
        }
      },
      {
        id: 'mysql-change-2',
        title: '删除与清空数据',
        concept: 'DELETE / TRUNCATE',
        content: [
          { type: 'text', html: '<code>DELETE</code> 删除满足条件的行；<code>TRUNCATE TABLE</code> 清空整张表并重置自增计数。两者都会改变数据，真实环境中执行前要确认条件和备份。' },
          { type: 'code', lang: 'sql', code: "DELETE FROM users WHERE name = 'Ada';\nTRUNCATE TABLE users;" },
          { type: 'table', headers: ['语句', '影响范围', '常见用途'], rows: [
            ['DELETE ... WHERE', '满足条件的行', '删除单个用户、订单等'],
            ['DELETE FROM users', '整张表全部行', '高风险，需谨慎'],
            ['TRUNCATE TABLE users', '清空整张表并重置自增', '清理测试数据']
          ] }
        ],
        practice: {
          title: '删除一行并清空表',
          desc: '先删除 Ada，再用 TRUNCATE TABLE users; 清空 users 表。',
          commands: [
            'CREATE DATABASE shop;',
            'USE shop;',
            'CREATE TABLE users (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50) NOT NULL, age INT);',
            "INSERT INTO users (name, age) VALUES ('Ada', 18), ('Linus', 25);",
            "DELETE FROM users WHERE name = 'Ada';",
            'TRUNCATE TABLE users;',
            'SELECT * FROM users;'
          ],
          check: (env) => hasTable('shop', 'users', env) && rowCount('shop', 'users', env) === 0 && usedCommand('TRUNCATE TABLE users', env),
          successMsg: 'users 表已经清空。你能区分 DELETE 和 TRUNCATE 的使用场景了。',
          hints: [
            "删除单行：DELETE FROM users WHERE name = 'Ada';",
            '清空整张表：TRUNCATE TABLE users;',
            '右侧面板中 users 的行数据应变为空'
          ]
        }
      }
    ]
  }
]

export const mysqlStats = {
  chapters: mysqlChapters.length,
  lessons: mysqlChapters.reduce((s, c) => s + c.lessons.length, 0),
  practices: mysqlChapters.reduce((s, c) => s + c.lessons.filter((l) => l.practice).length, 0),
  quizzes: mysqlChapters.reduce((s, c) => s + c.lessons.reduce((n, l) => n + (l.quiz?.length || 0), 0), 0)
}

export type {
  MySqlChapter,
  MySqlLesson,
  MySqlPractice,
  MySqlTerminalConfig,
  MySqlQuiz,
  MySqlState,
  MySqlDatabase,
  MySqlTable,
  MySqlColumn,
  ContentBlock
} from '@/types'
