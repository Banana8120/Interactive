# 模拟终端 Playground 精简设计

## 目标

将项目从课程学习网站精简为 Docker、Git、MySQL 三个独立的浏览器内模拟 Playground。最终界面只保留模块切换导航、模拟终端和状态交互视图，不再包含课程目录、章节、课时正文、练习、测验、完成进度或教学导航。

## 路由与应用壳层

- `/` 展示 Docker Playground。
- `/git` 展示 Git Playground。
- `/mysql` 展示 MySQL Playground。
- 旧 Docker 章节和课时地址重定向到 `/`。
- 旧 Git 课时地址重定向到 `/git`。
- 旧 MySQL 课时地址重定向到 `/mysql`。
- 顶部仅保留三个模块的切换导航，移除学习进度环和百分比。
- 移除课程化页脚，主内容区域用于展示 Playground。

## Playground 页面

三个 Playground 页面均使用最大宽度 1200px 的居中布局，不显示面包屑、课程标题、正文卡片、任务提示、测验、完成按钮或上下节导航。

### Docker

- 保留 `SimulatedTerminal`、`DockerVisualizer` 和 `DockerStatePanel`。
- 终端快照继续驱动 Docker 状态视图刷新。
- 使用固定状态作用域 `docker-playground` 保存和恢复模拟环境。

### Git

- 保留 `GitTerminal` 和 `GitStatePanel`。
- 每次命令执行后刷新状态面板并保存仓库状态。
- 使用固定状态作用域 `git-playground`。

### MySQL

- 保留 `MySQLTerminal` 和 `MySQLStatePanel`。
- 每次命令执行后刷新数据面板并保存数据库状态。
- 使用固定状态作用域 `mysql-playground`。

三个终端均不再接收课程建议命令。用户通过 `help`、命令历史和终端自身的补全能力操作。重置操作继续使用确认对话框，确认后清理当前 Playground 的缓存并恢复模拟器初始状态。

## 删除范围

- 删除 `src/data/` 下的 Docker、Git、MySQL 课程数据。
- 删除 `src/stores/` 下的三个学习进度 Store。
- 删除现有课程首页、章节页和课时页。
- 删除 `LessonContent`、`QuizCard`、`DockerTaskPanel`、`GitTaskPanel`、`MySQLTaskPanel`。
- 从 `src/types/index.ts` 删除课程内容、章节、课时、练习、测验和课程统计类型，保留 Docker、Git、MySQL 模拟状态类型。
- 移除应用中的进度 Store 引用；若 Pinia 不再有其他引用，则从入口、依赖清单和锁文件中移除 Pinia。
- 删除 `docs/course-authoring.md`，并更新 `AGENTS.md`、`README.md`、`docs/architecture.md` 与 `docs/development.md`，使仓库说明只描述 Playground、模拟器和交互视图。

历史 localStorage 中的学习进度键不再读取，但不主动删除用户浏览器中的旧数据。模拟环境继续使用现有版本化存储格式，只把作用域从课时 id 固定为 Playground id。

## 数据流与错误处理

命令由对应终端组件交给浏览器内模拟器执行。执行结果回传页面，页面刷新状态视图并保存当前模块状态。未知或不支持的命令继续由模拟器返回教学友好的错误信息；重置失败时不覆盖当前界面状态。

## 验证

- 检查 `/`、`/git`、`/mysql` 均只展示终端和状态交互视图。
- 检查旧章节及课时地址重定向到对应 Playground。
- 检查三个模块的命令执行、状态视图刷新、状态恢复和重置。
- 搜索并确认源码中不存在课程数据、练习、测验或学习进度引用。
- 运行 `npm run type-check` 和 `npm run build`。
