# AGENTS.md

本文件只放本仓库的核心协作约定。具体架构和调试流程请优先查看 `docs/`。

## 项目定位

这是一个纯前端的 Docker + Git + MySQL 模拟终端、JVM 代码编辑器与 JavaScript 执行上下文 Playground。

- Docker/Git/MySQL：在浏览器内模拟真实风格命令、状态变化和可视化面板。
- JVM：解析简化 Java 源码，并在浏览器内模拟方法区、线程私有栈、共享堆、引用关系与标记-清除 GC。
- JavaScript：解析简化 JS 源码，并在浏览器内模拟调用栈、作用域、堆对象和引用关系。
- 不接入真实 Docker、Git、MySQL、JVM、JavaScript runtime、shell、后端服务或远程命令执行。
- 保持中文、具体、友好的界面语气。

## 必读文档

- `docs/architecture.md`：应用结构、路由、模块数据流、持久化和部署模型。
- `docs/development.md`：开发、验证、调试、发布和 UI 修改注意事项。

## 常用命令

```bash
npm install
npm run dev
npm run lint
npm run format:check
npm run type-check
npm run test
npm run build
npm run preview
```

在 Windows PowerShell 执行脚本受限时，用 `npm.cmd run ...`。

验证代码改动时至少运行：

```bash
npm run type-check
npm run test
npm run lint
npm run format:check
npm run build
```

## 核心文件

- `src/main.ts`：应用入口，安装 Router、Naive UI，并全局注册 xicons 图标别名。
- `src/App.vue`：全局壳层、顶部模块导航和页面布局。
- `src/router/index.ts`：hash 路由配置。
- `src/types/index.ts`：Docker、Git、MySQL、JVM、JavaScript 模拟状态共享类型。
- `src/terminal/`：Docker/Git/MySQL/JVM/JavaScript 浏览器内模拟引擎。
- `src/components/`：终端、代码编辑器、状态面板和内存/拓扑/执行上下文可视化组件。
- `src/views/`：Docker、Git、MySQL、JVM、JavaScript 五个 Playground 页面。

## 开发约定

- 使用 Vue 3 `<script setup lang="ts">`，样式优先 scoped CSS。
- 使用 `@/...` 路径别名。
- 不修改 `dist/` 或 `node_modules/` 作为源码。
- 五个 Playground 的固定状态作用域必须稳定，修改时考虑旧 localStorage 的兼容性。
- 扩展共享状态字段时，先更新 `src/types/index.ts`，再更新模拟器、状态面板和持久化逻辑。
- `vite.config.ts` 的 `base: './'` 与 hash 路由用于静态托管子路径，除非部署目标变化不要改。

## 改动提醒

- 修改 Docker/Git/MySQL 模拟命令时，同步检查 help、Tab 补全、状态持久化和状态面板；修改 JVM 或 JavaScript 简化语法时同步检查解析器、执行器、编辑器诊断和对应可视化面板。
- 五个模块的 localStorage 状态彼此独立，不要混用固定 Playground id。
- localStorage 会缓存模拟环境或编辑器源码；调试异常时先检查对应 key 或使用终端/编辑器重置按钮。
