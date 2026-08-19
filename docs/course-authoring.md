# Course Authoring Guide

这份文档说明如何维护 Docker / Git / MySQL 课程、练习、测验和模拟命令。

## 课程文件

- Docker：`src/data/lessons.ts`
- Git：`src/data/gitLessons.ts`
- MySQL：`src/data/mysqlLessons.ts`
- 类型：`src/types/index.ts`

Docker 导出：

```ts
export const chapters: Chapter[] = [...]
export const stats: CourseStats = chapters.reduce(...)
```

Git 导出：

```ts
export const gitChapters: GitChapter[] = [...]
export const gitStats = {...}
```

MySQL 导出：

```ts
export const mysqlChapters: MySqlChapter[] = [...]
export const mysqlStats = {...}
```

## 章节与课时结构

章节字段：

```ts
{
  id: 'intro',
  index: '01',
  title: '走进 Docker',
  icon: 'Box',
  color: '#2496ED',
  minutes: 30,
  lessonsCount: 3,
  description: '...',
  lessons: []
}
```

课时字段：

```ts
{
  id: 'intro-1',
  title: '为什么需要 Docker',
  concept: '镜像与容器',
  content: [],
  terminal: {
    enabled: true,
    task: '输入 docker --version 查看版本',
    commands: ['docker --version', 'docker info']
  },
  practice: {
    title: '体验一下环境',
    desc: '输入 docker --version 和 docker info。',
    commands: ['docker --version', 'docker info'],
    check: (env) => env?.history?.includes('docker --version'),
    successMsg: '你已经完成环境体验。',
    hints: ['先输入 docker --version', '再输入 docker info']
  },
  quiz: []
}
```

注意：

- `id` 必须唯一且稳定。它会用于路由、进度和模拟状态缓存。
- Docker 章节需要维护 `lessonsCount` 与 `lessons.length` 一致。
- Git 章节的 `lessonsCount` 是可选字段，但保持一致会更好读。
- MySQL 章节的 `lessonsCount` 是可选字段，建议保持与 `lessons.length` 一致。
- `icon` 使用 `src/icons/xicons.ts` 中注册的图标别名，图标来自 xicons / `@vicons/ionicons5`。

## 内容块

`LessonContent.vue` 当前支持这些 `ContentBlock.type`：

| type | 字段 | 说明 |
| --- | --- | --- |
| `text` | `html` | 段落 HTML |
| `code` | `lang`, `code`, `hideCopy` | 代码块 |
| `tip` | `title`, `text` | 成功色提示 |
| `warning` | `title`, `text` | 警告提示 |
| `table` | `headers`, `rows` | 表格 |
| `list` | `items` | 列表 |

示例：

```ts
content: [
  { type: 'text', html: '<p>镜像是只读模板，容器是运行实例。</p>' },
  { type: 'code', lang: 'bash', code: 'docker images' },
  { type: 'tip', title: '记忆方法', text: '先有镜像，再有容器。' },
  {
    type: 'table',
    headers: ['命令', '作用'],
    rows: [['<code>docker ps</code>', '查看运行中的容器']]
  }
]
```

安全约定：

- `html`、表格单元格和列表项会经过 `v-html` 渲染，只放静态课程内容。
- 不要把用户输入、接口返回或不可信文本放进这些字段。

## Docker 练习校验

Docker 练习的 `check` 接收 `DockerEnv`：

```ts
check: (env) => {
  return !!env?.containers?.some((c) => c.image === 'nginx:latest' && c.status === 'running')
}
```

常用字段：

- `env.images`
- `env.containers`
- `env.volumes`
- `env.networks`
- `env.history`

如果校验依赖新状态，先确认 `src/terminal/simulator.ts` 的 `getEnvironment()` 已暴露该状态。

当前 Docker 模拟器覆盖的命令族包括：

- 镜像：`images`、`image ls`、`search`、`pull`、`rmi`、`tag`、`build`、`history`、`save`、`load`、`image prune`
- 容器：`run`、`create`、`ps`、`container ls`、`start`、`stop`、`restart`、`kill`、`pause`、`unpause`、`rm`、`container prune`
- 容器检查与文件：`logs`、`exec`、`inspect`、`stats`、`port`、`cp`、`top`、`diff`、`rename`、`commit`
- 资源：`volume ls/create/inspect/rm/prune`、`network ls/create/inspect/connect/disconnect/rm/prune`
- 系统与编排：`system df`、`system prune`、`prune`、`compose up/down/ps/logs/config/build/stop`

## Git 练习校验

Git 练习的 `check` 接收 `GitState`，也可在文件中使用 `getGitState()`：

```ts
check: (state) => {
  return state?.initialized &&
    state.config.user.name &&
    state.config.user.email
}
```

常用字段：

- `state.initialized`
- `state.config.user`
- `state.branches`
- `state.commits`
- `state.staged`
- `state.workdir`
- `state.remotes`
- `state.stash`
- `state.tags`

如果状态面板也要展示新状态，更新 `GitStatePanel.vue`。

当前 Git 模拟器覆盖的命令族包括：

- 基础：`init`、`config`、`status`、`add`、`commit`、`log`、`diff`
- 分支历史：`branch`、`checkout`、`switch`、`merge`、`rebase`、`tag`
- 远程：`remote`、`fetch`、`push`、`pull`、`clone`
- 撤销清理：`stash`、`reset`、`restore`、`revert`、`clean`
- 文件与追踪：`rm`、`mv`、`show`、`grep`、`blame`
- 进阶维护：`cherry-pick`、`reflog`、`shortlog`、`archive`、`worktree`、`bisect`、`gc`、`fsck`

## MySQL 练习校验

MySQL 练习的 `check` 接收 `MySqlState`，也可在文件中使用 `getMySqlState()`：

```ts
check: (state) => {
  return !!state?.databases.shop?.tables.users &&
    state.currentDatabase === 'shop'
}
```

常用字段：

- `state.connected`
- `state.currentDatabase`
- `state.databases`
- `database.tables`
- `table.columns`
- `table.rows`
- `state.history`

如果数据面板也要展示新状态，更新 `MySQLStatePanel.vue`。

当前 MySQL 模拟器覆盖的语句包括：

- 客户端：`mysql --version`、`mysql -u root -p`、`help`、`clear`、`exit`
- 数据库：`SHOW DATABASES`、`CREATE DATABASE`、`DROP DATABASE`、`USE`、`SELECT DATABASE()`
- 表结构：`CREATE TABLE`、`SHOW TABLES`、`DESC` / `DESCRIBE`、`ALTER TABLE ... ADD COLUMN`、`DROP TABLE`
- 数据：`INSERT INTO ... VALUES`、`SELECT ... FROM ... WHERE ... ORDER BY ... LIMIT`、`UPDATE ... SET ... WHERE`、`DELETE FROM ... WHERE`、`TRUNCATE TABLE`

这是教学级解析器，不支持完整 SQL 方言、JOIN、子查询、事务、索引优化器或真实权限系统。新增课程时优先使用已支持的入门语句。

## 测验

测验结构：

```ts
quiz: [
  {
    question: '镜像和容器的关系是什么？',
    options: ['镜像是运行实例', '容器是镜像运行起来的实例', '二者完全相同'],
    answer: 1,
    explain: '镜像是只读模板，容器是基于镜像创建并运行的实例。'
  }
]
```

`answer` 是从 0 开始的选项索引。

Docker 测验结果会记录到 `useProgressStore().quizResults`。当前 Git 课时页面没有渲染 Git 测验卡；如果要给 Git 加测验统计，需要同步修改 Git 课时页和进度记录策略。

## 新增 Docker 命令

1. 在 `src/terminal/simulator.ts` 中找到 `runDocker(args)`。
2. 添加新的 `case`，并实现对应函数。
3. 如果是子命令，更新对应分发函数，例如 `dockerImageSub()`、`dockerContainerSub()`、`dockerVolume()`、`dockerNetwork()`、`dockerSystem()` 或 `runCompose()`。
4. 更新帮助文本。
5. 更新 `src/components/SimulatedTerminal.vue` 的补全候选。
6. 在课程的 `terminal.commands` 或 `practice.commands` 中加入建议命令。
7. 写一个能根据 `getEnvironment()` 判断完成的 `practice.check`。
8. 运行 `npm run type-check` 和 `npm run build`。

## 新增 Git 命令

1. 在 `src/terminal/gitSimulator.ts` 中找到 `runGit(args)`。
2. 添加新的子命令分支。
3. 必要时更新 `KNOWN_SUBS`、拼写纠错和 `gitHelp()`。
4. 更新 `src/components/GitTerminal.vue` 的 `GIT_SUBS` 补全候选。
5. 如果新命令改变状态结构，更新 `GitState` 类型和 `GitStatePanel.vue`。
6. 在课程的 `practice.commands` 中加入建议命令。
7. 写一个能根据 `GitState` 判断完成的 `practice.check`。
8. 运行 `npm run type-check` 和 `npm run build`。

## 新增 MySQL 语句

1. 在 `src/terminal/mysqlSimulator.ts` 中找到 `runSql(raw)`。
2. 添加新的语句分发和实现函数。
3. 更新 `mysqlHelp()` 的示例。
4. 更新 `src/components/MySQLTerminal.vue` 的 `baseCommands` 补全候选。
5. 如果新语句改变状态结构，更新 `MySqlState` 类型和 `MySQLStatePanel.vue`。
6. 在课程的 `practice.commands` 中加入建议 SQL。
7. 写一个能根据 `MySqlState` 判断完成的 `practice.check`。
8. 运行 `npm run type-check` 和 `npm run build`。

## 内容质量检查

新增或修改课程后，逐项检查：

- 首页统计是否正确。
- 章节页是否显示正确课时数和练习标签。
- 课时页是否能进入、上一节/下一节是否正确。
- 终端建议命令是否能运行。
- 连续错误两次后是否出现第一条提示。
- 练习完成后是否自动标记完成。
- 刷新页面后当前课时模拟状态是否恢复。
- 重置当前练习后状态是否清空。
- `npm run type-check` 通过。
- `npm run build` 通过。
