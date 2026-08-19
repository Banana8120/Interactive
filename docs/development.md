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
npm run build
npm run preview
```

说明：

- `npm run dev`：启动 Vite 开发服务器，默认端口 `5173`。
- `npm run type-check`：运行 `vue-tsc --noEmit`。
- `npm run build`：先类型检查，再执行 Vite 生产构建。
- `npm run preview`：本地预览 `dist/` 产物。

提交前建议至少运行：

```bash
npm run type-check
npm run build
```

## 目录职责

```text
src/
  assets/       全局样式
  components/   复用组件：终端、任务面板、状态面板、内容渲染、测验等
  data/         Docker / Git / MySQL 课程数据
  router/       Vue Router 配置
  stores/       Pinia 学习进度
  terminal/     Docker / Git / MySQL 模拟引擎
  types/        共享 TypeScript 类型
  views/        页面视图
```

## 编码约定

- Vue 组件使用 `<script setup lang="ts">`。
- 路径别名使用 `@/...`，不要写过深的相对路径。
- 页面文案以中文为主，保持教学友好、具体、少术语堆叠。
- xicons 图标别名已全局注册，不需要在每个组件单独注册图标组件；新增图标先在 `src/icons/xicons.ts` 映射。
- 样式优先放在组件 scoped 样式内；跨组件基础样式放到 `src/assets/main.css`。
- 不要修改生成产物 `dist/`，构建会重新生成。
- 不要依赖真实 Docker/Git/MySQL，新增行为应在 `src/terminal/` 内模拟。

## 本地调试要点

### 课程进度或环境不符合预期

项目大量使用 localStorage。页面重置按钮会清理当前课时缓存，但有时也需要在浏览器开发者工具里手动清理这些 key：

- `docker-tutorial-progress-v1`
- `git-tutorial-progress-v1`
- `mysql-tutorial-progress-v1`
- `docker-sim-state-v1-${lessonId}`
- `git-sim-state-v1-${lessonId}`
- `mysql-sim-state-v1-${lessonId}`
- `docker-viz-panel-open`
- `git-state-panel-open`
- `mysql-state-panel-open`

### Docker 课时状态没有刷新

检查 `SimulatedTerminal.vue` 是否在命令执行后触发了：

- `command-executed`
- `snapshot-synced`

父组件 `LessonView.vue` 依赖这些事件更新 `checkTick`、错误次数和 Docker 拓扑快照。

### Git 状态面板没有刷新

检查 `GitLessonView.vue` 的 `checkTick` 是否递增。`GitStatePanel.vue` 通过 `checkTick` 重新读取 `getGitState()`。

### MySQL 数据面板没有刷新

检查 `MySQLLessonView.vue` 的 `checkTick` 是否递增。`MySQLStatePanel.vue` 通过 `checkTick` 重新读取 `getMySqlState()`。

### 新增命令后 Tab 补全缺失

补全候选不在模拟器中：

- Docker：`src/components/SimulatedTerminal.vue`
- Git：`src/components/GitTerminal.vue`
- MySQL：`src/components/MySQLTerminal.vue`

新增命令时，同步更新补全、help 文本和相关课程建议命令。

## 修改 UI 的注意事项

- `App.vue` 控制全局导航和当前模块进度展示，改动时检查 Docker、Git 与 MySQL 三种状态。
- 课时页桌面端使用两栏布局，右侧终端 sticky；移动端切换为单列。
- 右侧抽屉是 fixed 定位，注意不要和顶部 header、移动端宽度冲突。
- `LessonContent.vue` 渲染课程内容块，如果新增内容块类型，需要同时改类型、渲染和样式。

## 修改模拟器的注意事项

模拟器应尽量根据当前状态生成输出，不要为单个课程写死结果。

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

新增状态字段后，记得更新 `src/types/index.ts`，并确认 localStorage 恢复旧数据时不会崩溃。

## 发布

GitHub Pages 发布由 `.github/workflows/deploy.yml` 处理。推送到 `main` 会构建并部署 `dist/`。

项目依赖：

- `vite.config.ts` 的 `base: './'`
- Vue Router hash 模式

这两个配置共同保证静态托管子路径可用。
