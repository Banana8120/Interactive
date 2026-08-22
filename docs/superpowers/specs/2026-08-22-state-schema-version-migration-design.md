# Docker / Git / MySQL 状态 schemaVersion 与迁移设计

## 背景

Docker、Git、MySQL 三个模拟器都会把状态保存到 localStorage。当前保存格式没有顶层 `schemaVersion`，其中 Git 还会直接把解析后的对象赋给运行状态。后续如果状态字段改名、嵌套结构变化或旧缓存缺字段，老用户刷新页面时可能出现状态异常，严重时导致页面白屏。

本轮目标是给三套命令式模拟器补稳定的状态版本与迁移入口，让旧缓存能被兼容加载，坏缓存能安全失败并回到初始状态。

## 方案

不修改现有 localStorage key，避免一次升级让用户缓存全部失效。

新保存格式采用统一外壳：

```ts
{
  schemaVersion: 1,
  state: ...
}
```

三套模块各自增加迁移入口：

- Docker：`migrateDockerState(saved)`
- Git：`migrateGitState(saved)`
- MySQL：`migrateMySqlState(saved)`

加载逻辑：

1. 读取 localStorage 原始 JSON。
2. 如果有 `schemaVersion` 与 `state`，按对应版本迁移。
3. 如果没有 `schemaVersion`，按旧版 `v0` 裸状态迁移。
4. 如果 JSON 解析失败、结构完全不合法或迁移失败，`load...State()` 返回 `false`，页面保持现有 reset 兜底流程。

## 模块细节

### Docker

旧格式是 `{ images, containers, volumes, networks, counters }`。新格式把这个对象放到 `state` 下。

迁移时：

- `images` 必须是对象，否则使用基准镜像库。
- `containers`、`volumes` 使用数组兜底。
- `networks` 使用数组兜底；缺失时恢复 `bridge / host / none`。
- `counters` 缺字段时补默认计数器。

### Git

旧格式是完整 Git 状态对象。新格式把 Git 状态放到 `state` 下。

迁移时：

- 缺失的顶层字段从 `createState()` 补齐。
- `branches`、`commits`、`tags`、`staged`、`workdir`、`remotes` 必须是对象，否则使用默认值。
- `stash`、`reflog`、`worktrees` 必须是数组，否则使用空数组。
- `head` 不存在于 `branches` 时回退到 `master`。
- `detached`、`mergeState`、`cherryPickState`、`bisectState` 使用安全默认值。

### MySQL

旧格式是完整 MySQL 状态对象。新格式把 MySQL 状态放到 `state` 下。

迁移时复用并收紧现有 normalize 逻辑：

- `connected` 默认 `true`。
- `currentDatabase` 无效时置为 `null`。
- 系统库 `information_schema` 与 `mysql` 始终保留。
- 数据库、表、字段、行数据类型不合法时跳过或使用安全默认值。
- `history` 限制为最近 80 条。

## 测试

扩展现有三套回归测试：

- 新格式保存时包含 `schemaVersion: 1`。
- 旧无版本缓存可以正常加载。
- 坏缓存不会污染当前运行状态，`load...State()` 返回 `false`。
- Git 特别覆盖：旧缓存缺字段时能补默认字段，不直接裸赋值。

## 文档

同步更新：

- `docs/architecture.md` 的持久化说明，注明 Docker/Git/MySQL 状态带 `schemaVersion` 并支持旧缓存迁移。
- `docs/development.md` 的调试提示，说明遇到状态异常优先检查 schemaVersion 和迁移结果。

## 校验

实现后运行：

```bash
npm run test
npm run type-check
npm run lint
npm run build
```

`format:check` 当前可能因既有格式差异失败，本轮不做全项目格式化。
