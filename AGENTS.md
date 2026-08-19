# AGENTS.md

本文件只放本仓库的核心协作约定。具体实现细节、课程编写方法和调试流程请优先查看 `docs/`。

## 项目定位

这是一个纯前端的 Docker + Git + MySQL 交互式学习网站。

- Docker/Git/MySQL：在浏览器内模拟真实风格命令、状态变化、练习校验和可视化面板。
- 不接入真实 Docker、Git、MySQL、shell、后端服务或远程命令执行。
- 面向零基础学习者，保持中文、具体、友好的教学语气。

## 必读文档

- `docs/architecture.md`：应用结构、路由、模块数据流、持久化和部署模型。
- `docs/development.md`：开发、验证、调试、发布和 UI 修改注意事项。
- `docs/course-authoring.md`：新增课程、练习、测验、模拟命令和 Web 标准检查写法。

## 常用命令

```bash
npm install
npm run dev
npm run type-check
npm run build
npm run preview
```

在 Windows PowerShell 执行脚本受限时，用 `npm.cmd run ...`。

验证代码改动时至少运行：

```bash
npm run type-check
npm run build
```

## 核心文件

- `src/main.ts`：应用入口，安装 Pinia、Router、Naive UI，并全局注册 xicons 图标别名。
- `src/App.vue`：全局壳层、顶部导航、模块进度环和页面布局。
- `src/router/index.ts`：hash 路由配置。
- `src/types/index.ts`：课程、模拟环境、Git/MySQL 状态等共享类型。
- `src/data/`：Docker、Git、MySQL 课程数据。
- `src/stores/`：各模块学习进度和 localStorage 持久化。
- `src/terminal/`：Docker/Git/MySQL 浏览器内模拟引擎。
- `src/components/`：终端、任务面板、状态面板、内容渲染、测验等复用组件。
- `src/views/`：首页、章节页和课时页。

## 开发约定

- 使用 Vue 3 `<script setup lang="ts">`，样式优先 scoped CSS。
- 使用 `@/...` 路径别名。
- 不修改 `dist/` 或 `node_modules/` 作为源码。
- 课程、章节、课时、练习 id 必须稳定且唯一。
- 课程内容中的 `v-html` 只放静态可信内容，不放用户输入或接口返回。
- 扩展共享字段时，先更新 `src/types/index.ts`，再更新对应渲染、校验和持久化逻辑。
- `vite.config.ts` 的 `base: './'` 与 hash 路由用于静态托管子路径，除非部署目标变化不要改。

## 改动提醒

- 修改 Docker/Git/MySQL 模拟命令时，同步检查课程数据、练习校验、help 文本、Tab 补全和状态面板；细节见 `docs/course-authoring.md`。
- 各模块进度存储彼此独立：Docker、Git、MySQL 不要混用 store。
- localStorage 会缓存进度和模拟环境；调试异常时先检查对应 key 或使用页面重置按钮。
