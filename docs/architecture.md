# Architecture

本项目是一个无后端的 Vue 3 单页应用。所有 Docker、Git、MySQL、JVM、JavaScript 行为都在浏览器内模拟；页面负责接收命令或简化源码、刷新交互视图并保存模拟环境或源码。

## 技术栈

- Vue 3 + `<script setup>` + TypeScript
- Vite 5
- Vue Router 4，hash 模式
- Naive UI + xicons（`@vicons/ionicons5`）
- localStorage 持久化

## 应用入口

`src/main.ts` 创建应用实例，并安装：

- Router：页面路由
- Naive UI：UI 组件、中文语言包与离散消息/对话框 API
- xicons / `@vicons/ionicons5`：通过 `src/icons/xicons.ts` 全局注册图标别名后可在模板中直接使用

`src/App.vue` 是全局壳层，负责：

- 顶部导航：Docker、Git、MySQL、JVM、JavaScript Playground
- 根据当前路由显示对应模拟终端、代码编辑器与交互视图
- 统一主内容区域和模块背景

## 路由结构

路由定义在 `src/router/index.ts`：

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | `DockerPlaygroundView.vue` | Docker 模拟终端与拓扑视图 |
| `/git` | `GitPlaygroundView.vue` | Git 模拟终端与仓库状态视图 |
| `/mysql` | `MySQLPlaygroundView.vue` | MySQL 模拟终端与数据视图 |
| `/jvm` | `JvmPlaygroundView.vue` | 简化 Java 编辑器与 JVM 内存结构视图 |
| `/javascript` | `JavaScriptPlaygroundView.vue` | 简化 JavaScript 编辑器与执行上下文视图 |
| 旧版深层地址 | 重定向 | 跳转到对应模块的 Playground |

项目使用 `createWebHashHistory()`，适合静态托管。刷新子页面不会请求服务端重写。

## Docker 模块数据流

Docker 页面：`src/views/DockerPlaygroundView.vue`

主要链路：

1. 页面以 `docker-playground` 为固定作用域恢复模拟环境，无缓存时重置为初始状态。
2. 用户在 `SimulatedTerminal.vue` 输入命令，终端调用 `executeCommand(input)`。
3. 模拟器更新状态并返回输出。
4. 终端通过 `snapshot-synced` 把环境快照传给页面。
5. 页面刷新 `DockerStatePanel.vue` / `DockerVisualizer.vue` 并保存状态。

Docker 模拟器核心 API：

- `executeCommand(rawInput)`
- `getEnvironment()`
- `resetEnvironment()`
- `saveDockerState(workspaceId)`
- `loadDockerState(workspaceId)`
- `clearDockerState(workspaceId)`

## Git 模块数据流

Git 页面：`src/views/GitPlaygroundView.vue`

主要链路：

1. 页面以 `git-playground` 为固定作用域恢复仓库，无缓存时调用 `resetGitEnvironment()`。
2. 用户在 `GitTerminal.vue` 输入命令，终端调用 `executeGitCommand(input)`。
3. Git 模拟器更新内部状态并返回输出。
4. 页面递增 `checkTick`，让 `GitStatePanel.vue` 重新读取仓库状态。
5. 页面保存当前 Playground 的仓库状态。

Git 模拟器核心 API：

- `executeGitCommand(rawInput)`
- `getGitState()`
- `getStatusMap(customState?)`
- `resetGitEnvironment()`
- `saveGitState(workspaceId)`
- `loadGitState(workspaceId)`
- `clearGitState(workspaceId)`

## MySQL 模块数据流

MySQL 页面：`src/views/MySQLPlaygroundView.vue`

主要链路：

1. 页面以 `mysql-playground` 为固定作用域恢复数据库，无缓存时调用 `resetMySqlEnvironment()`。
2. 用户在 `MySQLTerminal.vue` 输入 SQL 或 MySQL 客户端命令。
3. MySQL 模拟器更新内部状态并返回 MySQL CLI 风格输出。
4. 页面递增 `checkTick`，让 `MySQLStatePanel.vue` 重新读取数据库状态。
5. 页面保存当前 Playground 的数据库状态。

MySQL 模拟器核心 API：

- `executeMySqlCommand(rawInput)`
- `getMySqlState()`
- `resetMySqlEnvironment()`
- `saveMySqlState(workspaceId)`
- `loadMySqlState(workspaceId)`
- `clearMySqlState(workspaceId)`

当前 MySQL 模拟器是轻量 SQL 解析器，覆盖 `SHOW`、`CREATE DATABASE`、`USE`、`CREATE TABLE`、`DESC`、`INSERT`、`SELECT`、`WHERE`、`GROUP BY`、`ORDER BY`、`LIMIT`、`COUNT/SUM/AVG/MIN/MAX`、`UPDATE`、`DELETE`、`ALTER TABLE ADD`、`DROP`、`TRUNCATE` 等常用语句，不承担完整 SQL 引擎职责。

## JVM 模块数据流

JVM 页面：`src/views/JvmPlaygroundView.vue`

主要链路：

1. 页面以 `jvm-playground` 为固定作用域恢复简化 Java 源码，无缓存时使用内置示例。
2. 用户在 `JvmCodeEditor.vue` 编辑源码或移动光标，页面防抖约 300ms。
3. `parseJvmSource(source)` 把源码转换为带行号的类、字段、线程和语句模型。
4. `executeJvmSource(program, targetLine)` 从空状态确定性执行到目标行，返回内存快照和中文诊断。
5. 页面把不可变快照交给 `JvmMemoryPanel.vue`；源码自动保存，派生内存状态不持久化。
6. `gc()` 或堆分配压力执行标记-清除：静态变量和所有活动栈帧中的引用是 GC Root，对象字段及引用数组继续传递可达性。

JVM 核心模块：

- `jvmSourceParser.ts`：简化 Java 扫描、解析、格式化和行级语法诊断。
- `jvmSourceExecutor.ts`：目标行执行、作用域、类型检查、对象/数组分配和运行诊断。
- `jvmMemoryEngine.ts`：内存结构、容量统计、堆容量检查和标记-清除 GC。
- `jvmSourceStorage.ts`：编辑器默认源码和 localStorage 持久化。

内存隔离规则：方法区和堆对全部线程共享；每个线程拥有容量独立的虚拟机栈；栈帧局部变量表与操作数栈只由当前活动线程的栈顶帧直接修改。引用只能指向仍存在的堆条目。

## JavaScript 模块数据流

JavaScript 页面：`src/views/JavaScriptPlaygroundView.vue`

主要链路：

1. 页面以 `javascript-playground` 为固定作用域恢复简化 JavaScript 源码，无缓存时使用内置示例。
2. 用户在 `JavaScriptCodeEditor.vue` 编辑源码或移动光标，页面防抖约 300ms。
3. `parseJavaScriptSource(source)` 把源码转换为带行号的变量声明、函数声明、函数调用和赋值模型。
4. `executeJavaScriptSource(program, targetLine)` 从空状态确定性执行到目标行，返回调用栈、作用域、堆和引用关系快照。
5. 页面把不可变快照交给 `JavaScriptExecutionPanel.vue`；源码自动保存，派生执行状态不持久化。

JavaScript 核心模块：

- `javascriptSourceParser.ts`：简化 JavaScript 解析、格式化和行级语法诊断。
- `javascriptSourceExecutor.ts`：目标行执行、变量绑定、函数调用、对象/数组分配和运行诊断。
- `javascriptMemoryModel.ts`：执行上下文、作用域、堆条目、引用边和展示格式化。
- `javascriptSourceStorage.ts`：编辑器默认源码和 localStorage 持久化。

第一版只模拟教学子集，不执行真实 JavaScript，不接入 DOM、Node.js API、Promise、setTimeout 或事件循环。对象、数组和函数对象只存在于堆中；变量绑定保存基础值或堆引用。函数调用会创建新的执行上下文和函数作用域，函数返回后调用帧移除。

## 持久化

| Key | 位置 | 内容 |
| --- | --- | --- |
| `docker-sim-state-v1-docker-playground` | `src/terminal/simulator.ts` | Docker 镜像、容器、卷、网络和计数器 |
| `git-sim-state-v1-git-playground` | `src/terminal/gitSimulator.ts` | Git 仓库状态 |
| `mysql-sim-state-v1-mysql-playground` | `src/terminal/mysqlSimulator.ts` | MySQL 数据库、表结构和行数据 |
| `jvm-editor-source-v1-jvm-playground` | `src/terminal/jvmSourceStorage.ts` | JVM 编辑器中的简化 Java 源码 |
| `javascript-editor-source-v1-javascript-playground` | `src/terminal/javascriptSourceStorage.ts` | JavaScript 编辑器中的简化 JS 源码 |
| `docker-viz-panel-open` | `DockerStatePanel.vue` | Docker 抽屉展开状态 |
| `git-state-panel-open` | `GitStatePanel.vue` | Git 抽屉展开状态 |
| `mysql-state-panel-open` | `MySQLStatePanel.vue` | MySQL 数据面板展开状态 |

调试状态恢复问题时，优先检查对应 localStorage 缓存或使用终端/编辑器的重置按钮。

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
