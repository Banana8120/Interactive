# Docker + Git + MySQL + JVM + JavaScript 交互式 Playground

一个纯前端的交互式 Playground。无需安装 Docker、Git、MySQL、Java 或 JavaScript 运行环境，直接在浏览器中使用模拟终端或代码编辑器，由内置模拟引擎即时反馈。

> 本项目完全在浏览器内模拟 Docker / Git / MySQL / JVM / JavaScript 行为，**不依赖任何真实后端环境**，可离线运行。

---

## ✨ 功能特性

### Docker Playground
- 输入 `docker pull`、`docker run`、`docker ps` 等命令并即时查看模拟输出。
- 右侧拓扑抽屉实时展示镜像、容器、数据卷和网络。
- 模拟状态自动保存，支持一键重置。

### Git Playground
- 支持 `git init`、`git commit`、`git branch`、`git merge`、`git rebase` 等常用命令。
- 状态抽屉展示工作区、暂存区、提交、分支、远程、标签和 stash。
- 仓库状态自动保存，刷新后继续操作。

### MySQL Playground
- 支持 `CREATE DATABASE`、`USE`、`CREATE TABLE`、`INSERT`、`SELECT`、`UPDATE`、`DELETE` 等常用语句。
- 数据抽屉实时展示当前数据库、表结构、字段约束和行数据。
- 支持命令历史、智能补全、状态保存和重置。

### JVM 内存 Playground
- 在左侧编写简化 Java，右侧即时查看执行到光标行时的内存状态。
- 方法区存储类信息、常量和静态变量，堆内存存储对象与数组。
- 每个命名线程拥有独立虚拟机栈，栈帧包含局部变量表和操作数栈。
- 支持手动 GC 和堆分配压力触发的标记-清除 GC，静态引用、局部变量与操作数引用作为根节点。
- 右侧内存视图实时展示容量、栈帧、引用关系和最近一次垃圾回收结果。

### JavaScript 执行上下文 Playground
- 在左侧编写简化 JavaScript，右侧即时查看执行到光标行时的调用栈、作用域和堆内存。
- 支持 `let`、`const`、`var`、对象/数组字面量、函数声明、函数调用、属性写入和数组下标写入。
- 对象、数组和函数对象分配在堆中，变量绑定保存基础值或堆引用。
- 函数调用会创建新的执行上下文和函数作用域，传入对象或数组时保留引用语义。
- 不执行真实 JS 代码，不接入 DOM、Node.js API、Promise 或事件循环。

### 通用能力
- **纯浏览器模拟**：不执行真实 shell 命令，也不连接本机或远程服务。
- **独立状态持久化**：五个 Playground 分别使用 `localStorage` 保存模拟状态或编辑器源码。
- **响应式 UI**：基于 Naive UI 和 xicons，适配桌面与移动浏览器。

---

## 🛠 技术栈

| 分类 | 选型 |
| --- | --- |
| 框架 | Vue 3（`<script setup>` + TypeScript） |
| 构建 | Vite 5 |
| 语言 | TypeScript 5.6 |
| UI 组件 | Naive UI + xicons（@vicons/ionicons5） |
| 路由 | Vue Router 4（hash 模式） |
| 模拟引擎 | 纯前端 JS/TS 模拟（无真实 Docker/Git/MySQL/JVM/JavaScript runtime 依赖） |
| 测试 | Vitest |

---

## 📦 目录结构

```
docker-tutorial/
├── public/
│   └── favicon.svg              # 站点 Logo（Docker 鲸鱼 + Git 徽标）
├── src/
│   ├── assets/                  # 全局样式
│   ├── components/              # 终端、代码编辑器、状态面板与可视化
│   ├── router/                  # 路由配置（hash 模式）
│   ├── terminal/                # Docker / Git / MySQL / JVM / JavaScript 模拟引擎与测试
│   ├── types/                   # 模拟状态 TypeScript 类型
│   ├── views/                   # 五个 Playground 页面
│   ├── App.vue                  # 根组件（导航 + 布局）
│   ├── main.ts                  # 入口
│   └── env.d.ts                 # 类型声明
├── index.html
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
└── package.json
```

---

## 🚀 快速开始

### 环境要求
- Node.js 18+（推荐 20+）
- 包管理器 npm

### 安装依赖
```bash
npm install
```

### 本地开发（热更新）
```bash
npm run dev
```
默认地址：`http://localhost:5173/`

### 类型检查
```bash
npm run type-check
# 或
npx vue-tsc --noEmit
```

### 单元测试
```bash
npm run test
```

### 生产构建
```bash
npm run build
```
构建产物输出到 `dist/` 目录。

### 本地预览构建产物
```bash
npm run preview
```

---

## ⚙️ 数据与状态说明

- Docker、Git、MySQL 的模拟环境以及 JVM、JavaScript 编辑器源码分别保存在浏览器 `localStorage`。
- 切换模块或刷新页面会自动恢复对应 Playground 状态。
- 点击终端或编辑器的重置按钮可清空当前模块缓存并恢复初始状态。

---

## 🚀 部署到 GitHub Pages

本项目已配置 `base: './'`（相对路径），可直接部署到 GitHub Pages 的任意子路径（如 `https://<用户名>.github.io/<仓库名>/`），资源会以 `./assets/...` 加载，无需硬编码仓库名。

> 路由采用 **hash 模式**（`createWebHashHistory`），刷新子页面不会 404，也**不需要**配置 `404.html` 或服务端重写，直接静态托管即可。

### 方式一：GitHub Actions 自动部署（推荐）
仓库已内置 `.github/workflows/deploy.yml`：
1. 将代码推送到 `main` 分支；
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；
3. 后续每次推送到 `main` 会自动构建并发布，几分钟后面板会显示访问地址。

### 方式二：手动部署
```bash
npm run build          # 产物输出到 dist/
# 将 dist/ 内容推送到 gh-pages 分支，或上传到任意静态托管
```
仓库 **Settings → Pages → Source** 选择 **Deploy from a branch**，分支选 `gh-pages`、目录选 `/ (root)`。

---

## 📄 许可

本项目用于浏览器内命令模拟与交互展示。
