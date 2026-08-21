# LICENSE 文件补齐设计

## 背景

README 已有“许可”章节，但仓库根目录没有 `LICENSE` 文件，且 README 没有明确写出使用的开源协议。对于准备公开发布的仓库，这会让使用者无法明确判断复制、修改、分发和再发布权限。

## 方案

采用 MIT License。

新增与更新：

- 新增根目录 `LICENSE`，使用标准 MIT License 文本。
- README “许可”章节改为明确说明项目使用 MIT License，并链接到 `LICENSE`。

## 边界

本轮只补许可证文件与 README 说明，不改源码、构建配置、依赖或发布流程。

## 校验

实现后检查：

```bash
git status --short
git diff --check
```

许可证补齐不涉及运行时代码，不需要重新运行测试或构建。
