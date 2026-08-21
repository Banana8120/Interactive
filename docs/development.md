# Development Guide

这份文档记录本项目的开发、验证和调试流程。

## 环境要求

- Node.js 18+，推荐 Node.js 20+
- npm

安装依赖：

```bash
npm install
```

CI 使用 `npm ci`，本地也可以在需要完全复现锁文件时使用。

## 常用脚本

```bash
npm run dev
npm run type-check
npm run test
npm run build
npm run preview
```

说明：

- `npm run dev`：启动 Vite 开发服务器，默认端口 `5173`。
- `npm run type-check`：运行 `vue-tsc --noEmit`。
- `npm run test`：运行 Vitest 单元测试，当前覆盖 JVM 源码解析、目标行执行、内存分配、线程隔离、GC、JavaScript 执行上下文模拟和持久化。
- `npm run build`：先类型检查，再执行 Vite 生产构建。
- `npm run preview`：本地预览 `dist/` 产物。

提交前建议至少运行：

```bash
npm run type-check
npm run test
npm run build
```

## 目录职责

```text
src/
  assets/       全局样式
  components/   Docker / Git / MySQL 终端、代码编辑器、状态面板和可视化
  router/       Vue Router 配置
  terminal/     Docker / Git / MySQL / JVM / JavaScript 模拟引擎与测试
  types/        模拟环境共享 TypeScript 类型
  views/        五个 Playground 页面
```

## 编码约定

- Vue 组件使用 `<script setup lang="ts">`。
- 路径别名使用 `@/...`，不要写过深的相对路径。
- 页面文案以中文为主，保持具体、友好、少术语堆叠。
- xicons 图标别名已全局注册，不需要在每个组件单独注册图标组件；新增图标先在 `src/icons/xicons.ts` 映射。
- 样式优先放在组件 scoped 样式内；跨组件基础样式放到 `src/assets/main.css`。
- 不要修改生成产物 `dist/`，构建会重新生成。
- 不要依赖真实 Docker/Git/MySQL/JVM/JavaScript runtime，新增行为应在 `src/terminal/` 内模拟。

## 本地调试要点

### 模拟环境不符合预期

五个 Playground 使用 localStorage 恢复模拟状态或编辑器源码。终端/编辑器重置按钮会清理当前模块缓存，也可以在浏览器开发者工具中检查这些 key：

- `docker-sim-state-v1-docker-playground`
- `git-sim-state-v1-git-playground`
- `mysql-sim-state-v1-mysql-playground`
- `jvm-editor-source-v1-jvm-playground`
- `javascript-editor-source-v1-javascript-playground`
- `docker-viz-panel-open`
- `git-state-panel-open`
- `mysql-state-panel-open`

### Docker 状态没有刷新

检查 `SimulatedTerminal.vue` 是否在命令执行后触发了：

- `command-executed`
- `snapshot-synced`

父组件 `DockerPlaygroundView.vue` 依赖 `snapshot-synced` 更新 Docker 拓扑快照并保存状态。

### Git 状态面板没有刷新

检查 `GitPlaygroundView.vue` 的 `checkTick` 是否递增。`GitStatePanel.vue` 通过 `checkTick` 重新读取 `getGitState()`。

### MySQL 数据面板没有刷新

检查 `MySQLPlaygroundView.vue` 的 `checkTick` 是否递增。`MySQLStatePanel.vue` 通过 `checkTick` 重新读取 `getMySqlState()`。

### JVM 内存视图没有刷新

检查 `JvmPlaygroundView.vue` 是否在源码或光标行变化后调用 `parseJvmSource()` 和 `executeJvmSource()`。内存面板只接收执行器返回的快照，不直接修改模拟器状态。

### JavaScript 执行上下文没有刷新

检查 `JavaScriptPlaygroundView.vue` 是否在源码或光标行变化后调用 `parseJavaScriptSource()` 和 `executeJavaScriptSource()`。执行上下文面板只接收执行器返回的快照，不直接执行用户源码。

### 新增命令后 Tab 补全缺失

补全候选不在模拟器中：

- Docker：`src/components/SimulatedTerminal.vue`
- Git：`src/components/GitTerminal.vue`
- MySQL：`src/components/MySQLTerminal.vue`

新增 Docker/Git/MySQL 命令时，同步更新补全、help 文本和对应状态面板。新增 JVM 或 JavaScript 语法时，同步更新对应 parser、executor、编辑器高亮和测试。

## 修改 UI 的注意事项

- `App.vue` 控制全局导航和五个模块的背景，改动时检查 Docker、Git、MySQL、JVM 与 JavaScript 五条路由。
- 五个 Playground 的内容最大宽度为 1200px。JVM 和 JavaScript 桌面布局保留左侧编辑器弹性宽度，右侧面板固定 460px；窄屏切换为单列。
- 右侧抽屉是 fixed 定位，注意不要和顶部 header、移动端宽度冲突。

## 修改模拟器的注意事项

模拟器应根据当前状态生成输出，不要为单个命令流程写死结果。

Docker 模拟器维护：

- 镜像库
- 容器列表
- 卷列表
- 网络列表
- 命令历史
- Dockerfile / Compose 的内置示例文件

Git 模拟器维护：

- 初始化状态
- 用户配置
- 工作区
- 暂存区
- 提交图
- 分支、标签、远程
- stash、reflog
- 合并、cherry-pick 等临时状态

MySQL 模拟器维护：

- 连接状态
- 当前数据库
- 数据库列表
- 表结构字段
- 表行数据
- 命令历史

JVM 模拟器维护：

- 简化 Java 源码结构和行级诊断
- 从空状态执行到目标光标行的确定性流程
- 方法区类信息、常量和静态变量
- 每线程独立栈及栈帧
- 堆对象、数组和跨区域引用
- 标记-清除 GC 与最近一次回收统计
- 内存容量、分配计数器和最近一次 GC 统计

JavaScript 模拟器维护：

- 简化 JavaScript 源码结构和行级诊断
- 从空状态执行到目标光标行的确定性流程
- 调用栈、全局作用域和函数作用域
- 对象、数组、函数对象和引用关系
- `let`、`const`、`var` 变量绑定与 const 重新赋值诊断
- localStorage 中的编辑器源码，不持久化派生执行快照

新增状态字段后，记得更新 `src/types/index.ts`，并确认 localStorage 恢复旧数据时不会崩溃。

## 发布

GitHub Pages 发布由 `.github/workflows/deploy.yml` 处理。推送到 `main` 会构建并部署 `dist/`。

项目依赖：

- `vite.config.ts` 的 `base: './'`
- Vue Router hash 模式

这两个配置共同保证静态托管子路径可用。
