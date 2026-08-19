# Architecture

本项目是一个无后端的 Vue 3 单页应用。所有 Docker / Git / MySQL 行为都在浏览器内由 TypeScript 模拟；页面只负责展示课程、接收输入、更新模拟状态和记录学习进度。

## 技术栈

- Vue 3 + `<script setup>` + TypeScript
- Vite 5
- Vue Router 4，hash 模式
- Pinia
- Naive UI + xicons（`@vicons/ionicons5`）
- localStorage 持久化

## 应用入口

`src/main.ts` 创建应用实例，并安装：

- Pinia：学习进度存储
- Router：页面路由
- Naive UI：UI 组件、中文语言包与离散消息/对话框 API
- xicons / `@vicons/ionicons5`：通过 `src/icons/xicons.ts` 全局注册图标别名后可在模板中直接使用

`src/App.vue` 是全局壳层，负责：

- 顶部导航：Docker 学习、Git 学习、MySQL 学习
- 根据当前路由显示 Docker、Git 或 MySQL 内容
- 统一主内容区域和页脚

## 路由结构

路由定义在 `src/router/index.ts`：

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | `HomeView.vue` | Docker 课程首页 |
| `/chapter/:chapterId` | `ChapterView.vue` | Docker 章节页 |
| `/lesson/:lessonId` | `LessonView.vue` | Docker 课时页 |
| `/git` | `GitHomeView.vue` | Git 课程首页 |
| `/git/lesson/:lessonId` | `GitLessonView.vue` | Git 课时页 |
| `/mysql` | `MySQLHomeView.vue` | MySQL 课程首页 |
| `/mysql/lesson/:lessonId` | `MySQLLessonView.vue` | MySQL 课时页 |

项目使用 `createWebHashHistory()`，适合静态托管。刷新子页面不会请求服务端重写。

## 课程数据模型

Docker 课程在 `src/data/lessons.ts`，导出 `chapters` 和 `stats`。

Git 课程在 `src/data/gitLessons.ts`，导出 `gitChapters` 和 `gitStats`。

MySQL 课程在 `src/data/mysqlLessons.ts`，导出 `mysqlChapters` 和 `mysqlStats`。

共享类型在 `src/types/index.ts`：

- `Chapter` / `Lesson` / `Practice` / `Quiz`
- `GitChapter` / `GitLesson` / `GitPractice`
- `MySqlChapter` / `MySqlLesson` / `MySqlPractice`
- `DockerEnv`
- `GitState`
- `MySqlState`
- 内容块 `ContentBlock`

课程页会把章节列表拍平成课时列表，然后根据路由参数定位当前课时和上下节。

## Docker 模块数据流

Docker 课时页：`src/views/LessonView.vue`

主要链路：

1. 页面根据 `lessonId` 找到当前 Docker 课时。
2. 进入课时时调用 `loadDockerState(lesson.id)` 尝试恢复本课时模拟环境。
3. 调用 `restoreBaseImages()` 补回课程内置镜像，避免上一课时的 `rmi` 污染后续课程。
4. 用户在 `SimulatedTerminal.vue` 输入命令。
5. 终端调用 `executeCommand(input)`。
6. Docker 模拟器更新内部状态并返回输出。
7. 终端调用 `getEnvironment()`，通过 `snapshot-synced` 把环境快照发给父组件。
8. 父组件把快照传给 `DockerStatePanel.vue` / `DockerVisualizer.vue`。
9. `DockerTaskPanel.vue` 通过 `practice.check(getEnvironment())` 检测任务是否完成。
10. 完成后写入 `useProgressStore()`。

Docker 模拟器核心 API：

- `executeCommand(rawInput)`
- `getEnvironment()`
- `resetEnvironment()`
- `saveDockerState(lessonId)`
- `loadDockerState(lessonId)`
- `clearDockerState(lessonId)`
- `restoreBaseImages()`

## Git 模块数据流

Git 课时页：`src/views/GitLessonView.vue`

主要链路：

1. 页面根据 `lessonId` 找到当前 Git 课时。
2. 进入课时时调用 `loadGitState(lesson.id)` 尝试恢复本课时仓库；无缓存则 `resetGitEnvironment()`。
3. 用户在 `GitTerminal.vue` 输入命令。
4. 终端调用 `executeGitCommand(input)`。
5. Git 模拟器更新内部 `state` 并返回输出。
6. 页面增加 `checkTick`，触发任务面板和状态面板刷新。
7. `GitTaskPanel.vue` 通过 `practice.check(getGitState())` 检测任务是否完成。
8. `GitStatePanel.vue` 通过 `getGitState()` 和 `getStatusMap()` 展示工作区、暂存区、提交、分支、远程和 stash。
9. 完成后写入 `useGitProgressStore()`。

Git 模拟器核心 API：

- `executeGitCommand(rawInput)`
- `getGitState()`
- `getStatusMap(customState?)`
- `resetGitEnvironment()`
- `saveGitState(lessonId)`
- `loadGitState(lessonId)`
- `clearGitState(lessonId)`

## MySQL 模块数据流

MySQL 课时页：`src/views/MySQLLessonView.vue`

主要链路：

1. 页面根据 `lessonId` 找到当前 MySQL 课时。
2. 进入课时时调用 `loadMySqlState(lesson.id)` 尝试恢复本课时数据库；无缓存则 `resetMySqlEnvironment()`。
3. 用户在 `MySQLTerminal.vue` 输入 SQL 或 MySQL 客户端命令。
4. 终端调用 `executeMySqlCommand(input)`。
5. MySQL 模拟器更新内部 `state` 并返回 MySQL CLI 风格输出。
6. 页面增加 `checkTick`，触发任务面板和数据面板刷新。
7. `MySQLTaskPanel.vue` 通过 `practice.check(getMySqlState())` 检测任务是否完成。
8. `MySQLStatePanel.vue` 通过 `getMySqlState()` 展示连接状态、当前数据库、表结构和行数据。
9. 完成后写入 `useMySqlProgressStore()`。

MySQL 模拟器核心 API：

- `executeMySqlCommand(rawInput)`
- `getMySqlState()`
- `resetMySqlEnvironment()`
- `saveMySqlState(lessonId)`
- `loadMySqlState(lessonId)`
- `clearMySqlState(lessonId)`

当前 MySQL 模拟器是教学级 SQL 解析器，覆盖 `SHOW`、`CREATE DATABASE`、`USE`、`CREATE TABLE`、`DESC`、`INSERT`、`SELECT`、`UPDATE`、`DELETE`、`ALTER TABLE ADD`、`DROP`、`TRUNCATE` 等入门语句，不承担完整 SQL 引擎职责。

## 持久化

| Key | 位置 | 内容 |
| --- | --- | --- |
| `docker-tutorial-progress-v1` | `src/stores/progress.ts` | Docker 完成课时、章节、测验、提示、最近访问 |
| `git-tutorial-progress-v1` | `src/stores/gitProgress.ts` | Git 完成课时、提示、最近访问 |
| `mysql-tutorial-progress-v1` | `src/stores/mysqlProgress.ts` | MySQL 完成课时、提示、最近访问 |
| `docker-sim-state-v1-${lessonId}` | `src/terminal/simulator.ts` | 每个 Docker 课时的容器、卷、网络、计数器 |
| `git-sim-state-v1-${lessonId}` | `src/terminal/gitSimulator.ts` | 每个 Git 课时的仓库状态 |
| `mysql-sim-state-v1-${lessonId}` | `src/terminal/mysqlSimulator.ts` | 每个 MySQL 课时的数据库、表结构和行数据 |
| `docker-viz-panel-open` | `DockerStatePanel.vue` | Docker 抽屉展开状态 |
| `git-state-panel-open` | `GitStatePanel.vue` | Git 抽屉展开状态 |
| `mysql-state-panel-open` | `MySQLStatePanel.vue` | MySQL 数据面板展开状态 |

调试课程时，如果任务明明改对但 UI 不符合预期，优先检查 localStorage 缓存。

## 部署模型

`vite.config.ts` 使用：

```ts
base: './'
```

这让静态资源以相对路径加载，可以部署到 GitHub Pages 的任意仓库子路径。

`.github/workflows/deploy.yml` 在推送到 `main` 后运行：

1. `npm ci`
2. `npm run build`
3. 上传 `dist`
4. 部署到 GitHub Pages

除非部署目标明确变化，不要修改 `base` 和 hash 路由模式。
