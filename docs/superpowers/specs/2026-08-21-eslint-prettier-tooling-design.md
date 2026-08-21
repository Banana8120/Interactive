# ESLint 与 Prettier 工具链设计

## 背景

项目当前是 Vue 3 + TypeScript + Vite 单页应用，已有 `type-check`、`test`、`build`，但没有 ESLint 或 Prettier 配置。需要新增代码质量检查和格式化工具，服务后续 JVM、JavaScript、Docker、Git、MySQL Playground 的持续开发。

## 方案

采用 ESLint 9 flat config 与 Prettier 3。

新增配置：

- `eslint.config.js`：使用 flat config，覆盖 `.ts`、`.vue`、`.js` 文件。
- `.prettierrc.json`：定义统一格式风格。
- `.prettierignore`：忽略构建产物、依赖目录、覆盖率和临时文件。

新增脚本：

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix",
"format": "prettier . --write",
"format:check": "prettier . --check"
```

依赖建议：

- `eslint`
- `@eslint/js`
- `typescript-eslint`
- `eslint-plugin-vue`
- `vue-eslint-parser`
- `prettier`
- `eslint-config-prettier`

## 配置边界

ESLint 负责代码质量与 Vue/TypeScript 常见问题；Prettier 负责格式。通过 `eslint-config-prettier` 关闭与格式相关的 ESLint 规则，避免两个工具互相拉扯。

第一版不全量格式化现有源码，避免产生大量纯格式 diff。只新增配置、脚本和必要依赖，并保证命令可运行。

## 校验

实现后运行：

```bash
npm run lint
npm run format:check
npm run type-check
npm run test
npm run build
```

如果 `lint` 或 `format:check` 因既有代码风格产生大量问题，优先调整配置边界；不在同一提交中做全项目格式化。
