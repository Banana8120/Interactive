# Docker + Git 交互式学习教程

一个纯前端的**交互式 Docker 与 Git 学习网站**。无需安装 Docker 或 Git，直接在浏览器中输入真实命令，由内置模拟引擎即时反馈执行结果，配合可视化状态面板与智能提示，边学边练。

> 本项目完全在浏览器内模拟 Docker / Git 行为，**不依赖任何真实环境**，可离线运行，适合新手入门与课堂演示。

---

## ✨ 功能特性

### Docker 学习模块
- **完整知识体系**：8 大章节，覆盖「走进 Docker → 镜像 → 容器 → Dockerfile → 数据卷 → 网络 → Compose → 实战」。
- **模拟终端实操**：输入 `docker pull` / `docker run` / `docker ps` 等真实命令，即时查看模拟输出。
- **拓扑可视化面板**：右侧悬浮抽屉实时展示镜像、容器、数据卷、网络拓扑，命令执行同步刷新。
- **当前练习**：每节配套练习任务，自动检测完成状态，卡住时给出分级提示。

### Git 学习模块
- **参考 Gitee Git 大全**：8 大章节，覆盖「入门与配置 → 第一次提交 → 暂存区 → 撤销回退 → 分支 → 远程 → 标签 → 进阶」。
- **模拟仓库实操**：`git init` / `git commit` / `git branch` / `git merge` / `git rebase` 等命令真实可用。
- **仓库状态面板**：悬浮抽屉展示本地/远程、工作区/暂存区/版本库、分支、提交、标签、Stash 等。
- **智能纠错与提示**：错误命令自动分析，连续出错时触发「卡住」线索，并逐条展开分级提示。

### 通用能力
- **进度持久化**：学习进度、练习完成、测验结果、各课时模拟环境状态均缓存在 `localStorage`，刷新不丢失。
- **总进度看板**：合并 Docker + Git 双模块统计，提供章节完成度、下一步推荐、最近学习位置。
- **响应式 UI**：基于 Element Plus，支持明暗内容展示，适配桌面浏览器。

---

## 🛠 技术栈

| 分类 | 选型 |
| --- | --- |
| 框架 | Vue 3（`<script setup>` + TypeScript） |
| 构建 | Vite 5 |
| 语言 | TypeScript 5.6 |
| UI 组件 | Element Plus + @element-plus/icons-vue |
| 状态管理 | Pinia |
| 路由 | Vue Router 4（hash 模式） |
| 模拟引擎 | 纯前端 JS/TS 模拟（无真实 Docker/Git 依赖） |

---

## 📦 目录结构

```
docker-tutorial/
├── public/
│   └── favicon.svg              # 站点 Logo（Docker 鲸鱼 + Git 徽标）
├── src/
│   ├── assets/                  # 全局样式
│   ├── components/              # 复用组件（终端、状态面板、任务面板、可视化等）
│   ├── data/                    # 课程数据（lessons.ts / gitLessons.ts）
│   ├── router/                  # 路由配置（hash 模式）
│   ├── stores/                  # Pinia 状态（进度、Git 进度）
│   ├── terminal/                # Docker / Git 模拟引擎
│   ├── types/                   # 全局 TypeScript 类型定义
│   ├── views/                   # 页面视图（首页、课程、章节、进度等）
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

## 📚 学习路径

1. 打开首页，选择 **Docker 学习** 或 **Git 学习**。
2. 按章节顺序阅读讲解，在「模拟终端」中敲入对应命令。
3. 执行命令后，右侧状态面板会实时反映当前环境（容器/镜像/分支/提交等）。
4. 完成每节的「当前练习」即可自动记录进度，进度看板会推荐下一节。

---

## ⚙️ 数据与状态说明

- 所有模拟环境状态、学习进度均保存在浏览器 `localStorage`，清除浏览器数据会重置进度。
- 进入任意课时会自动恢复该课时缓存的模拟环境；点击「重置练习」可清空缓存回到初始状态。

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

本项目用于学习演示，课程内容参考《Docker 从入门到实践》与 Gitee Git 大全的公开知识体系。
