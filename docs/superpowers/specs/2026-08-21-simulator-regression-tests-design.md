# Docker / Git / MySQL 模拟器回归测试设计

## 背景

项目已经有 JVM 与 JavaScript 的解析器、执行器和持久化测试，但 Docker、Git、MySQL 三个命令式模拟器还没有单元测试。这三个模块交互面大、命令分支多，后续继续扩展 SQL、控制流或可视化时容易出现回归。

本轮目标是先补基础测试护栏，不扩展 Docker、Git 或 MySQL 的功能语义。

## 方案

新增三组 Vitest 测试：

- `src/terminal/simulator.test.ts`：覆盖 Docker 模拟器核心路径。
- `src/terminal/gitSimulator.test.ts`：覆盖 Git 模拟器核心路径。
- `src/terminal/mysqlSimulator.test.ts`：覆盖 MySQL 模拟器核心路径。

每个测试用例先调用对应 reset 函数，确保模拟状态彼此隔离。断言以稳定状态和关键输出片段为主，不绑定完整 CLI 表格文案，避免测试过脆。

## 覆盖范围

Docker 第一版覆盖：

- `docker pull`
- `docker run`
- `docker ps`
- `docker stop`
- `docker rm`
- `docker volume create`
- `docker network create`
- `resetEnvironment`

Git 第一版覆盖：

- `git init`
- `git add`
- `git commit`
- `git branch`
- `git checkout`
- `git merge`
- `git status`
- `resetGitEnvironment`

MySQL 第一版覆盖：

- `CREATE DATABASE`
- `USE`
- `CREATE TABLE`
- `INSERT`
- `SELECT`
- `UPDATE`
- `DELETE`
- `ALTER TABLE ADD`
- `DROP TABLE`
- `resetMySqlEnvironment`

## 非目标

本轮不新增 SQL 功能，不补 JOIN、GROUP BY、聚合函数、事务、索引或外键；不新增 Docker/Git 命令；不重构模拟器内部结构。

如果测试过程中发现真实 bug，只做保持既有语义的最小修复，并在提交说明中点明。

## 校验

实现后运行：

```bash
npm run test
npm run type-check
npm run build
```

如果时间允许，也运行：

```bash
npm run lint
```

`format:check` 已知会因为既有文件未格式化失败，本轮不做全项目格式化。
