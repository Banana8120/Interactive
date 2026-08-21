# MySQL 聚合与 GROUP BY 查询增强设计

## 背景

MySQL 模拟器当前已经支持 `SELECT ... FROM ... WHERE ... ORDER BY ... LIMIT ...` 的轻量查询子集，但字段列表只能是 `*` 或普通列名。作为教学 Playground，下一步需要支持常见分析查询：统计数量、求和、平均值、最小值、最大值，以及按单个字段分组。

本轮只增强 MySQL 模拟器，不引入真实 SQL 引擎，不影响 Docker、Git、JVM 或 JavaScript 模块。

## 方案

在 `src/terminal/mysqlSimulator.ts` 的 `SELECT` 路径内扩展解析与执行：

- 字段列表支持普通列与聚合表达式混用。
- 支持聚合函数：`COUNT(*)`、`COUNT(column)`、`SUM(column)`、`AVG(column)`、`MIN(column)`、`MAX(column)`。
- `SELECT` 尾部新增 `GROUP BY column`。
- 子句顺序固定为：`WHERE -> GROUP BY -> ORDER BY -> LIMIT`。
- 无 `GROUP BY` 且包含聚合函数时，整张过滤后的结果集作为一个分组。
- 有 `GROUP BY` 时，按分组字段拆分结果集，每组输出一行。
- `ORDER BY` 可按普通输出列、分组字段或聚合表达式排序。
- `LIMIT` 继续作用于最终输出行。

## 边界

第一版不支持：

- `HAVING`
- `AS` 别名
- 多字段 `GROUP BY`
- `DISTINCT`
- 表达式计算，例如 `SUM(price * quantity)`
- `JOIN`
- 子查询

如果用户输入超出子集，返回 MySQL 风格语法错误，并在提示里给出当前支持的示例。

## 数据与输出规则

聚合输出列名直接使用表达式原文的大写函数名，例如：

- `COUNT(*)`
- `SUM(age)`
- `AVG(age)`

聚合数值规则：

- `COUNT(*)` 统计分组内全部行。
- `COUNT(column)` 统计该字段非 `NULL` 的行。
- `SUM` / `AVG` 只接受数值字段；遇到非数值或字段不存在时报错。
- `MIN` / `MAX` 使用现有 `compareValues` 规则比较。
- 空结果集的非分组聚合返回一行统计结果；例如 `COUNT(*)` 为 `0`，其他聚合为 `NULL`。

## 测试

扩展 `src/terminal/mysqlSimulator.test.ts`：

- `COUNT(*)` 与 `COUNT(column)`。
- `SUM`、`AVG`、`MIN`、`MAX`。
- `GROUP BY` 单字段分组。
- `WHERE + GROUP BY + ORDER BY + LIMIT` 组合。
- 聚合字段不存在或非数值时返回错误。

## 文档与帮助

同步更新：

- `mysqlHelp()` 示例，加入聚合和 `GROUP BY`。
- `docs/architecture.md` 的 MySQL 覆盖范围说明。

## 校验

实现后运行：

```bash
npm run test
npm run type-check
npm run build
npm run lint
```

`format:check` 当前已知会因为既有文件格式失败，本轮不做全项目格式化。
